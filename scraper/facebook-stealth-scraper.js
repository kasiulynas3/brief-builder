/**
 * FACEBOOK AD LIBRARY STEALTH SCRAPER
 * ====================================
 * Uses puppeteer-extra with stealth plugin to bypass bot detection
 * 
 * Key techniques:
 * - Stealth plugin (evades 30+ detection methods)
 * - Ad blocker (faster loading, less fingerprinting)
 * - Real user agent rotation
 * - Human-like behavior (random delays, scrolling)
 * - Session persistence
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const fs = require('fs');
const path = require('path');

// Add stealth plugin
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const DATA_DIR = path.join(__dirname, '../data');
const PROFILE_DIR = path.join(__dirname, '../.stealth-profile');
const HEADLESS = process.env.HEADLESS === '1';
const LIMIT_COMPETITORS = parseInt(process.env.LIMIT_COMPETITORS) || 5;

// User agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

// Load competitors
function loadCompetitors() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'competitors.json'), 'utf-8'));
    const allCompetitors = [];
    
    // Handle nested structure: competitors -> category -> brand
    if (data.competitors) {
      for (const [categoryKey, brands] of Object.entries(data.competitors)) {
        if (typeof brands === 'object' && !Array.isArray(brands)) {
          for (const [brandKey, brandData] of Object.entries(brands)) {
            if (brandData.name) {
              allCompetitors.push({
                name: brandData.name,
                category: brandData.category || categoryKey,
                searchTerm: brandData.name.replace(/\s*\(.*?\)\s*/g, '').trim()
              });
            }
          }
        }
      }
    }
    
    console.log(`✅ Loaded ${allCompetitors.length} competitors`);
    return allCompetitors;
  } catch (err) {
    console.error('❌ Error loading competitors:', err.message);
    return [];
  }
}

// Human-like delay
const randomDelay = (min = 1000, max = 3000) => 
  new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

// Simulate human scrolling
async function humanScroll(page, distance = 800) {
  await page.evaluate((dist) => {
    window.scrollBy({
      top: dist,
      behavior: 'smooth'
    });
  }, distance);
  await randomDelay(500, 1500);
}

// Search for competitor ads
async function scrapeCompetitorAds(page, companyName) {
  console.log(`\n📱 Searching for: ${companyName}`);
  
  try {
    // Build Ad Library search URL
    const searchUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&q=${encodeURIComponent(companyName)}&search_type=keyword_unordered&media_type=all`;
    
    console.log(`  🌐 Navigating to Ad Library...`);
    await page.goto(searchUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for page to load
    await randomDelay(2000, 4000);
    
    // Check if we're actually on the Ad Library page
    const pageTitle = await page.title();
    console.log(`  📄 Page title: ${pageTitle}`);
    
    // Don't check for "Log in" text - it appears inside age-restricted ad cards
    // Instead check if we can see ad library specific elements
    const hasAdLibrary = await page.evaluate(() => {
      return document.body.innerText.includes('Library ID') || 
             document.body.innerText.includes('Ad details') ||
             document.querySelector('[aria-label*="Ad"]') !== null;
    });
    
    if (!hasAdLibrary) {
      console.log('  ⚠️  Not on Ad Library page - may need to login first');
      return [];
    }
    
    // Scroll to load more ads
    console.log(`  📜 Scrolling to load ads...`);
    for (let i = 0; i < 5; i++) {
      await humanScroll(page, 800);
      await randomDelay(1000, 2000);
    }
    
    // Try multiple selectors for ad cards
    const selectors = [
      'div[data-testid="search_result_item"]',
      'div[aria-label*="Ad"]',
      'div:has(> *:contains("Library ID"))',
      'div[class*="x1iyjqo2"]', // Common FB class for cards
      '[role="article"]'
    ];
    
    let ads = [];
    
    // Get raw page text and parse it in Node.js (more reliable than page.evaluate)
    console.log(`  🔍 Extracting ad data...`);
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Parse Library IDs from text
    const libraryIdRegex = /Library ID:\s*(\d+)/g;
    const matches = [...pageText.matchAll(libraryIdRegex)];
    
    console.log(`  📊 Found ${matches.length} Library IDs in page text`);
    
    ads = matches.slice(0, 20).map((match, idx) => {
      const libId = match[1];
      const startPos = match.index;
      
      // Get context around this Library ID
      const before = pageText.substring(Math.max(0, startPos - 300), startPos);
      const after = pageText.substring(startPos, startPos + 400);
      
      // Extract date
      let dateRange = '';
      const runningMatch = after.match(/Started running on ([^\n]+)/);
      const rangeMatch = after.match(/([A-Z][a-z]{2}\s+\d+,\s+\d{4})\s*-\s*([A-Z][a-z]{2}\s+\d+,\s+\d{4})/);
      
      if (runningMatch) {
        dateRange = runningMatch[1].trim();
      } else if (rangeMatch) {
        dateRange = `${rangeMatch[1]} - ${rangeMatch[2]}`;
      }
      
      // Try to find brand (line before "Library ID")
      const beforeLines = before.split('\n').filter(l => l.trim().length > 2);
      const brand = beforeLines[beforeLines.length - 1] || `Ad ${idx + 1}`;
      
      return {
        ad_id: libId,
        ad_url: `https://www.facebook.com/ads/library/?id=${libId}`,
        library_id: libId,
        date_range: dateRange,
        brand: brand.substring(0, 100),
        snippet: after.substring(0, 200).replace(/\n/g, ' ').trim()
      };
    });
    
    console.log(`  ✅ Found ${ads.length} ads`);
    
    if (ads.length === 0) {
      console.log(`  ⚠️  No ads extracted - checking page content...`);
      
      // Debug: Check what's on the page
      const debugInfo = await page.evaluate(() => {
        return {
          hasLibraryId: document.body.innerText.includes('Library ID'),
          hasSeeDetails: document.body.innerText.includes('See summary details'),
          firstLibraryId: document.body.innerText.match(/Library ID:\s*(\d+)/)?.[1],
          bodySnippet: document.body.innerText.substring(0, 500)
        };
      });
      
      console.log(`  📊 Debug info:`, debugInfo);
      
      // Save screenshot for debugging
      const screenshotPath = path.join(DATA_DIR, `debug-${companyName.replace(/\s+/g, '-')}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  📸 Screenshot saved to ${screenshotPath}`);
    }
    
    return ads;
    
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return [];
  }
}

