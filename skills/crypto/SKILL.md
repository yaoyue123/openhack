---
name: crypto
description: >
  Cryptography specialist. Covers RSA attacks, AES mode exploits, classical ciphers,
  hash cracking, XOR analysis, and custom cipher cryptanalysis with Python snippets.
metadata:
  user-invocable: "true"
  argument-hint: "[ciphertext-or-file]"
  category: crypto
---

# Cryptography

You are the cryptography specialist for CTF challenges. Identify the cipher system, select the appropriate attack, and recover the plaintext flag.

## RSA Attacks

### RSA Basics
```
n = p * q (modulus)
e * d ≡ 1 mod φ(n) (key relation)
c = m^e mod n (encryption)
m = c^d mod n (decryption)
```

### Small Public Exponent (Small e)
```python
from gmpy2 import iroot, mpz
from Crypto.Util.number import long_to_bytes

# When e is small (e=3) and message is short, m^e < n
e = 3
c = 12345678901234567890
m, is_exact = iroot(mpz(c), e)
if is_exact:
    print(long_to_bytes(int(m)))

# With padding: Hastad's broadcast attack (same m, different n)
from functools import reduce
def hastard_broadcast(cs, ns, e):
    # CRT to find m^e mod (n1*n2*...*ne)
    N = reduce(lambda a, b: a * b, ns)
    result = 0
    for i in range(e):
        Ni = N // ns[i]
        xi = pow(Ni, -1, ns[i])
        result += cs[i] * Ni * xi
    result %= N
    m, _ = iroot(mpz(result), e)
    return long_to_bytes(int(m))
```

### Wiener's Attack (Large e, Small d)
```bash
# When d < n^(1/4), Wiener's attack works
RsaCtfTool -n N -e E --attack wiener
```

### Factor n Methods

```python
# 1. Check factordb.com
# curl "https://factordb.com/api?query=N"

# 2. Small factors trial division
def trial_division(n, limit=1000000):
    for i in range(2, limit):
        if n % i == 0:
            return i, n // i
    return None

# 3. Fermat factorization (p and q close together)
from gmpy2 import isqrt, is_square
def fermat_factor(n):
    a = isqrt(n) + 1
    while not is_square(a * a - n):
        a += 1
    b = isqrt(a * a - n)
    return int(a - b), int(a + b)

# 4. Pollard's rho
import math, random
def pollard_rho(n):
    if n % 2 == 0: return 2
    x = random.randint(2, n - 1)
    y = x
    c = random.randint(1, n - 1)
    d = 1
    while d == 1:
        x = (x * x + c) % n
        y = (y * y + c) % n
        y = (y * y + c) % n
        d = math.gcd(abs(x - y), n)
    return d if d != n else None

# 5. Using RsaCtfTool (automated)
# RsaCtfTool -n N -e E --private
```

### Common Modulus Attack
```python
# Same n, same m, different e
from Crypto.Util.number import long_to_bytes
from math import gcd

def common_modulus(c1, c2, e1, e2, n):
    g = gcd(e1, e2)
    s1 = pow(e2, -1, e1)  # extended gcd
    s2 = (g - s1 * e2) // e1
    m = (pow(c1, s1, n) * pow(c2, s2, n)) % n
    return long_to_bytes(m)
```

### CRT Fault Attack (dp/dq leak)
```python
# Given dp, dq, p, q, e, c
def crt_decrypt(c, dp, dq, p, q, e):
    mp = pow(c, dp, p)
    mq = pow(c, dq, q)
    q_inv = pow(q, -1, p)
    m = (mq + q * ((mp - mq) * q_inv % p)) % (p * q)
    return m
```

### Partial Key Exposure
```python
# If you know part of p or q
# Use Coppersmith's method (SageMath recommended)
# sage: n.factor() with known bits
```

## AES Attacks

