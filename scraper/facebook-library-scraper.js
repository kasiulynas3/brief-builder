#!/usr/bin/env node

/**
 * Facebook Ad Library Public Scraper
 * 
 * Automatically extracts Library IDs and full ad details from Facebook's public Ad Library
 * No authentication required - uses publicly available data
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// Configuration
const HEADLESS = false; // Set to true for production
const DELAY_BETWEEN_SEARCHES = 3000; // 3 seconds between competitor searches
const DELAY_BETWEEN_ADS = 2000; // 2 seconds between ad detail page loads
const MAX_ADS_PER_COMPETITOR = 10; // How many ads to scrape per competitor
const SCROLL_PAUSE_TIME = 2000; // Time to wait after scrolling

// Helper function for delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// File paths
const COMPETITORS_FILE = path.join(__dirname, '../data/competitors.json');
const BACKUP_FILE = path.join(__dirname, '../data/competitors_backup_' + Date.now() + '.json');

/**
 * Extract Library ID from various ad elements
 */
function extractLibraryId(adElement) {
  const patterns = [
    /Library ID:\s*(\d+)/i,
    /library.*?(\d{13,})/i,
    /id=(\d{13,})/,
  ];

  const text = adElement.textContent || '';
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Scroll to load more ads
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

/**
 * Extract Library IDs from search results page
 */
async function extractLibraryIds(page, maxAds = 10) {
  console.log('   📋 Extracting Library IDs from search results...');
  
  const libraryIds = [];
  let attempts = 0;
  const maxAttempts = 5;
  
  while (libraryIds.length < maxAds && attempts < maxAttempts) {
    attempts++;
    
    // Scroll to load more ads
    await autoScroll(page);
    await sleep(SCROLL_PAUSE_TIME);
    
    // Extract IDs from the page
    const ids = await page.evaluate(() => {
      const extractedIds = [];
      
      // Look for Library ID text in the page
      const libraryIdPattern = /Library ID:\s*(\d+)/gi;
      const bodyText = document.body.innerText;
      let match;
      
      while ((match = libraryIdPattern.exec(bodyText)) !== null) {
        if (match[1] && !extractedIds.includes(match[1])) {
          extractedIds.push(match[1]);
        }
      }
      
      // Also look for ad detail buttons/links
      const detailButtons = Array.from(document.querySelectorAll('a[href*="id="], div[data-testid]'));
      detailButtons.forEach(button => {
        const href = button.getAttribute('href') || '';
        const idMatch = href.match(/id=(\d{13,})/);
        if (idMatch && idMatch[1] && !extractedIds.includes(idMatch[1])) {
          extractedIds.push(idMatch[1]);
        }
      });
      
      return extractedIds;
    });
    
    // Add new IDs
    ids.forEach(id => {
      if (!libraryIds.includes(id) && libraryIds.length < maxAds) {
        libraryIds.push(id);
      }
    });
    
    console.log(`   ✓ Found ${libraryIds.length} Library IDs so far...`);
    
    if (libraryIds.length >= maxAds) {
      break;
    }
  }
  
  return libraryIds.slice(0, maxAds);
}

/**
 * Extract ad details from a Library ID detail page
 */
async function extractAdDetails(page, libraryId) {
  try {
    const url = `https://www.facebook.com/ads/library/?id=${libraryId}`;
    console.log(`   🔍 Fetching details for Library ID: ${libraryId}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);
    
    // Extract ad details
    const adData = await page.evaluate((id) => {
      const details = {
        library_id: id,
        ad_url: `https://www.facebook.com/ads/library/?id=${id}`,
        primary_text: '',
        headline: '',
        description: '',
        cta: '',
        platforms: [],
        started_running: '',
        page_name: '',
      };
      
      // Extract text content
      const bodyText = document.body.innerText;
      
      // Extract page name (usually at the top)
      const pageNameMatch = bodyText.match(/([^\n]+)\s+Sponsored/);
      if (pageNameMatch) {
        details.page_name = pageNameMatch[1].trim();
      }
      
      // Look for started running date
      const dateMatch = bodyText.match(/Started running on ([A-Za-z]{3} \d{1,2}, \d{4})/);
      if (dateMatch) {
        details.started_running = dateMatch[1];
      }
      
      // Extract platforms (look for platform icons or text)
      const platformsText = bodyText.toLowerCase();
      if (platformsText.includes('facebook')) details.platforms.push('Facebook');
      if (platformsText.includes('instagram')) details.platforms.push('Instagram');
      if (platformsText.includes('messenger')) details.platforms.push('Messenger');
      if (platformsText.includes('audience network')) details.platforms.push('Audience Network');
      
      // Try to find the main ad content
      // Look for paragraphs or divs with substantial text
      const textElements = Array.from(document.querySelectorAll('div, p, span'));
      const contentTexts = textElements
        .map(el => el.textContent?.trim() || '')
        .filter(text => text.length > 20 && text.length < 500)
        .filter(text => !text.includes('Library ID'))
        .filter(text => !text.includes('See ad details'))
        .filter(text => !text.includes('Started running'));
      
      if (contentTexts.length > 0) {
        // The first substantial text is usually the primary text
        details.primary_text = contentTexts[0];
        
        // If there's more text, it might be headline or description
        if (contentTexts.length > 1) {
          details.headline = contentTexts[1];
        }
        if (contentTexts.length > 2) {
          details.description = contentTexts[2];
        }
      }
      
      // Look for CTA button text
      const ctaPatterns = ['Learn More', 'Shop Now', 'Sign Up', 'Get Started', 'Book Now', 'Apply Now', 'Download', 'Subscribe'];
      for (const cta of ctaPatterns) {
        if (bodyText.includes(cta)) {
          details.cta = cta;
          break;
        }
      }
      
      return details;
    }, libraryId);
    
    console.log(`   ✅ Extracted: "${adData.primary_text?.substring(0, 50)}..."`);
    
    return adData;
    
  } catch (error) {
    console.error(`   ❌ Error extracting details for ${libraryId}:`, error.message);
    return null;
  }
}

