#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════
# Deploy Script — Push-to-deploy via GitHub webhook
# ═══════════════════════════════════════════════════════════════

PROJECT_DIR="/var/www/renoisethemes"
APP_NAME="renoise-themes"

echo "🚀 Deploying renoise-themes..."
cd "$PROJECT_DIR"

# ── Backup before deploy ──────────────────────────────────────
echo "💾 Creating pre-deploy backup..."
./ops/scripts/backup.sh

# ── Pull latest ───────────────────────────────────────────────
echo "📥 Pulling latest from GitHub..."
git pull origin master

# ── Install dependencies ──────────────────────────────────────
echo "📦 Installing dependencies..."
npm install --production

# ── Restart PM2 ───────────────────────────────────────────────
echo "🔁 Restarting app..."
pm2 reload ecosystem.config.cjs --update-env

# ── Health check ──────────────────────────────────────────────
echo "🏥 Health check..."
sleep 3
curl -sf http://127.0.0.1:3000/health > /dev/null && echo "✅ App is healthy" || echo "⚠️ App may not be responding"

echo "✅ Deploy complete!"
