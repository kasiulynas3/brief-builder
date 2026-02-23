/**
 * SCRAPECREATORS.COM AD LIBRARY SCRAPER
 * ======================================
 * Uses ScrapeCreators API to fetch Facebook Ad Library data
 * 
 * Setup:
 * 1. Sign up at https://app.scrapecreators.com/ (100 FREE credits, no card required)
 * 2. Copy your API key from dashboard
 * 3. Set SCRAPECREATORS_API_KEY environment variable
 * 
 * Pricing:
 * - 100 credits free
 * - $47 for 25k credits ($1.88/1k)
 * - Credits never expire
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// API Configuration
const SCRAPECREATORS_API_KEY = process.env.SCRAPECREATORS_API_KEY || '';
const API_BASE = 'api.scrapecreators.com';

// Data paths
const COMPETITORS_PATH = path.join(__dirname, '../data/competitors.json');
const OUTPUT_PATH = path.join(__dirname, '../data/facebook-ads-scrapecreators.json');

// Load competitors
function loadCompetitors() {
  try {
    const data = JSON.parse(fs.readFileSync(COMPETITORS_PATH, 'utf-8'));
    const allCompetitors = [];
    
    for (const [category, items] of Object.entries(data)) {
      if (Array.isArray(items)) {
        items.forEach(comp => {
          if (comp.name) {
            allCompetitors.push({
              name: comp.name,
              category: category,
              searchTerm: comp.name.replace(/\s*\(.*?\)\s*/g, '').trim() // Remove parentheses content
            });
          }
        });
      }
    }
    
    return allCompetitors;
  } catch (err) {
    console.error('❌ Error loading competitors:', err.message);
    return [];
  }
}

// Make API request to ScrapeCreators
function scrapeCreatorsRequest(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    if (!SCRAPECREATORS_API_KEY) {
      reject(new Error('Missing SCRAPECREATORS_API_KEY. Sign up at https://app.scrapecreators.com/'));
      return;
    }

    const queryString = new URLSearchParams(params).toString();
    const path = `/v1/facebook/adLibrary/${endpoint}${queryString ? '?' + queryString : ''}`;

    const options = {
      hostname: API_BASE,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'x-api-key': SCRAPECREATORS_API_KEY
      }
    };

    https.get(options, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.error) {
            reject(new Error(`ScrapeCreators API Error: ${parsed.error}`));
          } else {
            resolve(parsed);
          }
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    }).on('error', err => {
      reject(err);
    });
  });
}

// Search for ads by company name
async function getCompanyAds(companyName, limit = 20) {
  console.log(`\n📱 Searching ads for: ${companyName}`);
  
  try {
    // First search for the company page
    const companies = await scrapeCreatorsRequest('search/companies', {
      search_term: companyName,
      country_code: 'US'
    });

    if (!companies.data || companies.data.length === 0) {
      console.log(`  ⚠️  No company page found for "${companyName}"`);
      return [];
    }

    const company = companies.data[0];
    console.log(`  ✅ Found page: ${company.page_name} (ID: ${company.page_id})`);

    // Get ads from that company
    const adsResponse = await scrapeCreatorsRequest('company/ads', {
      page_id: company.page_id,
      country_code: 'US',
      limit: limit
    });

    const ads = adsResponse.data || [];
    console.log(`  📊 Found ${ads.length} ads`);

    return ads.map(ad => ({
      ad_id: ad.ad_archive_id || ad.id,
      ad_url: `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id || ad.id}`,
      hook: ad.ad_creative_body || ad.page_profile_name || '',
      headline: ad.ad_creative_link_title || '',
      description: ad.ad_creative_link_description || '',
      page_name: ad.page_name || company.page_name,
      start_date: ad.ad_delivery_start_time || '',
      platforms: ad.publisher_platforms || [],
      snapshot_url: ad.ad_snapshot_url || ''
    }));

  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return [];
  }
}

// Main scraper
async function main() {
  console.log('🚀 ScrapeCreators Facebook Ad Library Scraper');
  console.log('='

.repeat(60));
  console.log('');

  if (!SCRAPECREATORS_API_KEY) {
    console.error('❌ Missing API key!');
    console.log('');
    console.log('Setup Instructions:');
    console.log('1. Sign up at https://app.scrapecreators.com/');
    console.log('2. Get 100 FREE credits (no credit card required)');
    console.log('3. Copy your API key from the dashboard');
    console.log('4. Run: export SCRAPECREATORS_API_KEY=your_key_here');
    console.log('');
    process.exit(1);
  }

  const competitors = loadCompetitors();
  const limitCompetitors = process.env.LIMIT_COMPETITORS ? parseInt(process.env.LIMIT_COMPETITORS) : 5;
  const competitorsToScrape = competitors.slice(0, limitCompetitors);

  console.log(`🎯 Found ${competitors.length} competitors`);
  console.log(`📊 Scraping first ${competitorsToScrape.length} to conserve API credits\n`);

  const results = {};
  let totalAds = 0;
  const startTime = Date.now();

  for (const comp of competitorsToScrape) {
    const ads = await getCompanyAds(comp.searchTerm, 20);
    
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

    // Rate limiting: wait 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Scrape complete in ${duration}s`);
  console.log(`📊 Total ads found: ${totalAds}`);
  console.log(`💳 Estimated credits used: ~${competitorsToScrape.length * 2} credits`);
  console.log(`${'='.repeat(60)}\n`);

  // Save results
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`📁 Results saved to ${OUTPUT_PATH}`);

  // Show sample
  if (totalAds > 0) {
    console.log('\n📌 Sample ad:');
    const firstCategory = Object.keys(results)[0];
    const firstCompany = results[firstCategory][0];
    if (firstCompany.ads.length > 0) {
      const sampleAd = firstCompany.ads[0];
      console.log(`   Company: ${firstCompany.name}`);
      console.log(`   Hook: ${sampleAd.hook.substring(0, 100)}...`);
      console.log(`   URL: ${sampleAd.ad_url}`);
    }
  }

  return results;
}

// Run
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { getCompanyAds, scrapeCreatorsRequest };