/**
 * Search for competitor ads and extract details
 */
async function scrapeCompetitorAds(browser, companyName, maxAds = 10) {
  const page = await browser.newPage();
  
  try {
    console.log(`\n🔎 Searching for: ${companyName}`);
    
    // Build the Ad Library search URL
    const searchUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&q=${encodeURIComponent(companyName)}&search_type=keyword_unordered`;
    
    console.log(`   🌐 Opening: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for content to load
    await sleep(3000);
    
    // Extract Library IDs
    const libraryIds = await extractLibraryIds(page, maxAds);
    
    if (libraryIds.length === 0) {
      console.log(`   ⚠️  No ads found for ${companyName}`);
      await page.close();
      return [];
    }
    
    console.log(`   📊 Found ${libraryIds.length} ads for ${companyName}`);
    
    // Extract details for each ad
    const adsData = [];
    for (const libraryId of libraryIds) {
      const adDetails = await extractAdDetails(page, libraryId);
      if (adDetails && adDetails.primary_text) {
        adsData.push(adDetails);
      }
      await sleep(DELAY_BETWEEN_ADS);
    }
    
    console.log(`   ✅ Successfully extracted ${adsData.length} ads`);
    
    await page.close();
    return adsData;
    
  } catch (error) {
    console.error(`   ❌ Error scraping ${companyName}:`, error.message);
    await page.close();
    return [];
  }
}

/**
 * Update competitors.json with scraped ad data
 */
