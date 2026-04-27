# 🚀 Deployment Guide: Renoise Themes on Hetzner VPS

This guide covers the complete production deployment of `renoise-themes` on a single Hetzner VPS with Nginx, PM2, SSL, and push-to-deploy via GitHub webhooks.

---

## 📋 Prerequisites Checklist

Before starting, make sure you have:

- [ ] Hetzner VPS provisioned (CPX11, Ubuntu 24.04)
- [ ] Domain registered: `renoisethemes.com` (via Cloudflare Registrar)
- [ ] Cloudflare DNS access for both `renoisethemes.com` and `bacania.cl`
- [ ] Resend account with verified domain and API key
- [ ] SSH key pair (`ssh-keygen -t ed25519 -C "deploy@renoisethemes.com"`)
- [ ] GitHub repo: `mene311/renoise-themes` (already exists)
- [ ] GitHub repo: `mene311/BacanIA` (already exists)

---

## Phase 1: Server Bootstrap (5 minutes)

SSH into your fresh Hetzner VPS as root:

```bash
ssh root@YOUR_HETZNER_IP
```

Download and run the bootstrap script:

```bash
curl -fsSL https://raw.githubusercontent.com/mene311/renoise-themes/master/ops/bootstrap.sh | bash
```

This installs: Node.js 20, Nginx, PM2, Certbot, UFW, Fail2ban, build tools.

### Add your SSH key to the deploy user:

```bash
# On your local machine, copy your public key
cat ~/.ssh/id_ed25519.pub

# On the VPS, paste it:
echo 'YOUR_PUBLIC_KEY_HERE' > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

---

## Phase 2: Clone Repositories (2 minutes)

Switch to the deploy user and clone:

```bash
su - deploy
cd /var/www

# Clone renoise-themes
git clone git@github.com:mene311/renoise-themes.git

# Clone BacanIA
git clone git@github.com:mene311/BacanIA.git bacania
```

**Note:** If you haven't set up SSH keys for GitHub, do this first:
```bash
ssh-keygen -t ed25519 -C "deploy@renoisethemes.com"
cat ~/.ssh/id_ed25519.pub
# Add the output to GitHub → Settings → SSH and GPG keys
```

---

## Phase 3: DNS Configuration (Cloudflare)

Log into [dash.cloudflare.com](https://dash.cloudflare.com) and configure both domains.

### `renoisethemes.com` DNS Records

| Type | Name | Content | Proxy Status | TTL |
|---|---|---|---|---|
| A | `@` | `YOUR_HETZNER_IP` | DNS only (grey) | Auto |
| CNAME | `www` | `renoisethemes.com` | DNS only (grey) | Auto |

### `bacania.cl` DNS Records

| Type | Name | Content | Proxy Status | TTL |
|---|---|---|---|---|
| A | `@` | `YOUR_HETZNER_IP` | DNS only (grey) | Auto |
| CNAME | `www` | `bacania.cl` | DNS only (grey) | Auto |

**Important:** Keep the cloud icon **GREY** (DNS only). Orange (proxied) will hide your server IP but breaks the deploy webhook unless you configure Cloudflare Tunnel. For now, use direct DNS.

### Resend DNS Verification

In Resend dashboard → Domains → `renoisethemes.com`:
- Copy the TXT verification record
- Add it to Cloudflare DNS for `renoisethemes.com`
- Wait for verification (usually instant)

---

## Phase 4: SSL Certificates (2 minutes)

Back on the VPS as root:

```bash
# Remove default Nginx site
rm /etc/nginx/sites-enabled/default

# Copy our Nginx configs
cp /var/www/renoise-themes/ops/nginx/renoisethemes.com /etc/nginx/sites-available/
cp /var/www/renoise-themes/ops/nginx/bacania.cl /etc/nginx/sites-available/

# Enable sites
ln -s /etc/nginx/sites-available/renoisethemes.com /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/bacania.cl /etc/nginx/sites-enabled/

# Test Nginx config
nginx -t

# Get SSL certificates (this also reloads Nginx)
certbot --nginx -d renoisethemes.com -d www.renoisethemes.com -d bacania.cl -d www.bacania.cl

# Auto-renew is already set up by Certbot
```

---

## Phase 5: Environment Variables (2 minutes)

Create the production `.env` file:

```bash
su - deploy
cd /var/www/renoise-themes
nano .env
```

Paste this (generate secrets first):

```bash
# Run these on your local machine to generate secrets:
# openssl rand -hex 32
# openssl rand -hex 32

SESSION_SECRET=your-64-char-hex-secret-here
RESEND_API_KEY=re_your_resend_api_key_here
EMAIL_FROM=noreply@renoisethemes.com
DEPLOY_SECRET=your-64-char-hex-deploy-secret-here
NODE_ENV=production
PORT=3000
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

---

## Phase 6: Start the App (1 minute)

```bash
cd /var/www/renoise-themes
npm install --production

# Create log directory for PM2
sudo mkdir -p /var/log/pm2
sudo chown deploy:deploy /var/log/pm2

# Start with PM2
pm2 start ops/pm2/ecosystem.config.cjs

# Save PM2 config so it restarts on boot
pm2 save
pm2 startup systemd
# Run the command PM2 outputs (usually something with sudo)
```

