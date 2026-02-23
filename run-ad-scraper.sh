#!/bin/bash
# Quick test script for Facebook Ad Scraper

echo "🤖 Testing Facebook Ad Scraper (USA only)"
echo "=========================================="
echo ""
echo "This will:"
echo "  ✅ Open a browser window"
echo "  ✅ Search Facebook Ad Library for your competitors"
echo "  ✅ Filter by USA ads only"
echo "  ✅ Extract ad IDs and copy"
echo "  ✅ Update competitors.json automatically"
echo ""
echo "⏳ Starting in 3 seconds... (Ctrl+C to cancel)"
sleep 3

cd "$(dirname "$0")"
node scraper/facebook-ad-scraper.js

echo ""
echo "✅ Scraping complete!"
echo "🔄 Restart your server to see the new ads with links"
