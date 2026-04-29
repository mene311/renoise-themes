# Hetzner Cloud Deployment Guide

Complete step-by-step from server creation to live site for **renoisethemes.com** + **bacania.cl**.

---

## Phase 0: Hetzner Server Creation

### Step 1 — Generate SSH Key (Local Machine)

```bash
# On your Arch machine
ssh-keygen -t ed25519 -C "meneses@hetzner-deploy" -f ~/.ssh/hetzner_deploy
# Enter a strong passphrase

# Add to ssh-agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/hetzner_deploy

# Copy the public key — paste this into Hetzner and GitHub
cat ~/.ssh/hetzner_deploy.pub
```

### Step 2 — Create Hetzner Cloud Server

In [Hetzner Cloud Console](https://console.hetzner.cloud):

| Setting | Choice | Reason |
|---|---|---|
| **Location** | Helsinki (hel1) | EU data privacy, good transatlantic latency |
| **Server type** | CX22 (2 vCPU, 4 GB RAM, 40 GB disk) | sharp + better-sqlite3 + @napi-rs/canvas need RAM |
| **Image** | Ubuntu 24.04 | Matches bootstrap.sh, best Node 20 support |
| **IPv4** | ✅ Enabled | Required for Let's Encrypt HTTP-01 |
| **IPv6** | ✅ Enabled (default) | Future-proof |
| **SSH Key** | Paste `hetzier_deploy.pub` | Auto-injected into root's `authorized_keys` |
| **Cloud Firewall** | Create: allow 22, 80, 443 inbound; all outbound | Defense in depth |
| **Labels** | `app=renoise-themes`, `env=production` | Organization |

Click **Create & Buy**. Note the **public IPv4** (e.g. `49.13.x.x`).

### Step 3 — Add SSH Key to GitHub

```bash
cat ~/.ssh/hetzner_deploy.pub
# → GitHub → Settings → SSH and GPG keys → New SSH key
#   Title: "Hetzner Deploy Server"
#   Key type: Authentication
#   Paste the public key content
```

### Step 4 — Configure Local SSH Config

```bash
cat >> ~/.ssh/config << 'EOF'

Host hetzner
    HostName <YOUR_HETZNER_IPV4>
    User root
    IdentityFile ~/.ssh/hetzner_deploy
    ServerAliveInterval 60
    ServerAliveCountMax 3
EOF
```

Test:
```bash
ssh hetzner "uname -a"
```

---

## Phase 1: Server Bootstrap

### Step 5 — Run Bootstrap Script

```bash
# SSH into the server
ssh hetzner

# Clone the repo (HTTPS first — no SSH key on server yet)
cd /var/www
git clone https://github.com/mene311/renoise-themes.git

# Run the bootstrap
bash /var/www/renoise-themes/ops/bootstrap.sh
```

The bootstrap installs: Node 20, PM2, Nginx, UFW, fail2ban, certbot, sqlite3, build tools, and @napi-rs/canvas system deps. It creates the `deploy` user and directory structure.

### Step 6 — Set Up Deploy User

```bash
# Still as root on the server:

# Copy SSH key to deploy user
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys

# Test deploy user login (from local machine):
ssh deploy@<YOUR_HETZNER_IPV4> -i ~/.ssh/hetzner_deploy
```

### Step 7 — Switch Git Remote to SSH on Server

```bash
# As deploy user on the server:
cd /var/www/renoise-themes

# Generate a deploy key (no passphrase for automation)
ssh-keygen -t ed25519 -C "deploy@hetzner" -f ~/.ssh/id_ed25519 -N ""

# Add this key to GitHub:
cat ~/.ssh/id_ed25519.pub
# → GitHub → Settings → SSH and GPG keys → New SSH key
#   Title: "Hetzner Deploy Server"
#   Paste the public key

# Switch remote from HTTPS to SSH
git remote set-url origin git@github.com:mene311/renoise-themes.git

# Add GitHub's host key
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null

# Test
git pull origin master
```

Create SSH config on the server:
```bash
cat > ~/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

---

## Phase 2: Application Setup

### Step 8 — Create .env File

```bash
# As deploy user on the server:
cd /var/www/renoise-themes

# Generate secrets
SESSION_SECRET=$(openssl rand -hex 32)
DEPLOY_SECRET=$(openssl rand -hex 32)

cat > .env << EOF
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=3000
RESEND_API_KEY=re_PLACEHOLDER_GET_FROM_RESEND_DASHBOARD
EMAIL_FROM=noreply@renoisethemes.com
DEPLOY_SECRET=${DEPLOY_SECRET}
EOF

chmod 600 .env
echo "✅ .env created. Replace RESEND_API_KEY with your actual key from https://resend.com"
```

### Step 9 — Install Dependencies

```bash
cd /var/www/renoise-themes
npm install --production

# Verify native modules compiled correctly:
node -e "require('better-sqlite3'); console.log('✅ better-sqlite3 OK')"
node -e "require('bcrypt'); console.log('✅ bcrypt OK')"
node -e "require('sharp'); console.log('✅ sharp OK')"
node -e "require('@napi-rs/canvas'); console.log('✅ @napi-rs/canvas OK')"
```

If `@napi-rs/canvas` fails:
```bash
sudo apt-get install -y libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev
npm rebuild
```

### Step 10 — Migrate SQLite Database + Uploads

```bash
# FROM YOUR LOCAL ARCH MACHINE:
scp /home/meneses/vibe-coding-sandbox/renoise-themes/db/themes.db hetzner:/tmp/themes.db
scp -r /home/meneses/vibe-coding-sandbox/renoise-themes/public/uploads/previews hetzner:/tmp/previews
scp -r /home/meneses/vibe-coding-sandbox/renoise-themes/public/uploads/palettes hetzner:/tmp/palettes

# ON THE SERVER (as deploy user):
cd /var/www/renoise-themes

# Database
cp /tmp/themes.db db/themes.db
sqlite3 db/themes.db "PRAGMA journal_mode=WAL;"

# Uploads
mkdir -p public/uploads/previews public/uploads/palettes
cp -r /tmp/previews/* public/uploads/previews/
cp -r /tmp/palettes/* public/uploads/palettes/

# Fix ownership
chown -R deploy:deploy db/ public/uploads/
```

### Step 11 — Start the App with PM2

```bash
# As deploy user:
cd /var/www/renoise-themes
pm2 start ops/pm2/ecosystem.config.cjs

# Verify:
pm2 status
pm2 logs renoise-themes --lines 20
curl -sf http://127.0.0.1:3000/health | jq .
```

### Step 12 — Save PM2 for Auto-restart

```bash
pm2 save
pm2 startup
# PM2 will print a sudo command — copy and run it:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u deploy --hp /home/deploy
```

---

## Phase 3: Nginx + SSL

### Step 13 — Deploy Bacanía Static Site

```bash
# As deploy user on the server:
mkdir -p /var/www/bacania/07_website

# FROM LOCAL MACHINE:
scp -r /home/meneses/BacanIA/07_website/* hetzner:/var/www/bacania/07_website/

# ON SERVER — fix ownership:
sudo chown -R deploy:deploy /var/www/bacania
```

### Step 14 — Deploy Nginx Configs

```bash
# As root:
rm -f /etc/nginx/sites-enabled/default

cp /var/www/renoise-themes/ops/nginx/renoisethemes.com /etc/nginx/sites-available/renoisethemes.com
cp /var/www/renoise-themes/ops/nginx/bacania.cl /etc/nginx/sites-available/bacania.cl

ln -sf /etc/nginx/sites-available/renoisethemes.com /etc/nginx/sites-enabled/renoisethemes.com
ln -sf /etc/nginx/sites-available/bacania.cl /etc/nginx/sites-enabled/bacania.cl
```

### Step 15 — Configure DNS (Cloudflare)

In Cloudflare DNS for each domain, set the proxy to **DNS-only (grey cloud)** — you're terminating TLS on the server, not using Cloudflare's proxy.

**renoisethemes.com:**

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `<YOUR_HETZNER_IPV4>` | DNS only (grey) |
| A | `www` | `<YOUR_HETZNER_IPV4>` | DNS only (grey) |
| AAAA | `@` | `<YOUR_HETZNER_IPV6>` | DNS only (grey) |
| AAAA | `www` | `<YOUR_HETZNER_IPV6>` | DNS only (grey) |

**bacania.cl:**

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `<YOUR_HETZNER_IPV4>` | DNS only (grey) |
| A | `www` | `<YOUR_HETZNER_IPV6>` | DNS only (grey) |
| AAAA | `@` | `<YOUR_HETZNER_IPV6>` | DNS only (grey) |
| AAAA | `www` | `<YOUR_HETZNER_IPV6>` | DNS only (grey) |

> **Why grey cloud?** Let's Encrypt HTTP-01 challenges require the certificate authority to reach your server directly. Cloudflare's orange proxy terminates TLS on their edge, which breaks certbot's domain validation. You can switch to orange (proxied) after getting certs, but then you need Cloudflare origin certificates instead of Let's Encrypt — more complex. Start grey, go orange later if you want CDN/DDoS protection.

### Step 16 — Get SSL Certificates

```bash
# As root on the server:
# First, test that DNS has propagated:
dig renoisethemes.com +short
dig bacania.cl +short

# Get certificates for both domains:
sudo certbot --nginx -d renoisethemes.com -d www.renoisethemes.com
sudo certbot --nginx -d bacania.cl -d www.bacania.cl

# Certbot will:
# 1. Verify domain ownership via HTTP-01 challenge
# 2. Obtain certificates from Let's Encrypt
# 3. Modify your Nginx configs to point to the new certs
# 4. Set up auto-renewal via systemd timer
```

> **Important:** The Nginx configs already reference the Let's Encrypt cert paths. Certbot's `--nginx` plugin will verify the paths match and may adjust them. After certbot runs, verify the configs are still correct.

### Step 17 — Test Nginx and Start

```bash
# Test config:
sudo nginx -t

# If OK, reload:
sudo systemctl reload nginx

# Test both sites:
curl -sI https://renoisethemes.com/health
curl -sI https://bacania.cl/
```

### Step 18 — Harden SSL (Optional but Recommended)

```bash
# Generate strong DH params (takes a few minutes):
sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048

# Verify auto-renewal is configured:
sudo certbot renew --dry-run
sudo systemctl list-timers | grep certbot
```

---

## Phase 4: Firewall

### Step 19 — UFW Configuration

```bash
# As root (already done by bootstrap.sh, but verify):
sudo ufw status numbered

# Expected rules:
# [1] 22/tcp    ALLOW IN    Anywhere  (SSH)
# [2] 80/tcp    ALLOW IN    Anywhere  (HTTP)
# [3] 443/tcp   ALLOW IN    Anywhere  (HTTPS)
# [4] 22/tcp (v6) ALLOW IN  Anywhere
# [5] 80/tcp (v6) ALLOW IN  Anywhere
# [6] 443/tcp (v6) ALLOW IN Anywhere

# If not set up yet:
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

### Step 20 — Hetzner Cloud Firewall (If Created in Step 2)

In Hetzner Cloud Console → Security → Firewalls:

| Direction | Protocol | Port | Source |
|---|---|---|---|
| Inbound | TCP | 22 | Any IPv4, Any IPv6 |
| Inbound | TCP | 80 | Any IPv4, Any IPv6 |
| Inbound | TCP | 443 | Any IPv4, Any IPv6 |
| Outbound | All | All | All |

> **Note:** If you restrict SSH (port 22) to your IP only, you'll need to update it whenever your IP changes. For now, allow all — fail2ban handles brute force.

### Step 21 — Fail2ban Verification

```bash
# Check fail2ban is running:
sudo systemctl status fail2ban

# Check SSH jail:
sudo fail2ban-client status sshd

# If you get locked out, use Hetzner Cloud Console → VNC Console to regain access.
```

---

## Phase 5: PM2 vs systemd — Decision

### Why PM2 is Fine for This Project

| Factor | PM2 | systemd |
|---|---|---|
| **Setup** | `pm2 start ecosystem.config.cjs` | Write a .service file, daemon-reload, enable |
| **Log management** | Built-in, `pm2 logs` | journald, `journalctl -u app` |
| **Memory limit** | `max_memory_restart: 512M` ✅ | Needs `MemoryMax=` in unit file |
| **Zero-downtime reload** | `pm2 reload` ✅ | Needs `KillSignal`, `TimeoutStopSec` tuning |
| **Monitoring** | `pm2 monit`, `pm2 status` | `systemctl status` |
| **Ecosystem file** | Already written ✅ | Would need new file |

**Verdict: Keep PM2.** Your ecosystem.config.cjs is already written and well-configured. PM2's `reload` gives zero-downtime deploys, memory limits are built-in, and the log rotation is handled. systemd is "more proper" but adds complexity for no real benefit at this scale.

The only thing to add is **log rotation**:

```bash
# As deploy user:
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## Phase 6: Backup Strategy

### Step 22 — Cron Job for Daily Backups

```bash
# As deploy user:
crontab -e

# Add this line (daily at 3:00 AM UTC):
0 3 * * * /var/www/renoise-themes/ops/scripts/backup.sh >> /var/log/pm2/backup.log 2>&1
```

### Step 23 — Hetzner Snapshots (Additional Safety Net)

In Hetzner Cloud Console → your server → Snapshots:

- **Manual snapshot** before major changes (OS upgrades, dependency bumps)
- **Automatic snapshots** are a paid feature (€0.012/GB/month) — worth it for production
- Recommended schedule: Weekly, keep 2 snapshots

To create a manual snapshot:
```bash
# Via hcloud CLI (install: pip install hcloud)
hcloud server create-image <server-id> --description "pre-deploy-$(date +%Y%m%d)"
```

Or use the Hetzner Cloud Console UI.

### Step 24 — Offsite Backup (Optional)

For true disaster recovery, push backups to S3-compatible storage:

```bash
# Add to backup.sh or as a separate cron:
# Using Hetzner Storage Box (€3.21/month for 100GB) or any S3-compatible storage
```

---

## Phase 7: Monitoring

### Step 25 — Log Rotation for PM2

Already covered in Step 21 (`pm2-logrotate`).

### Step 26 — Nginx Log Rotation

Ubuntu's Nginx package includes logrotate by default. Verify:
```bash
cat /etc/logrotate.d/nginx
# Should show daily rotation, 14-day retention, compress
```

### Step 27 — Basic Health Check Cron

```bash
# As deploy user:
crontab -e

# Add — check every 5 minutes, restart if down:
*/5 * * * * curl -sf http://127.0.0.1:3000/health > /dev/null || (echo "App down at $(date)" >> /var/log/pm2/health-check.log && pm2 restart renoise-themes)
```

### Step 28 — Disk Space Monitoring

```bash
# As deploy user, add to crontab:
0 8 * * * df -h / | awk 'NR==2 && $5+0 > 85 {print "Disk usage above 85% on /: " $5}' | mail -s "Disk alert: renoisethemes" admin@renoisethemes.com
```

Or simpler — just check manually:
```bash
df -h /
du -sh /var/www/renoisethemes/db/
du -sh /var/www/renoisethemes/public/uploads/
```

---

## Phase 8: Deploy Workflow

### Step 29 — First Deploy (Push to Production)

```bash
# On your local machine:
cd /home/meneses/vibe-coding-sandbox/renoise-themes

# Commit any changes (including the ops fixes we just made):
git add ops/
git commit -m "fix: update nginx configs, bootstrap, and deploy script for production"
git push origin master

# On the server:
ssh deploy@<YOUR_HETZNER_IPV4>
cd /var/www/renoise-themes
git pull origin master
npm install --production
pm2 reload ops/pm2/ecosystem.config.cjs --update-env
```

### Step 30 — Set Up GitHub Webhook for Auto-Deploy (Optional)

```bash
# On the server, the deploy.sh already handles this.
# Add a webhook endpoint in your app (already exists at /deploy per app.js line ~1035)
# Then in GitHub → repo → Settings → Webhooks → Add webhook:
#   Payload URL: https://renoisethemes.com/deploy
#   Content type: application/json
#   Secret: <your DEPLOY_SECRET from .env>
#   Events: Just the push event
```

---

## Quick Reference: Complete Command Sequence

Run these in order on a fresh Hetzner server:

```bash
# === ON LOCAL MACHINE ===
ssh-keygen -t ed25519 -C "meneses@hetzner-deploy" -f ~/.ssh/hetzner_deploy
ssh-add ~/.ssh/hetzner_deploy
# Add pubkey to Hetzner Cloud Console and GitHub

# === ON SERVER (as root) ===
cd /var/www
git clone https://github.com/mene311/renoise-themes.git
bash /var/www/renoise-themes/ops/bootstrap.sh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys

# === ON SERVER (as deploy) ===
cd /var/www/renoise-themes
ssh-keygen -t ed25519 -C "deploy@hetzner" -f ~/.ssh/id_ed25519 -N ""
# Add deploy key to GitHub
cat > ~/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
git remote set-url origin git@github.com:mene311/renoise-themes.git
git pull origin master

# Create .env
SESSION_SECRET=$(openssl rand -hex 32)
DEPLOY_SECRET=$(openssl rand -hex 32)
cat > .env << EOF
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=3000
RESEND_API_KEY=re_YOUR_KEY_HERE
EMAIL_FROM=noreply@renoisethemes.com
DEPLOY_SECRET=${DEPLOY_SECRET}
EOF
chmod 600 .env

# Install deps
npm install --production

# Migrate DB + uploads (from local machine):
# scp db/themes.db hetzner:/tmp/themes.db
# scp -r public/uploads/previews hetzner:/tmp/previews
# scp -r public/uploads/palettes hetzner:/tmp/palettes
# Then on server:
cp /tmp/themes.db db/themes.db
sqlite3 db/themes.db "PRAGMA journal_mode=WAL;"
mkdir -p public/uploads/previews public/uploads/palettes
cp -r /tmp/previews/* public/uploads/previews/
cp -r /tmp/palettes/* public/uploads/palettes/

# Start PM2
pm2 start ops/pm2/ecosystem.config.cjs
pm2 save
pm2 startup  # Run the sudo command it prints

# PM2 log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

# === BACK ON SERVER (as root) ===
# Deploy Bacanía static site
mkdir -p /var/www/bacania/07_website
# scp -r /home/meneses/BacanIA/07_website/* hetzner:/var/www/bacania/07_website/
chown -R deploy:deploy /var/www/bacania

# Nginx
rm -f /etc/nginx/sites-enabled/default
cp /var/www/renoise-themes/ops/nginx/renoisethemes.com /etc/nginx/sites-available/
cp /var/www/renoise-themes/ops/nginx/bacania.cl /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/renoisethemes.com /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/bacania.cl /etc/nginx/sites-enabled/

# DNS — set A/AAAA records in Cloudflare (grey cloud) before running certbot

# SSL
sudo certbot --nginx -d renoisethemes.com -d www.renoisethemes.com
sudo certbot --nginx -d bacania.cl -d www.bacania.cl
sudo nginx -t && sudo systemctl reload nginx

# Verify auto-renewal
sudo certbot renew --dry-run

# Cron jobs (as deploy user)
crontab -e
# 0 3 * * * /var/www/renoise-themes/ops/scripts/backup.sh >> /var/log/pm2/backup.log 2>&1
# */5 * * * * curl -sf http://127.0.0.1:3000/health > /dev/null || (echo "App down at $(date)" >> /var/log/pm2/health-check.log && pm2 restart renoise-themes)
```

---

## Troubleshooting

### App won't start
```bash
pm2 logs renoise-themes --lines 50
# Common issues:
# - Missing .env → create it (Step 8)
# - Native module failed → npm rebuild
# - Port in use → lsof -i :3000
```

### SSL certificate errors
```bash
sudo certbot certificates  # List all certs
sudo certbot renew --dry-run  # Test renewal
sudo nginx -t  # Check config syntax
```

### Nginx 502 Bad Gateway
```bash
# App is down or not listening on 3000
pm2 status
pm2 restart renoise-themes
curl -sf http://127.0.0.1:3000/health
```

### Permission denied on uploads
```bash
chown -R deploy:deploy /var/www/renoisethemes/public/uploads/
chmod -R 755 /var/www/renoisethemes/public/uploads/
```

### SQLite locked errors
```bash
# Ensure WAL mode:
sqlite3 db/themes.db "PRAGMA journal_mode=WAL;"
# Check no other process has it open:
lsof db/themes.db
```