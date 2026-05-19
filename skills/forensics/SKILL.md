---
name: forensics
description: >
  Digital forensics specialist. Covers disk image analysis, memory forensics,
  network analysis, steganography, file carving, metadata analysis, and log analysis.
metadata:
  user-invocable: "true"
  argument-hint: "[file-or-image]"
  category: forensics
---

# Digital Forensics

You are the digital forensics specialist for CTF challenges. Analyze disk images, memory dumps, network captures, and files to recover hidden flags.

## File Identification

```bash
# File type
file ./evidence
file -b --mime-type ./evidence

# Check for embedded files
binwalk ./evidence
binwalk -e ./evidence          # extract found files
binwalk --dd='.*' ./evidence   # extract everything

# Hex analysis
xxd ./evidence | head -100
xxd ./evidence | grep -i "flag\|ctf"

# Strings extraction
strings ./evidence | grep -i "flag{"
strings -a -el ./evidence      # 16-bit strings
strings -n 10 ./evidence       # minimum length 10

# Entropy analysis (detect encrypted/compressed regions)
binwalk -E ./evidence
```

## Disk Image Analysis

### The Sleuth Kit
```bash
# Image info
mmls ./disk.img               # partition layout
fsstat -o OFFSET ./disk.img   # filesystem stats

# List files
fls -o OFFSET ./disk.img                    # root listing
fls -o OFFSET -r ./disk.img                 # recursive listing
fls -o OFFSET -r -p ./disk.img | grep -i flag

# Extract file by inode
icat -o OFFSET ./disk.img INODE > extracted_file

# Timeline
fls -o OFFSET -m / -r ./disk.img > body.txt
mactime -b body.txt

# Search for keyword
srch_strings -a ./disk.img | grep -i "flag"
```

### Autopsy (GUI)
```bash
# Launch autopsy GUI for interactive analysis
autopsy
# Or use sleuthkit server:
# autopsy -d ./disk.img
```

### Mount Disk Image
```bash
# Raw image
mkdir /mnt/disk
mount -o ro,loop,offset=$((SECTOR*512)) ./disk.img /mnt/disk

# EWF image (E01)
ewfmount ./evidence.E01 /mnt/ewf
mount -o ro,loop /mnt/ewf/ewf1 /mnt/disk
```

## Memory Forensics (Volatility)

### Volatility3 (Python 3)
```bash
# Identify profile
python3 vol.py -f ./memory.dmp banners

# List processes
python3 vol.py -f ./memory.dmp windows.pslist
python3 vol.py -f ./memory.dmp windows.pstree
python3 vol.py -f ./memory.dmp windows.cmdline

# Dump process memory
python3 vol.py -f ./memory.dmp windows.memmap --pid PID --dump

# Network connections
python3 vol.py -f ./memory.dmp windows.netstat
python3 vol.py -f ./memory.dmp windows.netscan

# Registry
python3 vol.py -f ./memory.dmp windows.registry.hivelist
python3 vol.py -f ./memory.dmp windows.registry.printkey --key "Software\Microsoft\Windows\CurrentVersion\Run"

# File extraction
python3 vol.py -f ./memory.dmp windows.filescan | grep -i "flag\|secret\|password"
python3 vol.py -f ./memory.dmp windows.dumpfiles --pid PID --virtaddr ADDR

# Strings search
strings ./memory.dmp | grep -i "flag{" 
```

### Volatility2 (Legacy)
```bash
# Profile detection
vol.py -f ./memory.dmp imageinfo

# Common commands (add --profile=PROFILE to each)
vol.py -f ./memory.dmp --profile=Win7SP1x64 pslist
vol.py -f ./memory.dmp --profile=Win7SP1x64 psscan
vol.py -f ./memory.dmp --profile=Win7SP1x64 connscan
vol.py -f ./memory.dmp --profile=Win7SP1x64 hashdump
vol.py -f ./memory.dmp --profile=Win7SP1x64 mimikatz
vol.py -f ./memory.dmp --profile=Win7SP1x64 filescan
vol.py -f ./memory.dmp --profile=Win7SP1x64 dumpfiles -Q ADDR -D output/
```