// Main
async function main() {
  console.log('🥷 Facebook Ad Library Stealth Scraper');
  console.log('=' .repeat(60));
  console.log(`Mode: ${HEADLESS ? 'Headless' : 'Visible'}`);
  console.log('Stealth: ✅ Enabled (30+ evasion techniques)');
  console.log('Ad Blocker: ✅ Enabled\n');
  
  const competitors = loadCompetitors();
  
  // Reorder to start with Lemme (Kardashian brand)
  const lemmeIndex = competitors.findIndex(c => c.name.toLowerCase().includes('lemme'));
  if (lemmeIndex > 0) {
    const [lemme] = competitors.splice(lemmeIndex, 1);
    competitors.unshift(lemme);
  }
  
  const competitorsToScrape = competitors.slice(0, LIMIT_COMPETITORS);
  
  console.log(`🎯 Found ${competitors.length} competitors`);
  console.log(`📊 Scraping first ${competitorsToScrape.length} (starting with ${competitorsToScrape[0]?.name})\n`);
  
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    userDataDir: PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });
  
  const page = await browser.newPage();
  
  // Set random user agent
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  await page.setUserAgent(userAgent);
  
  // Additional stealth
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });
  
  const results = {};
  let totalAds = 0;
  const startTime = Date.now();
  
  for (const comp of competitorsToScrape) {
    const ads = await scrapeCompetitorAds(page, comp.searchTerm);
    
    if (!results[comp.category]) {
      results[comp.category] = [];
    }
    
    results[comp.category].push({
      name: comp.name,
      searchTerm: comp.searchTerm,
      adCount: ads.length,
      ads: ads
    });
    
    totalAds += ads.length;
    
    // Human-like pause between searches
    await randomDelay(3000, 6000);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Scrape complete in ${duration}s`);
  console.log(`📊 Total ads found: ${totalAds}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Save results
  const outputPath = path.join(DATA_DIR, 'facebook-ads-stealth.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`📁 Results saved to ${outputPath}`);
  
  if (!HEADLESS) {
    console.log('\n⏸️  Browser kept open for inspection. Press Ctrl+C to close.');
  } else {
    await browser.close();
  }
  
  return results;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { scrapeCompetitorAds };
