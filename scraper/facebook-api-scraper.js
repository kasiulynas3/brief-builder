/**
 * FACEBOOK AD LIBRARY API SCRAPER
 * ================================
 * Uses official Facebook Marketing API to fetch competitor ads (USA only)
 * 
 * Setup:
 * 1. Create Facebook app at https://developers.facebook.com/
 * 2. Get access token from Graph API Explorer
 * 3. Add credentials to .env file:
 *    FACEBOOK_ACCESS_TOKEN=your_token_here
 * 
 * Features:
 * - Legal & reliable (no scraping)
 * - USA filtering
 * - Real ad IDs and copy
 * - Automatic rate limiting
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Use provided token directly (with ads_read permission)
const FACEBOOK_ACCESS_TOKEN = 'EAAkdIZCt5ZBEwBQ7nowWHZAmt97HJr43eG5DJfsxKkn20dZCCNy9Dm372qw2CZAHfSNqEDCy4SO9EWbqawUtztZB7V8WZA7u6XHFCbETMmKZA9ZCKuu0tOopZAim92P5hZBynAo4RrPVcPaWQ12qRXgF1fB67c3tuJHM1lq0lsFG8Mcsh5ypwZBSSXAxH7hSpKeZApBEkZCGrJt6DZAOwf3OgTR8JAQxxQ6kpZCh7B4nESZCTCFO1nISK7ftkJENkA0c96WG7g4yTwoYrqWIMWybLSseqatURaVOh1TYGaCCFbmdnZBxwZD';

const DATA_PATH = path.join(__dirname, '../data/competitors.json');
const API_VERSION = 'v25.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

class FacebookAPIAdScraper {
  constructor() {
    this.accessToken = FACEBOOK_ACCESS_TOKEN;
    this.competitorData = this.loadCompetitorData();
    this.requestCount = 0;
    this.maxRequestsPerHour = 180; // Stay under 200 limit
  }

  loadCompetitorData() {
    try {
      if (fs.existsSync(DATA_PATH)) {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      }
    } catch (err) {
      console.error('❌ Error loading competitor data:', err.message);
    }
    return null;
  }

  async makeAPIRequest(endpoint, params) {
    return new Promise((resolve, reject) => {
      if (!this.accessToken) {
        reject(new Error('No Facebook access token found. Add FACEBOOK_ACCESS_TOKEN to .env'));
        return;
      }

      const queryParams = new URLSearchParams({
        access_token: this.accessToken,
        ...params
      });

      const url = `${BASE_URL}/${endpoint}?${queryParams}`;

      https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          this.requestCount++;
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.error) {
              console.error('Full API Error:', JSON.stringify(parsed.error, null, 2));
              reject(new Error(`Facebook API Error: ${parsed.error.message} (Code: ${parsed.error.code}, Subcode: ${parsed.error.error_subcode || 'N/A'})`));
            } else {
              resolve(parsed);
            }
          } catch (err) {
            console.error('Raw response:', data);
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  async searchCompetitorAds(companyName, maxAds = 10) {
    console.log(`\n📱 Searching Facebook Ad Library for: ${companyName}`);

    try {
      const response = await this.makeAPIRequest('ads_archive', {
        ad_reached_countries: 'US',
        search_terms: companyName,
        ad_active_status: 'ALL',
        limit: maxAds,
        fields: [
          'id',
          'ad_creative_body',
          'ad_creative_link_title',
          'ad_creative_link_description',
          'ad_snapshot_url',
          'page_name',
          'ad_delivery_start_time'
        ].join(',')
      });

      const ads = response.data || [];
      console.log(`✅ Found ${ads.length} USA ads for ${companyName}`);

      return ads.map(ad => ({
        ad_id: ad.id,
        ad_url: `https://www.facebook.com/ads/library/?id=${ad.id}`,
        hook: ad.ad_creative_body || ad.ad_creative_link_title || ad.ad_creative_link_description || 'No text extracted',
        headline: ad.ad_creative_link_title || '',
        page_name: ad.page_name || '',
        snapshot_url: ad.ad_snapshot_url || '',
        start_date: ad.ad_delivery_start_time || ''
      }));

    } catch (err) {
      console.error(`❌ Error fetching ads for ${companyName}:`, err.message);
      
      if (err.message.includes('access token')) {
        console.error('\n⚠️  Access token issue. Please check:');
        console.error('   1. FACEBOOK_ACCESS_TOKEN is set in .env');
        console.error('   2. Token hasn\'t expired');
        console.error('   3. Token has Ad Library API permissions');
        console.error('\n   Get a new token: https://developers.facebook.com/tools/explorer/');
      }
      
      return [];
    }
  }

  async scrapeAllCompetitors(limit = 5) {
    if (!this.competitorData) {
      console.error('❌ No competitor data loaded');
      return {};
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

    console.log(`\n🎯 Found ${competitorNames.length} competitors`);
    console.log(`📊 Fetching first ${limit} competitors to stay under API rate limits\n`);

    const results = {};

    for (const comp of competitorNames.slice(0, limit)) {
      const ads = await this.searchCompetitorAds(comp.name, 5);
      results[comp.key] = ads;

      // Rate limiting: wait 2 seconds between requests
      if (this.requestCount < this.maxRequestsPerHour) {
        console.log('⏸️  Waiting 2 seconds before next request...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log('⚠️  Approaching rate limit. Stopping for now.');
        break;
      }
    }

    console.log(`\n📈 API Requests made: ${this.requestCount}/${this.maxRequestsPerHour}`);
    
    return results;
  }

  async updateCompetitorData(scrapedAds) {
    console.log('\n💾 Updating competitor data...');
    
    let updateCount = 0;
    let newAdsCount = 0;

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
            if (ad.hook && ad.hook !== 'No text extracted') {
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
                newAdsCount++;
                console.log(`  ✅ ${competitor.name}: "${ad.hook.substring(0, 60)}..."`);
                console.log(`     🔗 ${ad.ad_url}`);
              } else {
                updateCount++;
              }
            }
          });
        }
      }
    }

    if (newAdsCount > 0) {
      this.competitorData.lastUpdated = new Date().toISOString();
      fs.writeFileSync(DATA_PATH, JSON.stringify(this.competitorData, null, 2));
      console.log(`\n✅ Added ${newAdsCount} new ads with real URLs`);
      if (updateCount > 0) {
        console.log(`ℹ️  ${updateCount} ads already exist`);
      }
      console.log('\n🔄 Restart your server to see the changes!');
    } else {
      console.log('\n⚠️  No new ads to add');
    }
  }
}

async function main() {
  console.log('🤖 Facebook Ad Library API Scraper (USA Only)');
  console.log('═'.repeat(50));
  
  const scraper = new FacebookAPIAdScraper();
  
  if (!scraper.accessToken) {
    console.error('\n❌ Missing Facebook Access Token!');
    console.error('\nSetup instructions:');
    console.error('1. Go to: https://developers.facebook.com/tools/explorer/');
    console.error('2. Select your app (or create one)');
    console.error('3. Click "Generate Access Token"');
    console.error('4. Copy the token');
    console.error('5. Add to .env file:');
    console.error('   FACEBOOK_ACCESS_TOKEN=your_token_here');
    console.error('\nFor detailed setup: see FACEBOOK_API_SETUP.md\n');
    process.exit(1);
  }

  try {
    const scrapedAds = await scraper.scrapeAllCompetitors(5); // Start with 5 competitors
    await scraper.updateCompetitorData(scrapedAds);
  } catch (err) {
    console.error('❌ Scraping failed:', err.message);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = FacebookAPIAdScraper;
