server {
    listen 80;
    listen [::]:80;
    server_name renoisethemes.com www.renoisethemes.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name renoisethemes.com www.renoisethemes.com;

    ssl_certificate /etc/letsencrypt/live/renoisethemes.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/renoisethemes.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/renoisethemes/public;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Static files (uploads, CSS, JS) — serve directly, no proxy
    location /uploads/ {
        alias /var/www/renoisethemes/public/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /css/ {
        alias /var/www/renoisethemes/public/css/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location /js/ {
        alias /var/www/renoisethemes/public/js/;
        expires 7d;
        add_header Cache-Control "public";
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
    }
}
