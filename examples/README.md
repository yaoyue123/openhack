# Examples

Learn how openhack tackles different CTF challenge types.

| Name | Category | Difficulty | Description |
|------|----------|------------|-------------|
| [crypto-base64](./crypto-base64/) | Crypto | Easy | Multi-layer base64 encoding. Decode the nesting to find the flag. |

## How to use

Pick an example and point `openhack solve` at the challenge file:

```bash
openhack solve --file examples/crypto-base64/challenge.txt
```

Or start an interactive session and work through it yourself:

```bash
openhack chat "Help me solve the crypto-base64 example"
```

Each example directory contains:

- `challenge.txt` - the challenge description and any encoded data
- `SOLUTION.md` - a walk-through showing how openhack reasons through it
- `.openhack/memory/state.md` - a snapshot of the agent's memory mid-solve

More examples coming soon. Contributions welcome!
