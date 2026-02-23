/**
 * Meta Ads Library API Scraper
 * Uses official Meta Graph API v18.0 to extract competitor ads
 * Endpoint: https://graph.facebook.com/v18.0/ads_archive
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const API_VERSION = 'v18.0';
const API_BASE = `https://graph.facebook.com/${API_VERSION}`;
const COMPETITOR_FILE = path.join(__dirname, '../data/competitors.json');

// Configuration
const CONFIG = {
  MAX_RESULTS_PER_COMPETITOR: 50,
  AD_TYPE: 'ALL',
  COUNTRY: 'US',
  TIMEOUT: 15000,
};

/**
 * Make HTTPS request to Meta Graph API
 */
async function makeApiRequest(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    url.searchParams.append('access_token', ACCESS_TOKEN);
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    // Debug: Log the URL (without token details)
    const debugUrl = url.toString().replace(ACCESS_TOKEN, '[TOKEN]');
    console.log(`   📡 Request: ${debugUrl.substring(0, 150)}...`);

    const timeout = setTimeout(() => {
      reject(new Error(`Request timeout for ${endpoint}`));
    }, CONFIG.TIMEOUT);

    https
      .get(url.toString(), (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const json = JSON.parse(data);
            if (json.error) {
              console.log(`   📋 Response: ${JSON.stringify(json.error)}`);
              reject(new Error(`API Error: ${json.error.message}`));
            } else {
              resolve(json);
            }
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        });
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

/**
 * Extract ad text from creative bodies
 */
function extractAdText(creativeBody) {
  if (!creativeBody) return '';
  // Remove extra whitespace and normalize
  return creativeBody.trim().substring(0, 200);
}

/**
 * Scrape single competitor from Meta Ads Library API
 */
async function scrapeCompetitor(companyName) {
  console.log(`🔍 Scraping: ${companyName}...`);
  
  try {
    const params = {
      search_terms: companyName,
      ad_type: CONFIG.AD_TYPE,
      media_type: 'all',
      ad_reached_countries: `["${CONFIG.COUNTRY}"]`,
      fields: 'id,ad_creative_bodies,page_name,ad_delivery_start_date,platforms',
      limit: CONFIG.MAX_RESULTS_PER_COMPETITOR,
    };

    const response = await makeApiRequest(`${API_BASE}/ads_archive`, params);
    
    if (!response.data || response.data.length === 0) {
      console.log(`   ℹ️  No ads found`);
      return [];
    }

    const ads = response.data.map((ad) => ({
      library_id: ad.id,
      hook: extractAdText(ad.ad_creative_bodies?.[0]),
      ad_creative_bodies: ad.ad_creative_bodies || [],
      page_name: ad.page_name || 'Unknown',
      ad_url: `https://www.facebook.com/ads/library/?id=${ad.id}&t=all`,
      cta: ad.ad_creative_bodies?.[0]?.substring(0, 50) || '',
      started_running: ad.ad_delivery_start_date || 'Unknown',
      scraped_date: new Date().toISOString(),
      platforms: ad.platforms || [],
    }));

    console.log(`   ✅ Found ${ads.length} ads`);
    return ads;
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    return [];
  }
}

/**
 * Load competitor data
 */
function loadCompetitors() {
  try {
    const data = fs.readFileSync(COMPETITOR_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Could not load competitors.json: ${err.message}`);
    return { competitors: [] };
  }
}

/**
 * Save competitor data
 */
function saveCompetitors(data) {
  try {
    fs.writeFileSync(COMPETITOR_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ Saved to ${COMPETITOR_FILE}`);
  } catch (err) {
    console.error(`Could not save competitors.json: ${err.message}`);
  }
}

/**
 * Main scraper
 */
async function main() {
  if (!ACCESS_TOKEN) {
    console.error('❌ META_ACCESS_TOKEN environment variable not set');
    process.exit(1);
  }

  console.log(`\n🤖 Meta Ads Library API Scraper`);
  console.log(`═════════════════════════════════════════════════`);
  console.log(`🔗 API: ${API_BASE}/ads_archive`);
  console.log(`🌍 Country: ${CONFIG.COUNTRY}`);
  console.log(`📊 Max results per competitor: ${CONFIG.MAX_RESULTS_PER_COMPETITOR}\n`);

  const competitorsData = loadCompetitors();
  
  // Flatten competitors from nested structure
  const competitors = [];
  Object.entries(competitorsData.competitors || {}).forEach(([category, companies]) => {
    if (typeof companies === 'object' && companies !== null) {
      Object.entries(companies).forEach(([key, company]) => {
        if (company && company.name) {
          competitors.push({ ...company, category });
        }
      });
    }
  });

  console.log(`📋 Found ${competitors.length} competitors\n`);

  let totalAdsScraped = 0;
  let updatedCompetitors = 0;

  // Scrape each competitor
  for (const competitor of competitors) {
    const ads = await scrapeCompetitor(competitor.name);
    
    if (ads.length > 0) {
      // Merge with existing ads, avoiding duplicates
      const existingLibraryIds = new Set(
        (competitor.ads_observed || [])
          .filter((ad) => ad && typeof ad === 'object' && ad.library_id)
          .map((ad) => ad.library_id)
      );

      const newAds = ads.filter((ad) => !existingLibraryIds.has(ad.library_id));

      if (newAds.length > 0) {
        // Update in nested structure
        Object.entries(competitorsData.competitors || {}).forEach(([category, companies]) => {
          Object.entries(companies || {}).forEach(([key, comp]) => {
            if (comp && comp.name === competitor.name) {
              comp.ads_observed = (comp.ads_observed || []).concat(newAds);
            }
          });
        });
        updatedCompetitors++;
        totalAdsScraped += newAds.length;
      }
    }

    // Rate limiting: 1 request per second
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total ads scraped: ${totalAdsScraped}`);
  console.log(`   Competitors updated: ${updatedCompetitors}/${competitors.length}`);

  if (totalAdsScraped > 0) {
    competitorsData.competitors = competitors;
    competitorsData.lastScraped = new Date().toISOString();
    competitorsData.scraperVersion = 'api-v1';
    saveCompetitors(competitorsData);
  }

  console.log(`\n✨ Done!\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
