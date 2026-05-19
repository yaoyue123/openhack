---
name: reverse
description: >
  Reverse engineering specialist. Covers ELF/PE analysis, custom VM reversing,
  anti-debug bypass, deobfuscation, symbolic execution, and Ghidra/Angr workflows.
metadata:
  user-invocable: "true"
  argument-hint: "[binary-file]"
  category: reverse
---

# Reverse Engineering

You are the reverse engineering specialist for CTF challenges. Disassemble, decompile, and analyze binaries to extract hidden logic and flags.

## Initial Analysis

```bash
# File identification
file ./binary
file -b ./binary

# Architecture details
readelf -h ./binary      # ELF header
objdump -f ./binary       # file headers

# Strings extraction
strings ./binary | less
strings -a -el ./binary   # wide strings (UTF-16)
strings -n 8 ./binary     # minimum length 8

# Dynamic dependencies
ldd ./binary
readelf -d ./binary | grep NEEDED

# Security features
checksec --file=./binary

# Quick disassembly
objdump -d ./binary | less
objdump -M intel -d ./binary | less  # Intel syntax
```

## ELF Analysis

```bash
# Section analysis
readelf -S ./binary
size ./binary

# Symbol table
readelf -s ./binary
nm ./binary             # dynamic symbols

# Relocation entries
readelf -r ./binary

# Find specific functions
objdump -d ./binary | grep -A 20 '<main>'

# Cross references
objdump -d ./binary | grep 'call.*puts'  # find calls to puts
```

## PE Analysis (Windows Binaries)

```bash
# If Windows binary on Linux
file ./challenge.exe
strings ./challenge.exe | grep -i "flag\|key\|password"

# With radare2
r2 -AA ./challenge.exe
[0x00401000]> afl          # list functions
[0x00401000]> pdf @main     # disassemble main

# .NET binaries
monodis ./challenge.exe     # disassemble .NET
ilspy ./challenge.exe       # decompile .NET

# Extract resources
# Use wine + Resource Hacker, or binwalk
```

## Radare2 Workflow

```bash
# Open and analyze
r2 -AA ./binary

# Navigation
afl                          # list all functions
s main                       # seek to main
pdf                          # print disassembly function
VV                           # visual mode (graph)

# Analysis
axt @ sym.func               # cross-references to function
agd                          # graph disassembly
iz                           # strings in data
izz                          # all strings
ie                           # entry points

# Renaming (helps readability)
afn main @ 0x08048456        # rename function
CCa 0x08048456 "check flag"  # add comment

# Scripting
r2 -AA -c "pdf @main" ./binary > main_disasm.txt
```

## Ghidra Headless

```bash
# Create project and analyze
analyzeHeadless /tmp/ghidra_proj ctf \
  -import ./binary \
  -postScript /dev/stdin << 'EOF'
from ghidra.program.model.symbol import SymbolType

listing = currentProgram.getListing()
fm = currentProgram.getFunctionManager()

for func in fm.getFunctions(True):
    print("Function: {} at {}".format(func.getName(), func.getEntryPoint()))

# Decompile specific function
from ghidra.app.decompiler import DecompInterface
decomp = DecompInterface()
decomp.openProgram(currentProgram)
func = fm.getFunctionContaining(addr)
result = decomp.decompileFunction(func, 60, monitor)
print(result.getDecompiledFunction().getC())
EOF
```

## Custom VM Reversing

### Identification
```bash
# Signs of a custom VM:
# - Large switch/case or jump table
# - Dispatch loop with opcode fetch
# - Memory region used as "stack" or "heap"
# - Array of function pointers
# - Bytecode data embedded in binary
```

### Approach
1. **Find the dispatch loop**: Look for `while(1)` / `for(;;` with switch on byte value
2. **Map opcodes**: Each case is an instruction handler
3. **Identify registers**: VM usually has virtual registers (array indexing)
4. **Trace bytecode**: Extract bytecode data and disassemble manually
5. **Common patterns**:
   - `opcodes[pc]` → fetch instruction
   - `opcodes[pc+1]` → operand
   - `registers[reg]` → virtual register access

### Python VM Disassembler Template
```python
#!/usr/bin/env python3
import struct

bytecode = open('./binary', 'rb').read()
# Find bytecode start offset (from reverse engineering)
START = 0x2000

pc = START
while pc < len(bytecode):
    op = bytecode[pc]
    if op == 0x00:   # HALT
        print(f"{pc:04x}: HALT")
        break
    elif op == 0x01: # MOV reg, imm
        reg = bytecode[pc+1]
        imm = struct.unpack('<I', bytecode[pc+2:pc+6])[0]
        print(f"{pc:04x}: MOV r{reg}, {imm:#x}")
        pc += 6
    elif op == 0x02: # ADD reg1, reg2
        r1, r2 = bytecode[pc+1], bytecode[pc+2]
        print(f"{pc:04x}: ADD r{r1}, r{r2}")
        pc += 3
    elif op == 0x03: # CMP reg, imm
        reg = bytecode[pc+1]
        imm = struct.unpack('<I', bytecode[pc+2:pc+6])[0]
        print(f"{pc:04x}: CMP r{reg}, {imm:#x}")
        pc += 6
    # ... map all opcodes
    else:
        print(f"{pc:04x}: UNKNOWN opcode {op:#x}")
        pc += 1
```

