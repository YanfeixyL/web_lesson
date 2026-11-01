#!/usr/bin/env bash
set -euo pipefail
project=/home/admin/Project/haobangshou
test -d "$project"
cd "$project"
mkdir -p data uploads
if [ ! -f .env.production ]; then
  secret=$(openssl rand -hex 32)
  printf 'JWT_SECRET=%s\n' "$secret" > .env.production
fi
chown -R admin:admin "$project"
chmod 600 .env.production
if [ -f package-lock.json ]; then
  runuser -u admin -- npm ci --omit=dev --no-audit --no-fund
else
  runuser -u admin -- npm install --omit=dev --no-audit --no-fund
fi
install -m 644 deploy/haobangshou.service /etc/systemd/system/haobangshou.service
python3 - <<'PY'
from pathlib import Path
from datetime import datetime
config = Path('/etc/nginx/sites-available/default')
text = config.read_text()
marker = '# HAOBANGSHOU MANAGED LOCATION'
if marker not in text:
    backup = config.with_name('default.before-haobangshou-' + datetime.now().strftime('%Y%m%d%H%M%S'))
    backup.write_text(text)
    anchor = '\n\tlocation / {'
    if anchor not in text:
        raise RuntimeError('Cannot locate the default server location; configuration was not changed')
    block = Path('deploy/nginx-location.conf').read_text()
    text = text.replace(anchor, '\n    '+marker+'\n'+block+'\n'+anchor, 1)
    config.write_text(text)
PY
nginx -t
systemctl daemon-reload
systemctl enable --now haobangshou
systemctl reload nginx
systemctl is-active haobangshou
