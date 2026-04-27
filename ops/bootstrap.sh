#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════
# Hetzner VPS Bootstrap — Single-command server setup
# Run this ONCE as root on a fresh Ubuntu 24.04 Hetzner VPS
# ═══════════════════════════════════════════════════════════════

echo "🚀 Bootstrapping Hetzner VPS for renoisethemes.com + bacania.cl"
echo ""

# ── Basics ────────────────────────────────────────────────────
apt-get update
apt-get install -y curl wget git vim htop ufw fail2ban certbot python3-certbot-nginx

# ── Node.js 20 (LTS) ──────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ── Build tools (for native deps: sharp, bcrypt, better-sqlite3)
apt-get install -y build-essential python3 make g++

# ── PM2 (global) ──────────────────────────────────────────────
npm install -g pm2

# ── Nginx ─────────────────────────────────────────────────────
apt-get install -y nginx
systemctl enable nginx

# ── Firewall ──────────────────────────────────────────────────
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

# ── Fail2ban (SSH brute force protection) ─────────────────────
systemctl enable fail2ban
systemctl start fail2ban

# ── Create deploy user ────────────────────────────────────────
useradd -m -s /bin/bash deploy || true
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
echo "Deploy user created. Add your SSH key to /home/deploy/.ssh/authorized_keys"

# ── Create directory structure ────────────────────────────────
mkdir -p /var/www/renoisethemes
mkdir -p /var/www/bacania
mkdir -p /backup/renoisethemes
mkdir -p /backup/bacania
chown -R deploy:deploy /var/www
chown -R deploy:deploy /backup

# ── Git clone (placeholder — run as deploy user after adding SSH key) ──
echo ""
echo "✅ Bootstrap complete!"
echo ""
echo "Next steps:"
echo "  1. Add your SSH key:   echo 'your-pubkey' > /home/deploy/.ssh/authorized_keys"
echo "  2. Switch to deploy:   su - deploy"
echo "  3. Clone repos:        cd /var/www && git clone git@github.com:mene311/renoise-themes.git"
echo "  4. Copy nginx config:  sudo cp renoise-themes/ops/nginx/* /etc/nginx/sites-enabled/"
echo "  5. Get SSL:            sudo certbot --nginx -d renoisethemes.com -d www.renoisethemes.com -d bacania.cl -d www.bacania.cl"
echo "  6. Start apps:         cd renoise-themes && npm install && pm2 start ops/pm2/ecosystem.config.cjs"
echo ""
