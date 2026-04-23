#!/bin/bash

# Exit on error
set -e

# Configuration
DOMAIN="amez-research.work.gd"
REMOTE_IP="148.113.3.139"

echo "🌐 Starting Nginx setup for $DOMAIN on $REMOTE_IP..."

# 1. Update system and install Nginx
echo "📦 Updating package lists and installing Nginx..."
sudo apt update
sudo apt install -y nginx

# 2. Create Nginx configuration
echo "🛠 Creating Nginx configuration for $DOMAIN..."
cat <<EOF | sudo tee /etc/nginx/sites-available/$DOMAIN
server {
    listen 80;
    server_name $DOMAIN $REMOTE_IP;

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

# 5. Firewall configuration (Optional but recommended)
if command -v ufw &> /dev/null; then
    echo "🛡 Configuring firewall to allow HTTP (port 80)..."
    sudo ufw allow 'Nginx Full'
fi

echo "✨ Nginx setup complete!"
echo "📍 Your website should now be accessible at: http://$DOMAIN"
echo "⚠️  Note: Make sure your Next.js application is running on port 3000 (e.g., via 'yarn start')."