function updateCompetitorsData(scrapedAds) {
  console.log('\n💾 Updating competitors.json...');
  
  // Backup existing file
  if (fs.existsSync(COMPETITORS_FILE)) {
    fs.copyFileSync(COMPETITORS_FILE, BACKUP_FILE);
    console.log(`   📦 Backup created: ${path.basename(BACKUP_FILE)}`);
  }
  
  // Read current data
  const data = JSON.parse(fs.readFileSync(COMPETITORS_FILE, 'utf8'));
  
  let totalAdded = 0;
  let totalUpdated = 0;
  
  // Update each competitor with their ads
  Object.values(data.competitors).forEach(category => {
    Object.entries(category).forEach(([competitorKey, competitor]) => {
      const companyName = competitor.name;
      
      // Find scraped ads for this competitor
      const competitorAds = scrapedAds.filter(ad => 
        ad.companyName === companyName
      );
      
      if (competitorAds.length === 0) return;
      
      // Ensure ads_observed is an array
      if (!Array.isArray(competitor.ads_observed)) {
        competitor.ads_observed = [];
      }
      
      // Add new ads
      competitorAds.forEach(adData => {
        adData.ads.forEach(ad => {
          // Check if this ad already exists (by library_id or primary text)
          const existingAdIndex = competitor.ads_observed.findIndex(existingAd => {
            if (typeof existingAd === 'object' && existingAd.ad_url) {
              return existingAd.ad_url === ad.ad_url;
            }
            return false;
          });
          
          // Create ad object
          const adObject = {
            hook: ad.primary_text || ad.headline || 'No text found',
            ad_url: ad.ad_url,
            library_id: ad.library_id,
            headline: ad.headline,
            description: ad.description,
            cta: ad.cta,
            platforms: ad.platforms,
            started_running: ad.started_running,
            scraped_date: new Date().toISOString().split('T')[0]
          };
          
          if (existingAdIndex >= 0) {
            // Update existing ad
            competitor.ads_observed[existingAdIndex] = adObject;
            totalUpdated++;
          } else {
            // Add new ad
            competitor.ads_observed.push(adObject);
            totalAdded++;
          }
        });
      });
    });
  });
  
  // Update metadata
  if (!data.scraper_metadata) {
    data.scraper_metadata = {};
  }
  data.scraper_metadata.last_update = new Date().toISOString();
  data.scraper_metadata.last_scraper = 'facebook-library-scraper';
  
  // Save updated data
  fs.writeFileSync(COMPETITORS_FILE, JSON.stringify(data, null, 2));
  
  console.log(`   ✅ Added ${totalAdded} new ads`);
  console.log(`   ✅ Updated ${totalUpdated} existing ads`);
  console.log(`   💾 Saved to: ${COMPETITORS_FILE}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🤖 Facebook Ad Library Public Scraper');
  console.log('════════════════════════════════════════════════════\n');
  
  // Load competitors
  const data = JSON.parse(fs.readFileSync(COMPETITORS_FILE, 'utf8'));
  
  // Get list of all competitors
  const competitorsList = [];
  Object.values(data.competitors).forEach(category => {
    Object.values(category).forEach(competitor => {
      competitorsList.push(competitor.name);
    });
  });
  
  console.log(`🎯 Found ${competitorsList.length} competitors to scrape`);
  console.log(`📊 Will scrape up to ${MAX_ADS_PER_COMPETITOR} ads per competitor\n`);
  
  // Limit to first 5 for testing
  const competitorsToScrape = competitorsList.slice(0, 5);
  console.log(`🔧 Scraping first ${competitorsToScrape.length} competitors for testing:\n`);
  competitorsToScrape.forEach((name, i) => {
    console.log(`   ${i + 1}. ${name}`);
  });
  
  // Launch browser
  console.log('\n🌐 Launching browser...');
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  
  const allScrapedAds = [];
  
  // Scrape each competitor
  for (const companyName of competitorsToScrape) {
    const ads = await scrapeCompetitorAds(browser, companyName, MAX_ADS_PER_COMPETITOR);
    if (ads.length > 0) {
      allScrapedAds.push({
        companyName,
        ads
      });
    }
    await sleep(DELAY_BETWEEN_SEARCHES);
  }
  
  await browser.close();
  
  console.log('\n📊 Scraping Summary');
  console.log('════════════════════════════════════════════════════');
  console.log(`Total competitors scraped: ${allScrapedAds.length}`);
  console.log(`Total ads found: ${allScrapedAds.reduce((sum, c) => sum + c.ads.length, 0)}`);
  
  // Update competitors.json
  if (allScrapedAds.length > 0) {
    updateCompetitorsData(allScrapedAds);
  } else {
    console.log('\n⚠️  No ads scraped - competitors.json not updated');
  }
  
  console.log('\n✅ Scraping complete!');
}

// Run the scraper
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
