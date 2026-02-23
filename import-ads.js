/**
 * AD URL IMPORTER
 * ================
 * Paste Facebook Ad Library URLs to automatically extract ad IDs and update competitors.json
 * 
 * Usage:
 * 1. Go to https://www.facebook.com/ads/library/
 * 2. Search for competitor (e.g., "Ro", "Hims", "GoodRx")
 * 3. Copy ad URLs
 * 4. Paste them into the ads array below
 * 5. Run: node import-ads.js
 */

const fs = require('fs');
const path = require('path');

// PASTE YOUR COLLECTED AD URLS HERE
const adsToImport = [
  // Example format:
  // {
  //   competitor: "ro",  // Must match key in competitors.json
  //   hook: "Work with real doctors who understand your health journey",
  //   ad_url: "https://www.facebook.com/ads/library/?id=805626925889930"
  // },
  
  // Add your ads below:
  
];

const DATA_PATH = path.join(__dirname, 'data/competitors.json');

function extractAdId(url) {
  const match = url.match(/[?&]id=(\d+)/);
  return match ? match[1] : null;
}

function importAds() {
  console.log('🔄 Loading competitors data...');
  
  let competitorData;
  try {
    competitorData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch (err) {
    console.error('❌ Failed to load competitors.json:', err.message);
    return;
  }

  let updateCount = 0;
  let errorCount = 0;

  adsToImport.forEach((ad, index) => {
    const { competitor, hook, ad_url } = ad;
    
    if (!competitor || !hook || !ad_url) {
      console.log(`⚠️  Skipping entry ${index + 1}: Missing required fields`);
      errorCount++;
      return;
    }

    // Find the competitor in the data
    let found = false;
    for (const category in competitorData.competitors) {
      const compData = competitorData.competitors[category][competitor];
      if (compData) {
        found = true;
        
        // Check if ads_observed exists
        if (!compData.ads_observed) {
          compData.ads_observed = [];
        }

        // Find if this hook already exists
        let hookIndex = -1;
        for (let i = 0; i < compData.ads_observed.length; i++) {
          const existingAd = compData.ads_observed[i];
          const existingHook = typeof existingAd === 'string' ? existingAd : existingAd.hook;
          if (existingHook === hook) {
            hookIndex = i;
            break;
          }
        }

        const adId = extractAdId(ad_url);
        if (!adId) {
          console.log(`⚠️  Invalid URL for "${hook}": No ad ID found`);
          errorCount++;
          return;
        }

        const fullUrl = `https://www.facebook.com/ads/library/?id=${adId}`;

        if (hookIndex >= 0) {
          // Update existing hook with URL
          compData.ads_observed[hookIndex] = {
            hook: hook,
            ad_url: fullUrl
          };
          console.log(`✅ Updated "${competitor}": "${hook.substring(0, 50)}..." → ID ${adId}`);
        } else {
          // Add new hook with URL
          compData.ads_observed.push({
            hook: hook,
            ad_url: fullUrl
          });
          console.log(`➕ Added to "${competitor}": "${hook.substring(0, 50)}..." → ID ${adId}`);
        }
        
        updateCount++;
        break;
      }
    }

    if (!found) {
      console.log(`❌ Competitor "${competitor}" not found in database`);
      errorCount++;
    }
  });

  if (updateCount > 0) {
    competitorData.lastUpdated = new Date().toISOString();
    
    try {
      fs.writeFileSync(DATA_PATH, JSON.stringify(competitorData, null, 2));
      console.log(`\n✅ Successfully imported ${updateCount} ad(s)`);
      if (errorCount > 0) {
        console.log(`⚠️  ${errorCount} error(s) encountered`);
      }
      console.log('\n🔄 Restart your server to see the changes');
    } catch (err) {
      console.error('❌ Failed to save competitors.json:', err.message);
    }
  } else {
    console.log('\n⚠️  No ads to import. Add ads to the adsToImport array.');
  }
}

// Show available competitors
function listCompetitors() {
  try {
    const competitorData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    console.log('\n📋 Available competitors:');
    console.log('='.repeat(50));
    
    for (const category in competitorData.competitors) {
      console.log(`\n${category}:`);
      for (const key in competitorData.competitors[category]) {
        const comp = competitorData.competitors[category][key];
        const hookCount = comp.ads_observed ? comp.ads_observed.length : 0;
        const urlCount = comp.ads_observed ? 
          comp.ads_observed.filter(ad => typeof ad === 'object' && ad.ad_url).length : 0;
        console.log(`  - ${key} (${comp.name}) - ${hookCount} hooks, ${urlCount} with URLs`);
      }
    }
    console.log('\n');
  } catch (err) {
    console.error('❌ Failed to load competitors:', err.message);
  }
}

// Check command line arguments
const args = process.argv.slice(2);

if (args[0] === 'list') {
  listCompetitors();
} else if (adsToImport.length === 0) {
  console.log('\n📝 Ad URL Importer');
  console.log('='.repeat(50));
  console.log('No ads to import. To get started:');
  console.log('');
  console.log('1. Run: node import-ads.js list');
  console.log('   (to see all available competitors)');
  console.log('');
  console.log('2. Go to https://www.facebook.com/ads/library/');
  console.log('   Search for your competitors');
  console.log('');
  console.log('3. Edit this file and add ads to adsToImport array:');
  console.log('   {');
  console.log('     competitor: "ro",');
  console.log('     hook: "Your ad headline/hook here",');
  console.log('     ad_url: "https://www.facebook.com/ads/library/?id=123456789"');
  console.log('   }');
  console.log('');
  console.log('4. Run: node import-ads.js');
  console.log('');
} else {
  importAds();
}
