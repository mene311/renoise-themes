server {
    listen 80;
    listen [::]:80;
    server_name bacania.cl www.bacania.cl;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name bacania.cl www.bacania.cl;

    ssl_certificate /etc/letsencrypt/live/bacania.cl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bacania.cl/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/bacania/07_website;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    # SPA fallback (if needed)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
