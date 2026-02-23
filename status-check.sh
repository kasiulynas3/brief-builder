#!/bin/bash

echo "════════════════════════════════════════════════════════════════"
echo "📊 FACEBOOK ADS EXTRACTION STATUS CHECK"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check extraction process
echo "🔄 EXTRACTION PROCESS:"
if ps aux | grep "extract-and-analyze" | grep -v grep > /dev/null; then
    PID=$(ps aux | grep "extract-and-analyze" | grep -v grep | awk '{print $2}')
    echo "   ✅ Running (PID: $PID)"
else
    echo "   ❌ NOT RUNNING"
fi

# Check server
echo ""
echo "🌐 API SERVER:"
if lsof -i :3002 > /dev/null 2>&1; then
    echo "   ✅ Running on port 3002"
else
    echo "   ❌ NOT RUNNING"
fi

# Count saved ads
echo ""
echo "💾 SAVED & ANALYZED ADS:"
COUNT=$(jq 'length' /Users/antanaskasiulynas/brief-builder/data/facebook-ads-analyzed.json 2>/dev/null || echo "0")
echo "   📈 $COUNT / 497 ads completed"
PERCENT=$((COUNT * 100 / 497))
echo "   📊 Progress: $PERCENT%"

# Last progress line
echo ""
echo "📝 LATEST PROGRESS:"
tail -1 /tmp/extraction-full.log 2>/dev/null || echo "   (no log yet)"

# ETA
echo ""
echo "⏱️  ETA:"
if [ "$COUNT" -gt 0 ]; then
    # Rough calculation based on 10 sec/ad observed
    REMAINING=$((497 - COUNT))
    MINUTES=$((REMAINING / 6))  # ~6 ads per minute
    echo "   ⏰ ~$MINUTES minutes remaining"
else
    echo "   ⏰ ~80 minutes (from start)"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✨ VIEW LIVE PROGRESS: tail -f /tmp/extraction-full.log"
echo "✨ API ENDPOINT: http://localhost:3002/api/competitor-news"
echo "════════════════════════════════════════════════════════════════"