### ECB Mode Detection & Expryption
```python
from Crypto.Cipher import AES

# ECB mode: identical blocks → identical ciphertext
# Detect: send repeated plaintext, look for repeated ciphertext blocks
# Block size detection: increase input by 1 byte until ciphertext grows by 16

# ECB byte-at-a-time decryption
def ecb_decrypt(encrypt_fn, known=b'', block_size=16):
    """Decrypt secret appended by encrypt_fn using ECB byte-at-a-time"""
    secret_len = len(encrypt_fn(b''))
    for i in range(secret_len):
        # Pad to align unknown byte at end of block
        pad_len = block_size - 1 - (len(known) % block_size)
        target_block = encrypt_fn(b'A' * pad_len)
        block_idx = len(known) // block_size
        block_start = block_idx * block_size
        target = target_block[block_start:block_start + block_size]
        
        # Brute force the byte
        for b in range(256):
            guess = b'A' * pad_len + known + bytes([b])
            result = encrypt_fn(guess)
            if result[block_start:block_start + block_size] == target:
                known += bytes([b])
                break
    return known
```

### CBC Padding Oracle
```python
from Crypto.Util.Padding import pad, unpad

def padding_oracle_decrypt(oracle_fn, ciphertext, block_size=16):
    """Decrypt ciphertext using padding oracle (CBC mode)"""
    blocks = [ciphertext[i:i+block_size] for i in range(0, len(ciphertext), block_size)]
    plaintext = b''
    
    for block_idx in range(1, len(blocks)):
        prev_block = bytearray(blocks[block_idx - 1])
        intermediate = bytearray(block_size)
        
        for byte_pos in range(block_size - 1, -1, -1):
            padding_val = block_size - byte_pos
            # Set already-known bytes to target padding
            for k in range(byte_pos + 1, block_size):
                prev_block[k] = intermediate[k] ^ padding_val
            
            for guess in range(256):
                prev_block[byte_pos] = guess
                if oracle_fn(bytes(prev_block) + blocks[block_idx]):
                    intermediate[byte_pos] = guess ^ padding_val
                    break
        
        plaintext += bytes([intermediate[i] ^ blocks[block_idx - 1][i] for i in range(block_size)])
    
    return unpad(plaintext, block_size)
```

### CTR Nonce Reuse
```python
# If same nonce used twice: keystream is identical
# c1 = m1 XOR keystream, c2 = m2 XOR keystream
# c1 XOR c2 = m1 XOR m2 → crib dragging

def ctr_nonce_reuse(c1, c2, known_plaintext):
    """Recover keystream from known plaintext"""
    keystream = bytes([a ^ b for a, b in zip(c1, known_plaintext)])
    m2 = bytes([a ^ b for a, b in zip(c2, keystream)])
    return m2
```

## Classical Ciphers

### Caesar/ROT13
```python
def caesar_bruteforce(ciphertext):
    for shift in range(26):
        result = ''.join(
            chr((ord(c) - ord('A') + shift) % 26 + ord('A')) if c.isalpha() else c
            for c in ciphertext.upper()
        )
        print(f"Shift {shift}: {result}")

# ROT13
import codecs
codecs.decode(ciphertext, 'rot_13')
```

### Vigenere
```python
from itertools import cycle

def vigenere_decrypt(ciphertext, key):
    result = []
    key_cycle = cycle(key.upper())
    for c in ciphertext.upper():
        if c.isalpha():
            k = next(key_cycle)
            result.append(chr((ord(c) - ord(k)) % 26 + ord('A')))
        else:
            result.append(c)
    return ''.join(result)

# Find key length: Kasiski examination or Index of Coincidence
def index_of_coincidence(text):
    text = [c for c in text.upper() if c.isalpha()]
    freq = {}
    for c in text:
        freq[c] = freq.get(c, 0) + 1
    n = len(text)
    ic = sum(f * (f - 1) for f in freq.values()) / (n * (n - 1)) if n > 1 else 0
    return ic  # English IC ≈ 0.0667, random ≈ 0.0385
```

### Substitution Cipher
```python
# Use frequency analysis
# English letter frequencies: ETAOINSHRDLCUMWFGYPBVKJXQZ
# Use quipqiup.com for automated solving
```

## Hash Cracking

```bash
# Identify hash type
hashid HASH_VALUE
hashid -m HASH_VALUE  # include hashcat modes

# John the Ripper
john --wordlist=/usr/share/wordlists/rockyou.txt hash.txt
john --show hash.txt

# hashcat
hashcat -m 0 hash.txt /usr/share/wordlists/rockyou.txt          # MD5
hashcat -m 1000 hash.txt /usr/share/wordlists/rockyou.txt       # NTLM
hashcat -m 1800 hash.txt /usr/share/wordlists/rockyou.txt       # SHA-512
hashcat -m 2500 capture.hccapx /usr/share/wordlists/rockyou.txt # WPA

# Custom rules
hashcat -m 0 hash.txt rockyou.txt -r /usr/share/hashcat/rules/best64.rule
```

