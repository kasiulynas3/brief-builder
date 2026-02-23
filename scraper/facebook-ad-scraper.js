/**
 * FACEBOOK AD LIBRARY AUTOMATED SCRAPER
 * ======================================
 * Automatically extracts US competitor ads from Facebook Ad Library
 * - Filters by country: USA only
 * - Extracts ad copy/hooks and ad IDs
 * - Updates competitors.json with real ad URLs
 * 
 * Requirements:
 *   npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
 */

const fs = require('fs');
const path = require('path');

// Check if puppeteer is installed
let puppeteer, puppeteerExtra, StealthPlugin;
try {
  puppeteerExtra = require('puppeteer-extra');
  StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteerExtra.use(StealthPlugin());
} catch (err) {
  console.error('❌ Puppeteer not installed. Run:');
  console.error('   npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth');
  process.exit(1);
}

const DATA_PATH = path.join(__dirname, '../data/competitors.json');

class FacebookAdScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.competitorData = this.loadCompetitorData();
  }

  loadCompetitorData() {
    try {
      if (fs.existsSync(DATA_PATH)) {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      }
    } catch (err) {
      console.error('Error loading competitor data:', err.message);
    }
    return null;
  }

  async init() {
    console.log('🚀 Launching browser...');
    this.browser = await puppeteerExtra.launch({
      headless: false, // Set to true for background operation
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
    
    // Set extra headers to appear more like a real browser
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
  }

  async scrapeCompetitorAds(companyName, maxAds = 10) {
    console.log(`\n📱 Scraping ads for: ${companyName}`);
    
    const searchQuery = encodeURIComponent(companyName);
    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&q=${searchQuery}&search_type=keyword_unordered&media_type=all`;
    
    console.log(`🔗 Opening: ${url}`);
    
    try {
      await this.page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for ads to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if there's a "No results" message
      const noResults = await this.page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('No results found') || text.includes('didn\'t find any results');
      });

      if (noResults) {
        console.log(`⚠️  No ads found for ${companyName}`);
        return [];
      }

      // Scroll to load more ads
      console.log('📜 Loading ads...');
      for (let i = 0; i < 3; i++) {
        await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // Extract ad data
      const ads = await this.page.evaluate((maxAds) => {
        const results = [];
        
        // Find all ad containers (this selector may need adjustment based on FB's current structure)
        const adElements = document.querySelectorAll('[data-pagelet^="AdCard"], [class*="AdCard"]');
        
        if (adElements.length === 0) {
          // Try alternative selectors
          const altElements = document.querySelectorAll('div[role="article"]');
          console.log('Using alternative selector, found:', altElements.length);
        }

        // Try to find ads using text patterns
        const allText = document.body.innerText;
        const adSections = allText.split('\n\n').filter(section => 
          section.length > 20 && section.length < 500
        );

        // Look for ad IDs in links
        const links = Array.from(document.querySelectorAll('a[href*="facebook.com/ads/library"]'));
        
        links.forEach((link, index) => {
          if (index >= maxAds) return;
          
          const href = link.href;
          const idMatch = href.match(/[?&]id=(\d+)/);
          
          if (idMatch) {
            const adId = idMatch[1];
            
            // Try to find ad text near this link
            let adText = '';
            const parent = link.closest('div[style*="padding"], div[class*="card"]');
            if (parent) {
              adText = parent.innerText.split('\n')
                .filter(line => line.length > 10 && line.length < 200)
                .find(line => !line.includes('Ad details') && !line.includes('See ad'));
            }

            if (!adText) {
              // Try to get text from nearby elements
              const textElements = link.parentElement?.querySelectorAll('span, div');
              if (textElements) {
                for (const el of textElements) {
                  const text = el.innerText?.trim();
                  if (text && text.length > 10 && text.length < 200) {
                    adText = text;
                    break;
                  }
                }
              }
            }

            results.push({
              ad_id: adId,
              ad_url: `https://www.facebook.com/ads/library/?id=${adId}`,
              hook: adText || 'Ad text extraction needed',
              raw_href: href
            });
          }
        });

        return results;
      }, maxAds);

      console.log(`✅ Found ${ads.length} ads for ${companyName}`);
      
      if (ads.length === 0) {
        console.log('⚠️  Trying to extract any visible text as sample...');
        const sampleText = await this.page.evaluate(() => {
          return document.body.innerText.substring(0, 500);
        });
        console.log('Sample page content:', sampleText);
      }

      return ads;

    } catch (err) {
      console.error(`❌ Error scraping ${companyName}:`, err.message);
      return [];
    }
  }

  async scrapeAllCompetitors() {
    const results = {};
    
    if (!this.competitorData) {
      console.error('❌ No competitor data loaded');
      return results;
    }

    const competitorNames = [];
    for (const category in this.competitorData.competitors) {
      for (const key in this.competitorData.competitors[category]) {
        const competitor = this.competitorData.competitors[category][key];
        competitorNames.push({
          key: key,
          name: competitor.name,
          category: category
        });
      }
    }

    console.log(`\n🎯 Found ${competitorNames.length} competitors to scrape`);
    console.log('⏳ This will take a while... grab a coffee ☕\n');

    for (const comp of competitorNames.slice(0, 5)) { // Start with first 5
      const ads = await this.scrapeCompetitorAds(comp.name, 5);
      results[comp.key] = ads;
      
      // Delay between searches to avoid rate limiting
      console.log('⏸️  Waiting 10 seconds before next competitor...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    return results;
  }

  async updateCompetitorData(scrapedAds) {
    console.log('\n💾 Updating competitor data...');
    
    let updateCount = 0;

    for (const compKey in scrapedAds) {
      const ads = scrapedAds[compKey];
      
      if (ads.length === 0) continue;

      // Find the competitor in data
      for (const category in this.competitorData.competitors) {
        const competitor = this.competitorData.competitors[category][compKey];
        
        if (competitor) {
          if (!competitor.ads_observed) {
            competitor.ads_observed = [];
          }

          // Add new ads
          ads.forEach(ad => {
            if (ad.hook && ad.hook !== 'Ad text extraction needed') {
              // Check if hook already exists
              const exists = competitor.ads_observed.some(existing => {
                const existingHook = typeof existing === 'string' ? existing : existing.hook;
                return existingHook === ad.hook;
              });

              if (!exists) {
                competitor.ads_observed.push({
                  hook: ad.hook,
                  ad_url: ad.ad_url
                });
                updateCount++;
                console.log(`  ✅ Added to ${competitor.name}: "${ad.hook.substring(0, 50)}..."`);
              }
            }
          });
        }
      }
    }

    if (updateCount > 0) {
      this.competitorData.lastUpdated = new Date().toISOString();
      fs.writeFileSync(DATA_PATH, JSON.stringify(this.competitorData, null, 2));
      console.log(`\n✅ Successfully updated ${updateCount} ads`);
    } else {
      console.log('\n⚠️  No new ads to add');
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('\n👋 Browser closed');
    }
  }
}

// Main execution
async function main() {
  const scraper = new FacebookAdScraper();
  
  try {
    await scraper.init();
    const scrapedAds = await scraper.scrapeAllCompetitors();
    await scraper.updateCompetitorData(scrapedAds);
    
  } catch (err) {
    console.error('❌ Scraping failed:', err.message);
  } finally {
    await scraper.close();
  }
}

// Run if executed directly
if (require.main === module) {
  console.log('🤖 Facebook Ad Library Scraper (USA Only)');
  console.log('═'.repeat(50));
  main().catch(console.error);
}

module.exports = FacebookAdScraper;