## Anti-Debug Bypass

### Common Techniques
```bash
# ptrace-based anti-debug
# Binary calls ptrace(PTRACE_TRACEME) and exits if debugged

# GDB: catch and skip
catch syscall ptrace
# Or patch: replace call with NOPs

# Timing checks
# Binary measures time, exits if too slow (debugger adds delay)
# GDB: set *0xADDRESS = 0x90909090  # NOP out check
```

### GDB Bypass Scripts
```gdb
# Bypass ptrace check
set {int}0x08048567 = 0

# Patch conditional jump (je → jmp or je → jne)
set {char}0x08048590 = 0x74  # je
set {char}0x08048590 = 0x75  # jne
set {char}0x08048590 = 0xeb  # unconditional jmp

# Skip anti-debug function
b anti_debug_function
commands
  return
  continue
end
```

### LD_PRELOAD Bypass
```c
// fake_ptrace.c
long ptrace(int req, ...) { return 0; }
// gcc -shared -fPIC -o fake_ptrace.so fake_ptrace.c
// LD_PRELOAD=./fake_ptrace.so ./binary
```

## String Obfuscation

### XOR Decoding
```python
# Common: each byte XOR'd with key
encrypted = bytes.fromhex("1a2b3c4d5e")
key = 0x42
decrypted = bytes([b ^ key for b in encrypted])
print(decrypted)

# Rolling XOR
encrypted = bytes.fromhex("...")
key = b"KEY"
decrypted = bytes([encrypted[i] ^ key[i % len(key)] for i in range(len(encrypted))])
```

### Base64 in Binary
```bash
# Extract and decode
strings ./binary | grep -E '^[A-Za-z0-9+/]+=*$' | while read line; do
    echo "$line" | base64 -d 2>/dev/null && echo
done
```

## Control Flow Flattening (OLLVM)

### Identification
- Single large dispatch loop with switch
- State variable controls execution order
- Basic blocks scattered, not sequential

### Approach
1. Map all state values to their target blocks
2. Trace state transitions (build CFG manually)
3. Recover original control flow from transitions
4. Use angr or Unicorn to symbolically execute

## Angr (Symbolic Execution)

```python
import angr

proj = angr.Project('./binary', auto_load_libs=False)

# Find path to "correct" / avoid "wrong"
state = proj.factory.entry_state()

simgr = proj.factory.simgr(state)
simgr.explore(
    find=lambda s: b"Correct" in s.posix.dumps(1),
    avoid=lambda s: b"Wrong" in s.posix.dumps(1)
)

if simgr.found:
    solution = simgr.found[0]
    flag = solution.posix.dumps(0)  # stdin
    print(f"Flag: {flag.decode()}")
```

### Constrained Execution
```python
# If you know part of the input format
state = proj.factory.entry_state()
flag_chars = []
for i in range(32):
    c = state.solver.BVS(f'flag_{i}', 8)
    flag_chars.append(c)
    state.add_constraints(c >= 0x20, c <= 0x7e)  # printable

flag = state.solver.Concat(*flag_chars)
# Add to stdin or memory as needed
```

## Z3 Constraint Solver

```python
from z3 import *

s = Solver()
flag = [BitVec(f'f{i}', 8) for i in range(32)]

# Add constraints from reversed logic
s.add(flag[0] * flag[1] == 0x1234)
s.add(flag[0] + flag[1] == 0xab)
# ... add all constraints

if s.check() == sat:
    m = s.model()
    result = ''.join(chr(m[f].as_long()) for f in flag)
    print(f"Flag: {result}")
```

## Common Patterns

| Pattern | Indicator | Approach |
|---------|-----------|----------|
| XOR cipher | Repeated byte ops | Find key, decrypt |
| Custom VM | Large switch, fetch-decode loop | Map opcodes, disassemble |
| Anti-debug | ptrace, timing, int3 | Patch or LD_PRELOAD |
| OLLVM flattening | State variable dispatch | Trace states, reconstruct |
| TEA/XTEA | Magic constants 0x9e3779b9 | Implement inverse |
| RC4 | KSA + PRGA structure | Extract key, decrypt |
| AES | S-box substitution | Find key/IV, decrypt |

## Quick Reference

| Task | Command |
|------|---------|
| File info | `file ./binary` |
| Strings | `strings -a ./binary \| grep flag` |
| Disassemble | `objdump -M intel -d ./binary` |
| Symbols | `nm ./binary` |
| Radare2 | `r2 -AA ./binary` then `pdf @main` |
| Ghidra | `analyzeHeadless` or GUI |
| Trace syscalls | `strace ./binary` |
| Trace library | `ltrace ./binary` |
| Hex dump | `xxd ./binary \| less` |
