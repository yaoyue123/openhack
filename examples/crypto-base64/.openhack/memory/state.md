# Current State

## Objective
Decode the "Russian Dolls" crypto challenge and extract the flag.

## Phase
exploit

## What I Know
- Challenge name is "Russian Dolls", suggesting nested encoding layers
- Encoded string uses base64 alphabet with `=` padding
- Flag format is `flag{...}`
- First decode produced: `Wm14aFozdGlOSE5sTmpSZmFYTmZiakIwWDJWdVZkSjVjVjR3YjI1OQo=`
- That decoded to another base64 string
- Two layers peeled so far, third decode pending

## What I've Tried
- Identified encoding as base64 from character set analysis
- Decoded the outer layer with `base64 -d`
- Decoded the second layer with `base64 -d`

## Next Step
Decode the third layer. The result should contain the flag in `flag{...}` format.

## Blockers
None. Progress is steady.
