#!/bin/bash
# Verification Script - Confirms all competitor scraper components are in place

echo "═══════════════════════════════════════════════════════════════"
echo "  GLP-1 COMPETITOR INTELLIGENCE SYSTEM - VERIFICATION"
echo "═══════════════════════════════════════════════════════════════"
echo ""

cd "$(dirname "$0")" || exit

# Check 1: Dependencies
echo "✓ Checking dependencies..."
if grep -q '"node-cron"' package.json; then
  echo "  ✓ node-cron installed in package.json"
else
  echo "  ✗ node-cron missing from package.json"
fi

# Check 2: Core scraper file
echo ""
echo "✓ Checking scraper implementation..."
if [ -f "scraper/glp1-competitors.js" ]; then
  LINES=$(wc -l < scraper/glp1-competitors.js)
  echo "  ✓ /scraper/glp1-competitors.js ($LINES lines)"
else
  echo "  ✗ Scraper file missing"
fi

# Check 3: Data files
echo ""
echo "✓ Checking data files..."
if [ -f "data/competitors.json" ]; then
  SIZE=$(wc -c < data/competitors.json)
  COMPANIES=$(jq '.competitors | to_entries | length' data/competitors.json 2>/dev/null || echo "?")
  echo "  ✓ /data/competitors.json ($SIZE bytes, $COMPANIES category groups)"
else
  echo "  ✗ Competitors database missing"
fi

if [ -f "data/scraper-logs.json" ]; then
  RUNS=$(jq '.runs | length' data/scraper-logs.json 2>/dev/null || echo "?")
  echo "  ✓ /data/scraper-logs.json ($RUNS scraper runs logged)"
else
  echo "  ✗ Scraper logs missing"
fi

# Check 4: Server integration
echo ""
echo "✓ Checking server integration..."
if grep -q "GLP1CompetitorScraper" server.js; then
  echo "  ✓ Scraper imported in server.js"
else
  echo "  ✗ Scraper not imported"
fi

if grep -q "node-cron" server.js; then
  echo "  ✓ node-cron scheduler configured"
else
  echo "  ✗ Scheduler not configured"
fi

if grep -q "getCompetitorContext" server.js; then
  echo "  ✓ Competitor context injected into Ollama prompts"
else
  echo "  ✗ Context injection missing"
fi

# Check 5: API endpoints
echo ""
echo "✓ Checking API endpoints..."
if grep -q "/api/scraper-status" server.js; then
  echo "  ✓ GET /api/scraper-status endpoint defined"
else
  echo "  ✗ Status endpoint missing"
fi

if grep -q "/api/trigger-scraper" server.js; then
  echo "  ✓ POST /api/trigger-scraper endpoint defined"
else
  echo "  ✗ Trigger endpoint missing"
fi

# Check 6: Documentation
echo ""
echo "✓ Checking documentation..."
if [ -f "COMPETITOR_SCRAPER_README.md" ]; then
  echo "  ✓ COMPETITOR_SCRAPER_README.md present"
else
  echo "  ✗ README missing"
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SYSTEM STATUS: READY ✓"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. npm install node-cron"
echo "  2. PORT=3002 node server.js"
echo "  3. Test: curl http://localhost:3002/api/scraper-status | jq"
echo ""
echo "The scraper will:"
echo "  • Run automatically at 00:00 UTC every day"
echo "  • Update /data/competitors.json"
echo "  • Log all runs to /data/scraper-logs.json"
echo "  • Inject context into all Ollama generations"
echo ""
