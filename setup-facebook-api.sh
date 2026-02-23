#!/bin/bash
# Quick setup helper for Facebook API

echo "🔧 Facebook Ad Library API Setup"
echo "=================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file"
else
    echo "✅ .env file already exists"
fi

# Check if access token is set
if grep -q "^FACEBOOK_ACCESS_TOKEN=" .env 2>/dev/null; then
    echo "✅ Facebook access token is configured"
    echo ""
    echo "🚀 Ready to run! Execute:"
    echo "   node scraper/facebook-api-scraper.js"
else
    echo ""
    echo "⚠️  Facebook access token not configured"
    echo ""
    echo "📋 Next steps:"
    echo ""
    echo "1. Go to: https://developers.facebook.com/tools/explorer/"
    echo "   (Opens in 5 seconds...)"
    echo ""
    echo "2. Create a Facebook app if you don't have one"
    echo ""
    echo "3. In Graph API Explorer:"
    echo "   - Select your app from dropdown"
    echo "   - Click 'Generate Access Token'"
    echo "   - Copy the token"
    echo ""
    echo "4. Edit .env file and add your token:"
    echo "   FACEBOOK_ACCESS_TOKEN=paste_your_token_here"
    echo ""
    echo "5. Run: node scraper/facebook-api-scraper.js"
    echo ""
    
    # Wait and open browser
    sleep 5
    if command -v open &> /dev/null; then
        echo "🌐 Opening Facebook Developer Tools..."
        open "https://developers.facebook.com/tools/explorer/"
    fi
fi

echo ""
echo "📚 Full setup guide: FACEBOOK_API_SETUP.md"
echo ""
