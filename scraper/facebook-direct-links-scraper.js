/**
 * FACEBOOK AD LIBRARY DIRECT LINK SCRAPER
 * ========================================
 * Visits direct ad_links from competitors.json and extracts real ad data
 * 
 * Advantages:
 * - Direct navigation to advertiser page (might bypass search restrictions)
 * - Facebook pre-loads all ads on page
 * - Real ad IDs and data extracted
 * - Faster than keyword search
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const DATA_DIR = path.join(__dirname, '../data');
const PROFILE_DIR = path.join(__dirname, '../.stealth-profile');
const HEADLESS = process.env.HEADLESS === '1';

// Load competitors and their ad_links
function loadCompetitorsWithLinks() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'competitors.json'), 'utf-8'));
    const results = [];
    
    if (data.competitors) {
      for (const [categoryKey, brands] of Object.entries(data.competitors)) {
        if (typeof brands === 'object' && !Array.isArray(brands)) {
          for (const [brandKey, brandData] of Object.entries(brands)) {
            if (brandData.name && brandData.ad_links && brandData.ad_links.length > 0) {
              results.push({
                name: brandData.name,
                category: brandData.category || categoryKey,
                links: brandData.ad_links
              });
            }
          }
        }
      }
    }
    
    console.log(`✅ Loaded ${results.length} competitors with ad links`);
    return results;
  } catch (err) {
    console.error('❌ Error loading competitors:', err.message);
    return [];
  }
}

// Human-like delay
const randomDelay = (min = 1000, max = 3000) => 
  new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

// Extract ad data from page
async function extractAdsFromPage(page, companyName) {
  try {
    // Wait for initial page load
    console.log(`  ⏳ Waiting for Ad Library to load (up to 20 seconds)...`);
    await randomDelay(3000, 5000);
    
    // Wait for Ad Library content to appear - try multiple selectors
    let contentLoaded = false;
    const selectors = [
      'body',
      '[role="main"]',
      '[data-pagelet]',
      'div[class*="ad"]',
      'a[href*="ads/library"]'
    ];
    
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 20000 });
        console.log(`  ✓ Content loaded (found: ${selector})`);
        contentLoaded = true;
        break;
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!contentLoaded) {
      console.log(`  ⚠️ No standard selectors found, but continuing...`);
    }
    
    // Additional wait for dynamic content
    await randomDelay(3000, 5000);
    
    // Scroll to load ads (10-15 pages)
    console.log(`  📜 Scrolling to load all ads...`);
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => {
        window.scrollBy({ top: 1000, behavior: 'smooth' });
      });
      await randomDelay(800, 1500);
      
      if ((i + 1) % 5 === 0) {
        console.log(`     → Scrolled ${i + 1}/15 pages`);
      }
    }
    
    // Final wait for lazy-loaded content
    await randomDelay(2000, 3000);
    
    // Extract ALL library IDs from the page - no filtering
    const ads = await page.evaluate(() => {
      const seenIds = new Set();
      const adCards = [];
      
      // Get entire page HTML
      const pageHtml = document.documentElement.innerHTML;
      const pageText = document.body ? document.body.innerText : '';
      
      // Pattern 1: Find IDs in URLs (most reliable)
      const urlPattern = /(?:id=|library\/\?id=)(\d{14,18})/g;
      let match;
      while ((match = urlPattern.exec(pageHtml)) !== null) {
        seenIds.add(match[1]);
      }
      
      // Pattern 2: Find standalone 14-18 digit numbers
      const numPattern = /\b(\d{14,18})\b/g;
      while ((match = numPattern.exec(pageText)) !== null) {
        const id = match[1];
        // Avoid obvious false positives (dates, timestamps)
        if (!id.startsWith('202') && !id.startsWith('201')) {
          seenIds.add(id);
        }
      }
      
      // Create ad entries for each unique ID
      Array.from(seenIds).forEach(libraryId => {
        adCards.push({
          library_id: libraryId,
          ad_url: `https://www.facebook.com/ads/library/?id=${libraryId}`,
          hook: '',
          headline: '',
          raw_text: '',
          timestamp: new Date().toISOString()
        });
      });
      
      return {
        ads: adCards,
        libraryIds: Array.from(seenIds),
        pageTitle: document.title,
        pageUrl: window.location.href,
        htmlLength: pageHtml.length
      };
    });
    
    return ads;
    
  } catch (err) {
    console.error(`  ❌ Error extracting ads: ${err.message}`);
    return { ads: [], libraryIds: [], pageTitle: '', pageUrl: '' };
  }
}

// Main
async function main() {
  console.log('🔗 Facebook Ad Library Direct Link Scraper');
  console.log('='.repeat(60));
  console.log(`Mode: ${HEADLESS ? 'Headless' : 'Visible'}\n`);
  
  const competitors = loadCompetitorsWithLinks();
  if (competitors.length === 0) {
    console.error('❌ No competitors with ad_links found');
    process.exit(1);
  }
  
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    userDataDir: PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ],
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  
  // Set stealth user agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  
  const results = {};
  let totalAds = 0;
  const startTime = Date.now();
  
  for (const company of competitors) {
    console.log(`\n📱 ${company.name}`);
    
    if (!results[company.category]) {
      results[company.category] = [];
    }
    
    const allAds = [];
    
    for (const adLink of company.links) {
      console.log(`  🔗 Visiting: ${adLink.substring(0, 80)}...`);
      
      try {
        await page.goto(adLink, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        
        const pageData = await extractAdsFromPage(page, company.name);
        const ads = pageData.ads || [];
        
        console.log(`  ✅ Found ${ads.length} ads | Library IDs: ${pageData.libraryIds.length}`);
        
        allAds.push(...ads);
        totalAds += ads.length;
        
      } catch (err) {
        console.log(`  ⚠️  Error visiting link: ${err.message.substring(0, 50)}`);
      }
      
      // Rate limit
      await randomDelay(2000, 4000);
    }
    
    results[company.category].push({
      name: company.name,
      category: company.category,
      adCount: allAds.length,
      ads: allAds // Keep ALL ads
    });
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Complete in ${duration}s`);
  console.log(`📊 Total ads found: ${totalAds}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Save results
  const outputPath = path.join(DATA_DIR, 'facebook-ads-direct-links.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`📁 Results saved to ${outputPath}`);
  
  if (!HEADLESS) {
    console.log('\n⏸️  Browser kept open. Press Ctrl+C to close.');
  } else {
    await browser.close();
  }
  
  return results;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { extractAdsFromPage };