## Network Analysis

### tshark (CLI Wireshark)
```bash
# Basic info
tshark -r ./capture.pcap -q -z io,stat,0
tshark -r ./capture.pcap -q -z conv,tcp

# Filter by protocol
tshark -r ./capture.pcap -Y "http" -T fields -e http.request.uri
tshark -r ./capture.pcap -Y "dns" -T fields -e dns.qry.name
tshark -r ./capture.pcap -Y "ftp"
tshark -r ./capture.pcap -Y "tcp.port == 4444"

# Extract objects (files)
tshark -r ./capture.pcap --export-objects http,output_dir/
tshark -r ./capture.pcap --export-objects smb,output_dir/

# Follow TCP stream
tshark -r ./capture.pcap -z "follow,tcp,ascii,0"

# Extract credentials
tshark -r ./capture.pcap -Y "http.authorization" -T fields -e http.authorization
tshark -r ./capture.pcap -Y "ftp.request.command == PASS" -T fields -e ftp.request.arg

# Check for flags in payloads
tshark -r ./capture.pcap -Y "data" -T fields -e data.data | xxd -r -p | grep -i flag
```

### Wireshark Filters
```
# Common display filters
http contains "flag"
tcp contains "password"
dns.qry.name contains "flag"
ip.addr == 10.0.0.1
tcp.port == 8080
http.request.method == "POST"
tcp.flags.syn == 1 && tcp.flags.ack == 0
```

### PCAP Processing with Python
```python
from scapy.all import rdpcap, TCP, Raw

packets = rdpcap('capture.pcap')
for pkt in packets:
    if pkt.haslayer(TCP) and pkt.haslayer(Raw):
        payload = pkt[Raw].load
        if b'flag' in payload.lower():
            print(f"{pkt[IP].src}:{pkt[TCP].sport} → {pkt[IP].dst}:{pkt[TCP].dport}: {payload}")
```

## Steganography

### Image Steganography
```bash
# PNG analysis
pngcheck -v ./image.png
exiftool ./image.png

# LSB extraction (zsteg for PNG/BMP)
zsteg ./image.png
zsteg -a ./image.png          # all methods
zsteg -e b1,rgb,lsb,xy ./image.png > extracted  # specific extraction

# steghide (JPEG, BMP, WAV, AU)
steghide extract -sf ./image.jpg
steghide extract -sf ./image.jpg -p "password"
steghide info ./image.jpg

# stegseek (fast steghide brute force)
stegseek ./image.jpg /usr/share/wordlists/rockyou.txt -xf output.txt

# JPEG analysis
jsteg ./image.jpg extract output.txt

# Check for appended data
xxd ./image.jpg | tail -20     # data after FFD9 (JPEG EOF)?
strings ./image.jpg | tail -20

# Check image dimensions vs actual data
identify ./image.png
python3 -c "from PIL import Image; i=Image.open('./image.png'); print(i.size, i.mode, i.info)"
```

### Audio Steganography
```bash
# WAV analysis
file ./audio.wav
exiftool ./audio.wav
strings ./audio.wav

# Spectrogram analysis (hidden images/messages in frequency)
sox ./audio.wav -n spectrogram -o spectrogram.png

# LSB audio extraction
python3 -c "
import wave
w = wave.open('./audio.wav', 'rb')
frames = w.readframes(w.getnframes())
bits = ''.join(str(f & 1) for f in frames)
chars = [int(bits[i:i+8], 2) for i in range(0, len(bits), 8)]
print(''.join(chr(c) for c in chars if 32 <= c <= 126))
"

# Morse code detection
# Look for short/long patterns in amplitude or timing
```