### Common Hash Types
| Hash | hashcat -m | Length | Example |
|------|------------|--------|---------|
| MD5 | 0 | 32 | `d41d8cd98f00b204e9800998ecf8427e` |
| SHA1 | 100 | 40 | `da39a3ee5e6b4b0d3255bfef95601890afd80709` |
| SHA256 | 1400 | 64 | `e3b0c442...` |
| bcrypt | 3200 | 60 | `$2a$05$...` |
| NTLM | 1000 | 32 | `31d6cfe0d16ae931b73c59d7e0c089c0` |

## XOR Analysis

```python
# Single-byte XOR brute force
def single_byte_xor_bruteforce(ciphertext):
    results = []
    for key in range(256):
        plaintext = bytes([b ^ key for b in ciphertext])
        # Score by printable ASCII / English frequency
        score = sum(1 for c in plaintext if 32 <= c <= 126)
        results.append((score, key, plaintext))
    results.sort(reverse=True)
    return results[:5]

# Multi-byte XOR (repeating key)
# 1. Find key length (Hamming distance method)
def hamming_distance(a, b):
    return sum(bin(x ^ y).count('1') for x, y in zip(a, b))

def find_key_length(ciphertext, max_len=40):
    scores = []
    for keylen in range(2, min(max_len, len(ciphertext) // 2)):
        blocks = [ciphertext[i*keylen:(i+1)*keylen] for i in range(4)]
        pairs = [(blocks[i], blocks[j]) for i in range(4) for j in range(i+1, 4)]
        avg = sum(hamming_distance(a, b) for a, b in pairs) / len(pairs) / keylen
        scores.append((avg, keylen))
    scores.sort()
    return scores

# 2. Split into keylen groups, solve each as single-byte XOR
def multi_byte_xor_decrypt(ciphertext, key):
    return bytes([ciphertext[i] ^ key[i % len(key)] for i in range(len(ciphertext))])
```

## Base64 and Encoding

```python
import base64

# Standard base64
base64.b64decode(b'SGVsbG8=')

# URL-safe base64
base64.urlsafe_b64decode(b'SGVsbG8=')

# Base32
base64.b32decode(b'JBSWY3DP')

# Hex decode
bytes.fromhex('48656c6c6f')

# Detect nested encoding
def recursive_decode(data, max_depth=10):
    for _ in range(max_depth):
        try:
            decoded = base64.b64decode(data)
            data = decoded
        except:
            break
    return data
```

## Custom PRNG Attacks

### LCG (Linear Congruential Generator)
```python
# x_{n+1} = (a * x_n + c) mod m
# Given enough outputs, recover a, c, m

def crack_lcg(outputs):
    # If m is known:
    m = 2**32  # common
    a = (outputs[2] - outputs[1]) * pow(outputs[1] - outputs[0], -1, m) % m
    c = (outputs[1] - a * outputs[0]) % m
    return a, c

# If m unknown: use lattice reduction or triple-gcd method
```

### MT19937 (Mersenne Twister)
```python
# Given 624 consecutive outputs, clone the state
import random

def untemper(y):
    y ^= y >> 18
    y ^= (y << 15) & 0xefc60000
    for _ in range(7):
        y ^= (y << 7) & 0x9d2c5680
    for _ in range(3):
        y ^= y >> 11
    return y

def clone_mt(outputs):
    state = tuple(untemper(o) for o in outputs[:624])
    cloned = random.Random()
    cloned.setstate((3, tuple(state + (0,)), None))
    return cloned
```

## Quick Reference

| Attack | Tool/Method |
|--------|-------------|
| RSA factor | `RsaCtfTool -n N -e E --private` |
| RSA Wiener | `RsaCtfTool -n N -e E --attack wiener` |
| Hash identify | `hashid HASH` |
| Hash crack | `hashcat -m MODE hash.txt rockyou.txt` |
| XOR solve | Single/multi-byte brute force |
| AES ECB | Byte-at-a-time attack |
| AES CBC | Padding oracle attack |
| Classical | CyberChef, quipqiup |
| Encoding | Base64/32/16 decode loops |
