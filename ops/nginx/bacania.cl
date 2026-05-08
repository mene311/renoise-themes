server {
    listen 80;
    listen [::]:80;
    server_name bacania.cl www.bacania.cl;
    return 308 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
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
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml text/javascript image/svg+xml;

    # Static site — try file, then 404 (no SPA fallback for static HTML)
    location / {
        try_files $uri $uri/ =404;
    }
}