### General Stego Techniques
```bash
# Check for ZIP appended to image
binwalk ./image.png           # shows embedded ZIP?
foremost ./image.png          # carve files

# Extract appended ZIP
cp ./image.png /tmp/out.zip
# Edit to find and fix ZIP header, or:
python3 -c "
data = open('./image.png','rb').read()
idx = data.find(b'PK\x03\x04')
if idx >= 0:
    open('/tmp/hidden.zip','wb').write(data[idx:])
"

# Binwalk extraction with depth
binwalk -M -e ./image.png     # recursive extraction
```

## File Carving

```bash
# foremost - recover files by header/footer
foremost -t all -i ./disk.img -o output/
foremost -t jpg,png,pdf,zip -i ./evidence -o output/

# scalpel
scalpel ./evidence -o output/

# Manual carving with dd
# Find offset with hex editor or binwalk
dd if=./evidence of=carved.jpg bs=1 skip=START count=SIZE

# Carve all JPEGs
python3 -c "
data = open('./evidence','rb').read()
i = 0
while True:
    start = data.find(b'\xff\xd8\xff', i)
    if start < 0: break
    end = data.find(b'\xff\xd9', start)
    if end < 0: break
    open(f'carved_{start}.jpg','wb').write(data[start:end+2])
    i = end + 2
"
```

## Metadata Analysis

```bash
# EXIF data (images, PDFs, etc.)
exiftool ./file.jpg
exiftool ./document.pdf

# PDF metadata
pdfinfo ./document.pdf

# Common hidden data in metadata:
# - GPS coordinates
# - Author/name fields
# - Comments
# - Custom tags
# - Revision history
exiftool -a -u -g1 ./file.jpg   # all tags, including unknown

# Remove/clean metadata (if you need to compare)
exiftool -all= ./file.jpg
```

## PDF Forensics

```bash
# PDF analysis tools
pdfinfo ./doc.pdf                # basic info
pdftotext ./doc.pdf -            # extract text
pdfimages ./doc.pdf output/      # extract images

# Examine raw PDF
strings ./doc.pdf | grep -i "flag\|hidden\|secret"
less ./doc.pdf                   # raw PDF source

# Hidden content in PDF:
# - White text on white background
# - Text behind images
# - JavaScript
# - Embedded files
# - Incremental updates (hidden revisions)
# - Flattened form fields

# Check for JavaScript
strings ./doc.pdf | grep -i "/JS\|/JavaScript"

# Extract embedded files
binwalk -e ./doc.pdf
```

## Log Analysis

```bash
# Apache/nginx logs
grep -i "flag\|admin\|login\|secret" access.log
awk '{print $7}' access.log | sort | uniq -c | sort -rn | head 20

# Auth logs
grep "Accepted\|Failed" /var/log/auth.log
grep "session opened" /var/log/auth.log

# Extract IPs and sort by frequency
awk '{print $1}' access.log | sort | uniq -c | sort -rn

# Find suspicious user agents
awk -F'"' '{print $6}' access.log | sort | uniq -c | sort -rn

# Timeline analysis
awk '{print $4}' access.log | sort | uniq -c
```

## Quick Reference

| Task | Command |
|------|---------|
| File type | `file ./evidence` |
| Embedded files | `binwalk -e ./evidence` |
| Strings | `strings ./evidence \| grep flag` |
| Metadata | `exiftool ./file` |
| Disk image | `mmls ./disk.img` then `fls -o OFFSET` |
| Memory dump | `vol.py -f ./dump windows.pslist` |
| PCAP analysis | `tshark -r ./capture.pcap` |
| Stego (PNG) | `zsteg ./image.png` |
| Stego (JPEG) | `steghide extract -sf ./image.jpg` |
| Carving | `foremost -t all -i ./evidence` |
| Spectrogram | `sox ./audio.wav -n spectrogram -o out.png` |
