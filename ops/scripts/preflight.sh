#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "== Renoise Themes preflight =="

fail=0
check() {
  local label="$1"
  shift
  printf "%-42s" "$label"
  if "$@" > /tmp/renoisethemes-preflight.out 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    sed 's/^/  /' /tmp/renoisethemes-preflight.out
    fail=1
  fi
}

check "node version" node --version
check "package metadata" test -f package.json
check "app syntax" node --check app.js
check "database module syntax" node --check lib/database.js
check "studio orchestrator syntax" node --check public/js/studio.js
check "studio generator syntax" node --check public/js/studio-generator.js
check "creator palette syntax" node --check public/js/creator-palette.js
check "shared color utils syntax" node --check public/js/color-utils.js
check "creator constants syntax" node --check public/js/creator-constants.js
check "archetype seeds import" node -e "import('./lib/archetype-seeds.js').then(m => { if (!m.ARCHETYPE_LIST || m.ARCHETYPE_LIST.length === 0) process.exit(1); })"
check "native deps import" node --input-type=module -e "await import('better-sqlite3'); await import('@napi-rs/canvas'); await import('sharp');"
check "default theme present" test -f Default.xrnc
check "preview maps present" test -f maps/pattern.bin
check "database readable" node --input-type=module -e "const Database=(await import('better-sqlite3')).default; const db=new Database('db/themes.db'); const row=db.prepare('select count(*) n from themes').get(); if (row.n < 0) process.exit(1); db.close();"
check "upload directories writable" bash -c 'for d in public/uploads/themes public/uploads/palettes public/uploads/previews public/uploads/screenshots; do mkdir -p "$d"; test -w "$d"; done'

if [[ -z "${SESSION_SECRET:-}" ]]; then
  echo "SESSION_SECRET                           WARN (not set in shell; required for app startup unless .env is loaded)"
else
  echo "SESSION_SECRET                           OK"
fi

rm -f /tmp/renoisethemes-preflight.out

if [[ $fail -ne 0 ]]; then
  echo "Preflight failed."
  exit 1
fi

echo "Preflight passed."
