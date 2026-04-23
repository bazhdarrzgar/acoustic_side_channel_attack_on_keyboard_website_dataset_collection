#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting setup for amez_project..."

# 0. Check for system dependencies
for cmd in curl git; do
    if ! command -v $cmd &> /dev/null; then
        echo "❌ Error: $cmd is not installed. Please install it first (e.g., sudo apt install $cmd)."
        exit 1
    fi
done

# 1. Check if NVM is installed, if not install it
export NVM_DIR="$HOME/.nvm"

if [ ! -d "$NVM_DIR" ]; then
    echo "📦 NVM (Node Version Manager) not found. Installing..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    
    # Load nvm for the current session
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
else
    echo "✅ NVM is already installed."
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# 2. Install and use Node 20 LTS
echo "🟢 Installing Node.js 20 (LTS)..."
nvm install 20
nvm use 20
nvm alias default 20

# 4. Install Yarn
echo "🧶 Installing Yarn..."
corepack enable
corepack prepare yarn@stable --activate

# 5. Verify installation
NODE_VER=$(node -v)
YARN_VER=$(yarn -v)
echo "✅ Using Node $NODE_VER"
echo "✅ Using Yarn $YARN_VER"

# 6. Install project dependencies
echo "🛠 Installing project dependencies with Yarn..."
yarn install

echo "✨ Setup complete! You can now run the project using:"
echo "   yarn dev"
