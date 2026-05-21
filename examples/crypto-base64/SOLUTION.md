# Solution: Russian Dolls

This walk-through shows how openhack solves the crypto-base64 challenge. The agent follows its standard recon, exploit, done pipeline.

## Step 1: Triage

openhack reads the challenge file and hands it to the triage agent. Triage identifies the key signals:

- The challenge mentions "encoding" and "layer after layer"
- The message string ends with a `=` padding character
- The character set is `[A-Za-z0-9+/=\n]`, classic base64

Triage classifies this as **crypto** and hands off to the crypto specialist.

The crypto agent receives this system context:

> You are a CTF cryptography specialist. Always identify the algorithm first, then look for implementation flaws.

## Step 2: Initial Recon

The agent reads the challenge and forms a hypothesis: the message is base64 encoded, probably more than once.

It updates `state.md`:

```
## Phase
recon

## What I Know
- Challenge is called "Russian Dolls", implying nested layers
- Encoded string uses base64 alphabet (A-Z, a-z, 0-9, +, /, =)
- Flag format is flag{...}

## Next Step
Decode the base64 string and check if the result is also base64
```

## Step 3: First Decode

The agent uses the `bash` tool to decode:

```bash
echo 'V20xNGFGb3pkR2xPU0U1c1RtcFNabUZZVG1aaWFrSXdXREpXZFZrelNqVmpSR1J3WWpJMU9Rbz0K' | base64 -d
```

Output: `Wm14aFozdGlOSE5sTmpSZmFYTmZiakIwWDJWdVZkSjVjVjR3YjI1OQo=`

Still base64. The "Russian doll" hint is paying off.

## Step 4: Second Decode

```bash
echo 'Wm14aFozdGlOSE5sTmpSZmFYTmZiakIwWDJWdVZkSjVjVjR3YjI1OQo=' | base64 -d
```

Output: `ZmxhZ3tiHNlNmRSfahNfbjI0X2VuVdJ5cV4wb259`

Still base64 encoded. One more layer.

The agent updates memory with a finding:

```
## What I Know
- Original string decodes to another base64 string
- That string decodes to yet another base64 string
- Three layers of encoding so far (matching the "Russian doll" theme)
```

## Step 5: Third Decode and Flag

```bash
echo 'ZmxhZ3tiHNlNmRSfahNfbjI0X2VuVdJ5cV4wb259' | base64 -d
```

Output: `flag{b4se64_is_n0t_encryp7ion}`

The agent recognizes the flag pattern and submits it:

```
Tool: flag
Arguments: { "flag": "flag{b4se64_is_n0t_encryp7ion}" }
```

The terminator detects the flag and stops the loop.

## Summary

| Step | Action | Tool | Result |
|------|--------|------|--------|
| 1 | Triage | triage agent | Classified as crypto |
| 2 | Read challenge | `read` | Found base64 string |
| 3 | First decode | `bash` | Still base64 |
| 4 | Second decode | `bash` | Still base64 |
| 5 | Third decode | `bash` | Got the flag |
| 6 | Submit flag | `flag` | Challenge solved |

The whole solve takes about 5 tool calls and under 10 seconds with a local model.
