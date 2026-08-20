#!/bin/bash
# Patch CRM edge nginx to terminate TLS for m/app.levelapp.site → monitor_nginx
set -euo pipefail

CONF=/opt/lider-navoiy/backend/nginx/nginx.prod.conf
BACKUP="${CONF}.bak.userweb.$(date +%Y%m%d%H%M%S)"

if grep -q 'server_name m.levelapp.site' "$CONF"; then
  echo "CRM nginx already has m.levelapp.site — skip patch"
else
  cp "$CONF" "$BACKUP"
  python3 - <<'PY'
from pathlib import Path
path = Path("/opt/lider-navoiy/backend/nginx/nginx.prod.conf")
text = path.read_text()
marker = "    server {\n        listen 443 ssl;\n        http2 on;\n        server_name levelapp.site www.levelapp.site;"
block = r'''
    # LevelApp user-web (mobile/desktop browser)
    server {
        listen 80;
        server_name m.levelapp.site app.levelapp.site;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl;
        http2 on;
        server_name m.levelapp.site app.levelapp.site;

        ssl_certificate     /etc/letsencrypt/live/levelapp.site/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/levelapp.site/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;

        client_max_body_size 12M;
        add_header Strict-Transport-Security "max-age=31536000" always;

        location / {
            proxy_pass http://monitor_nginx:80;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
            proxy_buffering off;
            proxy_request_buffering off;
        }
    }

'''
if marker not in text:
    raise SystemExit("marker not found for levelapp SSL server")
# Insert user-web servers BEFORE the main levelapp HTTPS server
text = text.replace(marker, block + marker, 1)
path.write_text(text)
print("patched", path)
PY
fi

echo "Expanding TLS cert for m.levelapp.site (app if DNS exists)..."
cd /opt/lider-navoiy/backend
# Ensure HTTP-01 challenge works for m via temporary listen 80 block after reload
docker compose -f docker-compose.prod.yml exec -T nginx nginx -t
docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload || docker compose -f docker-compose.prod.yml restart nginx

# Issue/expand certificate. Prefer m only if app DNS missing.
DOMAINS="-d levelapp.site -d www.levelapp.site -d m.levelapp.site"
if getent hosts app.levelapp.site >/dev/null 2>&1; then
  DOMAINS="$DOMAINS -d app.levelapp.site"
  echo "app.levelapp.site DNS OK — including in cert"
else
  echo "WARNING: app.levelapp.site DNS missing — cert without app"
fi

docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --cert-name levelapp.site \
  --expand \
  --non-interactive --agree-tos \
  --register-unsafely-without-email \
  $DOMAINS || true

docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload || docker compose -f docker-compose.prod.yml restart nginx
echo "CRM patch done"
