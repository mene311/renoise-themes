server {
    listen 80;
    listen [::]:80;
    server_name renoisethemes.com www.renoisethemes.com;
    return 308 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name renoisethemes.com www.renoisethemes.com;

    ssl_certificate /etc/letsencrypt/live/renoisethemes.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/renoisethemes.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/renoisethemes/public;
    index index.html;

    # Upload size limit (match Multer config)
    client_max_body_size 10M;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    # Static files — serve directly, no proxy
    # Note: add_header in location blocks replaces parent-level headers,
    # so we must repeat all security headers here
    location /uploads/ {
        root /var/www/renoisethemes/public;
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Content-Security-Policy "default-src 'self'" always;
    }

    location /css/ {
        root /var/www/renoisethemes/public;
        expires 7d;
        add_header Cache-Control "public";
        add_header X-Content-Type-Options "nosniff" always;
    }

    location /js/ {
        root /var/www/renoisethemes/public;
        expires 7d;
        add_header Cache-Control "public";
        add_header X-Content-Type-Options "nosniff" always;
    }

    # Everything else → Node.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_request_buffering off;
    }
}
