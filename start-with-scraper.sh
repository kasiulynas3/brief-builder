#!/bin/bash
# GLP-1 Competitor Scraper + Hook Generator Launcher
# =================================================
# Starts the server with automatic daily competitor intelligence updates

cd "$(dirname "$0")"

echo "🚀 Starting GLP-1 Hook Generator with Competitor Intelligence System..."
echo ""

# Kill any existing node processes
pkill -9 node 2>/dev/null

sleep 2

# Start server
export PORT=${PORT:-3002}
node server.js

# The server will:
# ✓ Load competitor database from /data/competitors.json
# ✓ Initialize GLP1CompetitorScraper
# ✓ Run initial scrape on startup
# ✓ Schedule daily scrape at midnight UTC (via node-cron)
# ✓ Inject competitor context into all Ollama generations
# ✓ Provide API endpoints:
#   - GET  /api/scraper-status → competitor intelligence status
#   - POST /api/trigger-scraper → manually run scraper
