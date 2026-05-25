import { execa } from "execa";
import { defineTool } from "./define.js";
import { resolveSecurePath, checkPermission } from "./security.js";

/**
 * Tool for automatically analyzing Python .pyc files to extract constants,
 * names, and structure. Essential for crypto challenges where RSA parameters
 * are embedded in compiled Python bytecode.
 */
export const PycAnalyzeTool = defineTool({
  id: "pyc-analyze",
  description:
    "Analyze a Python .pyc (compiled bytecode) file. Extracts constants (co_consts), names (co_names), and structure. " +
    "Ideal for crypto challenges where RSA parameters (p, q, e, n, c) are stored in .pyc files. " +
    "Returns a structured summary of all extracted values.",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path to the .pyc file to analyze",
      },
      mode: {
        type: "string",
        description:
          "Analysis mode: 'constants' (default) extracts constants and names, " +
          "'full' also includes disassembly, 'decompile' attempts full decompilation",
        enum: ["constants", "full", "decompile"],
      },
    },
    required: ["filePath"],
  },
  execute: async (args, ctx) => {
    const permDenied = await checkPermission(ctx, "pyc-analyze", args.filePath);
    if (permDenied) return permDenied;

    const mode = args.mode || "constants";

    // Build the Python analysis script
    const analysisScript = `
import sys
import json

try:
    from xdis import load_module
    HAS_XDIS = True
except ImportError:
    HAS_XDIS = False

try:
    import marshal
    import struct
    HAS_MARSHAL = True
except ImportError:
    HAS_MARSHAL = False

def analyze_pyc(filepath, mode):
    result = {"file": filepath, "status": "ok"}

    if HAS_XDIS:
        try:
            version, timestamp, magic_int, co, is_pypy, source_size, sip_hash = load_module(filepath)
            result["python_version"] = f"{version[0]}.{version[1]}.{version[2]}"

            # Extract constants
            consts = []
            for c in co.co_consts:
                if isinstance(c, (int, float, str, bytes, bool, type(None))):
                    consts.append(repr(c))
                elif isinstance(c, tuple):
                    consts.append(tuple(repr(x) for x in c))
                elif isinstance(c, bytes):
                    consts.append(f"bytes({len(c)}): {c[:64].hex()}")
                else:
                    consts.append(f"<{type(c).__name__}>")

            result["constants"] = consts
            result["names"] = list(co.co_names)

            # Identify crypto-relevant values
            crypto_keywords = ['p', 'q', 'e', 'n', 'c', 'flag', 'key', 'iv', 'ct', 'pt', 'pub', 'pri', 'modulus', 'cipher']
            crypto_vars = {}
            for name in co.co_names:
                if name.lower() in crypto_keywords or name in crypto_keywords:
                    crypto_vars[name] = "present"

            # Look for large integers that are likely RSA parameters
            large_ints = []
            for c in co.co_consts:
                if isinstance(c, int) and c > 10000:
                    large_ints.append({"value": str(c), "bit_length": c.bit_length()})

            if large_ints:
                result["large_integers"] = large_ints
            if crypto_vars:
                result["crypto_variables"] = crypto_vars

            # Identify imports for context
            import_names = []
            for name in co.co_names:
                if name in ('gmpy2', 'Crypto', 'binascii', 'hashlib', 'base64', 'struct',
                            ' sympy', 'math', 'random', 'os', 'sys'):
                    import_names.append(name)
            if import_names:
                result["imports"] = import_names

            if mode == "full":
                import dis, io
                buf = io.StringIO()
                dis.dis(co, file=buf)
                disasm = buf.getvalue()
                # Limit disassembly output
                if len(disasm) > 4000:
                    disasm = disasm[:4000] + "\\n...(truncated)"
                result["disassembly"] = disasm

            return result

        except Exception as e:
            result["xdis_error"] = str(e)

    # Fallback: try raw marshal
    if HAS_MARSHAL:
        try:
            with open(filepath, 'rb') as f:
                magic = f.read(4)
                result["magic_bytes"] = magic.hex()
                flags = struct.unpack('<I', f.read(4))[0]
                result["flags"] = flags
                # Skip timestamp/hash and size
                if flags & 0x1:  # hash-based
                    f.read(8)
                else:  # timestamp-based
                    f.read(8)
                code = marshal.loads(f.read())

                consts = []
                for c in code.co_consts:
                    if isinstance(c, (int, float, str, bool, type(None))):
                        consts.append(repr(c))
                    elif isinstance(c, tuple):
                        consts.append(tuple(repr(x) for x in c))
                    else:
                        consts.append(f"<{type(c).__name__}>")
                result["constants"] = consts
                result["names"] = list(code.co_names)

                large_ints = []
                for c in code.co_consts:
                    if isinstance(c, int) and c > 10000:
                        large_ints.append({"value": str(c), "bit_length": c.bit_length()})
                if large_ints:
                    result["large_integers"] = large_ints

            result["status"] = "ok"
            return result
        except Exception as e:
            result["marshal_error"] = str(e)
            result["status"] = "error"
            return result

    result["status"] = "error"
    result["error"] = "Neither xdis nor marshal could parse the file"
    return result

output = analyze_pyc(r"""${args.filePath.replace(/"/g, '\\"')}""", "${mode}")
print(json.dumps(output, indent=2, ensure_ascii=False))
`;

    try {
      const pythonCmd = process.platform === "win32" ? "python" : "python3";
      const result = await execa(pythonCmd, ["-c", analysisScript], {
        cwd: ctx.workingDir,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });

      const output = result.stdout || "(no output)";

      // Try to detect flags in the output
      const flagMatch = output.match(/flag\{[^}]+\}/gi);
      const flagNote = flagMatch
        ? `\n\n⚠ FLAG DETECTED IN CONSTANTS: ${flagMatch.join(", ")}`
        : "";

      // Add a helpful summary
      let summary = output;
      try {
        const parsed = JSON.parse(output);
        if (parsed.large_integers && parsed.large_integers.length > 0) {
          summary += "\n\n## Crypto Analysis Summary\n";
          summary += `Found ${parsed.large_integers.length} large integer(s) that may be RSA parameters.\n`;
          if (parsed.names) {
            const hasPQ = parsed.names.includes("p") && parsed.names.includes("q");
            const hasE = parsed.names.includes("e");
            const hasC = parsed.names.includes("c");
            if (hasPQ) summary += "- ✓ Found p, q primes (direct factorization possible)\n";
            if (hasE) summary += "- ✓ Found public exponent e\n";
            if (hasC) summary += "- ✓ Found ciphertext c\n";
            if (hasPQ && hasE && hasC) {
              summary += "- ★ This is a standard RSA decryption challenge: m = pow(c, pow(e, -1, (p-1)*(q-1)), p*q)\n";
            }
          }
        }
      } catch {
        // JSON parse failed, just return raw output
      }

      return { output: summary + flagNote };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const combined = [e.stdout, e.stderr].filter(Boolean).join("\n");
      return {
        output: combined || e.message || "Python .pyc analysis failed",
        error: true,
      };
    }
  },
});
