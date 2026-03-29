#!/bin/bash

# Termux Setup Script for "היומן של יניב"
# This script automates the installation of Node.js, Git, and project dependencies in Termux.

echo "🚀 Starting Termux setup for 'היומן של יניב'..."

# Update packages
echo "📦 Updating packages..."
pkg update -y && pkg upgrade -y

# Install Node.js and Git
echo "🛠 Installing Node.js and Git..."
pkg install nodejs git -y

# Clone the repository (if not already in it)
if [ ! -d "yoman-google" ]; then
  echo "📥 Cloning repository..."
  git clone https://github.com/yanivmizrachiy/yoman-google.git
  cd yoman-google
else
  echo "✅ Already in project directory."
fi

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
  echo "📝 Creating .env template..."
  echo "GOOGLE_CLIENT_ID=YOUR_CLIENT_ID" > .env
  echo "GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET" >> .env
  echo "APP_URL=http://localhost:3000" >> .env
  echo "GEMINI_API_KEY=YOUR_GEMINI_KEY" >> .env
  echo "⚠️ Please edit the .env file with your real credentials."
fi

# Create startup script
echo "🏃 Creating startup script..."
echo "node server.ts" > start.sh
chmod +x start.sh

echo "✨ Setup complete!"
echo "To start the app, run: ./start.sh"
echo "Note: Make sure to configure your .env file and Google Cloud Console redirect URIs."
