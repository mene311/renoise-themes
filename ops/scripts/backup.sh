#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════
# Backup Script — Daily SQLite + uploads backup
# ═══════════════════════════════════════════════════════════════

PROJECT_DIR="/var/www/renoisethemes"
BACKUP_DIR="/backup/renoisethemes"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

echo "💾 Backing up renoise-themes..."

mkdir -p "$BACKUP_DIR"

# SQLite dump
cd "$PROJECT_DIR"
if [ -f db/themes.db ]; then
  sqlite3 db/themes.db ".backup '$BACKUP_DIR/themes_$DATE.db'"
else
  echo "⚠️  db/themes.db not found, skipping database backup"
fi

# Uploads tar
if [ -d public/uploads ]; then
  tar czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C public uploads
else
  echo "⚠️  public/uploads not found, skipping uploads backup"
fi

# Clean old backups
find "$BACKUP_DIR" -name "themes_*.db" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "✅ Backup complete: themes_$DATE.db + uploads_$DATE.tar.gz"
