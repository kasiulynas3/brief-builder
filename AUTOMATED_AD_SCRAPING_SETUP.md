# Automated Facebook Ad Scraping Setup

## Overview
Automatically extract competitor ads from Facebook Ad Library (USA only) with real ad IDs and copy.

## ⚠️ Important Notes

**Facebook blocks automated scraping** - This tool uses Puppeteer with stealth plugins to appear as a real browser, but:
- Rate limiting may occur
- Manual CAPTCHA solving might be needed occasionally  
- Facebook may update their layout, breaking selectors
- Use responsibly and comply with Facebook's Terms of Service

## Installation

### 1. Install Dependencies

```bash
cd /Users/antanaskasiulynas/brief-builder
npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
```

### 2. Run the Scraper

```bash
# Run once manually to test
node scraper/facebook-ad-scraper.js
```

The scraper will:
1. Open a browser window (you can watch it work)
2. Visit Facebook Ad Library for each competitor
3. Filter ads by USA country
4. Extract ad copy/hooks and ad IDs
5. Update `data/competitors.json` automatically

### 3. Schedule Automated Runs

Add to your cron job or run periodically:

```bash
# Run every day at 2 AM
0 2 * * * cd /Users/antanaskasiulynas/brief-builder && node scraper/facebook-ad-scraper.js
```

## How It Works

1. **Launches Browser**: Uses Puppeteer with stealth plugins to avoid bot detection
2. **Searches Competitors**: For each competitor in your database, searches Facebook Ad Library
3. **Filters by USA**: Only extracts ads shown in the United States
4. **Extracts Data**:
   - Ad ID (from URL)
   - Ad copy/hook text
   - Full ad URL
5. **Updates Database**: Adds new ads to `competitors.json` with format:
   ```json
   {
     "hook": "Your ad headline here",
     "ad_url": "https://www.facebook.com/ads/library/?id=805626925889930"
   }
   ```

## Troubleshooting

### Issue: "Puppeteer not installed"
**Solution**: Run `npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth`

### Issue: No ads found
**Possible causes**:
- Facebook layout changed (selectors need updating)
- Competitor has no active US ads
- Rate limiting/blocking

**Solution**: 
- Check browser window to see what's displayed
- Try running with `headless: false` to watch the scraping
- Increase wait times in the code

### Issue: "Ad text extraction needed"
**Cause**: Scraper found ad ID but couldn't extract the headline/copy

**Solution**:
- Facebook's HTML structure may have changed
- Update the selector logic in `page.evaluate()`
- Manually add the ad copy using `import-ads.js`

### Issue: CAPTCHA appears
**Solution**:
- Solve it manually in the browser window
- Reduce scraping frequency
- Add longer delays between requests

## Configuration

Edit `scraper/facebook-ad-scraper.js`:

```javascript
// Line ~77: Set headless mode
headless: false, // true = background, false = visible browser

// Line ~113: Max ads per competitor
await this.scrapeCompetitorAds(comp.name, 5); // Change 5 to desired number

// Line ~200: Number of competitors to scrape
for (const comp of competitorNames.slice(0, 5)) { // Change 5 to scrape more

// Line ~206: Delay between competitors
await this.page.waitForTimeout(10000); // 10000 = 10 seconds
```

## Alternative: Manual Import

If automation doesn't work, use the manual import tool:

```bash
node import-ads.js list  # See all competitors
# Edit import-ads.js to add ad URLs
node import-ads.js       # Import them
```

## Legal & Ethical Considerations

- ✅ Use for competitive research
- ✅ Respect rate limits
- ✅ Don't overload Facebook's servers
- ❌ Don't resell scraped data
- ❌ Don't violate Facebook's Terms of Service

**Recommendation**: Use official Facebook Marketing API for production use.

## Official API Alternative

For production/commercial use, consider:
- **Facebook Marketing API**: https://developers.facebook.com/docs/marketing-api/
- Requires API key and approval
- More reliable and legal
- No CAPTCHA/blocking issues
