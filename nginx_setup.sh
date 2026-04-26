#!/bin/bash

# Exit on error
set -e

# Configuration
DOMAIN="keyboard.work.gd"
REMOTE_IP="206.206.76.143"
EMAIL="admin@$DOMAIN" # Replace with your real email for SSL renewal notifications

echo "🌐 Starting Nginx setup for $DOMAIN on $REMOTE_IP..."

# 1. Update system and install Nginx & Certbot
echo "📦 Updating package lists and installing Nginx and Certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. Create Nginx configuration (Initial HTTP)
echo "🛠 Creating Nginx configuration for $DOMAIN..."
cat <<EOF | sudo tee /etc/nginx/sites-available/$DOMAIN
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# 3. Enable the configuration and test
echo "🔗 Enabling the site configuration..."
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

# Remove default config if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm /etc/nginx/sites-enabled/default
fi

echo "🧪 Testing Nginx configuration..."
sudo nginx -t

# 4. Restart Nginx
echo "⚙️ Restarting Nginx..."
sudo systemctl restart nginx

# 5. Firewall configuration
if command -v ufw &> /dev/null; then
    echo "🛡 Configuring firewall to allow HTTP and HTTPS..."
    sudo ufw allow 'Nginx Full'
fi

# 6. Obtain SSL Certificate via Certbot
echo "🔐 Obtaining SSL Certificate for $DOMAIN..."
# Note: This will fail if the domain is not pointing to this server yet
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $EMAIL --redirect

# 7. Final Restart
echo "⚙️ Restarting Nginx to apply SSL..."
sudo systemctl restart nginx

echo "✨ Nginx HTTPS setup complete!"
echo "📍 Your website should now be accessible at: https://$DOMAIN"
echo "⚠️  Note: Make sure your Next.js application is running on port 3000."