Verify it's running:
```bash
curl -s http://127.0.0.1:3000/health | python3 -m json.tool
```

You should see:
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "uploads": true,
    "timestamp": "...",
    "uptime": ...
  }
}
```

---

## Phase 7: GitHub Webhook Setup (Push-to-Deploy)

This is the magic: every push to `master` auto-deploys.

### 1. In GitHub Repo Settings

Go to: `https://github.com/mene311/renoise-themes/settings/hooks`

Click **"Add webhook"**

| Field | Value |
|---|---|
| **Payload URL** | `https://renoisethemes.com/deploy` |
| **Content type** | `application/json` |
| **Secret** | Your `DEPLOY_SECRET` from `.env` |
| **SSL verification** | Enable (checked) |
| **Which events?** | Just the `push` event |
| **Active** | Checked |

### 2. Test the Webhook

After saving, GitHub shows a "Recent Deliveries" section. Click **"Redeliver"** on the test ping or make a small commit and push:

```bash
# On your local machine
echo "# test" >> README.md
git add README.md
git commit -m "test: trigger deploy"
git push origin master
```

### 3. Check Deploy Status

On the VPS:
```bash
tail -f /var/log/pm2/renoisethemes-out.log
```

You should see:
```
🚀 Deploy webhook triggered
🚀 Deploying renoise-themes...
💾 Creating pre-deploy backup...
📥 Pulling latest from GitHub...
📦 Installing dependencies...
🔁 Restarting app...
🏥 Health check...
✅ App is healthy
✅ Deploy complete!
```

---

## Phase 8: Database Backup (Automated)

Set up the daily backup cron job:

```bash
su - deploy
crontab -e
```

Add this line:
```
0 3 * * * /var/www/renoisethemes/ops/scripts/backup.sh >> /var/log/renoisethemes-backup.log 2>&1
```

This runs every day at 3 AM, keeping 7 days of backups in `/backup/renoisethemes/`.

---

## Phase 9: BacanIA Static Site

No build needed — just serve the static files:

```bash
# Ensure BacanIA is cloned to /var/www/bacania
cd /var/www/bacania
git pull origin main

# The Nginx config already points to /var/www/bacania/07_website
# SSL is already set up from Phase 4
```

To update BacanIA in the future:
```bash
cd /var/www/bacania
git pull origin main
# Nginx serves directly from disk — no restart needed
```

---

## 🔧 Common Operations

### View logs
```bash
pm2 logs renoise-themes
# or
tail -f /var/log/pm2/renoisethemes-out.log
```

### Restart app manually
```bash
pm2 restart renoise-themes
```

### Update Nginx config
```bash
sudo nano /etc/nginx/sites-available/renoisethemes.com
sudo nginx -t
sudo systemctl reload nginx
```

### Manual deploy (if webhook fails)
```bash
cd /var/www/renoisethemes
./ops/deploy.sh
```

### Check SSL expiry
```bash
sudo certbot certificates
```

### Firewall status
```bash
sudo ufw status
```

---

## 🛡️ Security Notes

- **UFW** blocks all ports except 22 (SSH), 80 (HTTP), 443 (HTTPS)
- **Fail2ban** bans IPs after 5 failed SSH attempts
- **Nginx** rate limits requests to prevent DDoS
- **PM2** auto-restarts the app if it crashes
- **Backups** run daily and keep 7 days of history
- **Secrets** live in `.env` only — never committed to Git
- **Deploy webhook** is protected by a secret token

---

## 📞 Troubleshooting

### "Cannot connect to server"
- Check UFW: `sudo ufw status`
- Check Nginx: `sudo systemctl status nginx`
- Check app: `pm2 status`
- Check DNS: `dig renoisethemes.com +short` (should show your Hetzner IP)

### "SSL certificate error"
- Check Certbot: `sudo certbot certificates`
- Renew manually: `sudo certbot renew --dry-run`
- Check Nginx config: `sudo nginx -t`

### "Deploy webhook not working"
- Check GitHub webhook delivery log (repo settings → webhooks → recent deliveries)
- Verify `DEPLOY_SECRET` matches between `.env` and GitHub
- Test manually: `curl -X POST https://renoisethemes.com/deploy -H "X-Deploy-Secret: YOUR_SECRET"`

### "Emails not sending"
- Check Resend dashboard for domain verification status
- Verify `RESEND_API_KEY` in `.env`
- Check logs: `pm2 logs renoise-themes | grep "\[EMAIL\]"`

---

## 💰 Monthly Cost

| Item | Cost |
|---|---|
| Hetzner CPX11 VPS | €5.35 |
| `renoisethemes.com` domain | ~€0.75/mo (€9/yr) |
| `bacania.cl` domain | (already owned) |
| Resend email | €0 (3,000/mo free) |
| **Total** | **~€6/mo** |

---

## 🎉 You're Live!

Once all phases are complete, your setup is:

- **renoise-themes.com** → Live Node.js app with auto-deploy
- **bacania.cl** → Live static site
- **Push to master** → Auto-deploys in ~10 seconds
- **Daily backups** → SQLite + uploads preserved
- **SSL + security** → Let's Encrypt, firewall, fail2ban

**Next feature to build?** Come back when you're ready.
