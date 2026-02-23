#!/usr/bin/env node

/**
 * Facebook Ad Content Enricher
 * Takes library IDs and visits each ad page to extract full content
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const DATA_DIR = path.join(__dirname, '../data');
const INPUT_FILE = path.join(DATA_DIR, 'facebook-ads-direct-links.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'facebook-ads-enriched.json');
const PROFILE_DIR = path.join(__dirname, '../.stealth-profile');
const PROCESS_ALL = true; // Process ALL ads one by one

async function enrichAdContent(page, libraryId, adUrl) {
  try {
    // Ensure URL has country=US parameter
    const urlWithCountry = adUrl.includes('country=') ? adUrl : adUrl + '&country=US';
    await page.goto(urlWithCountry, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const content = await page.evaluate(() => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.innerText.trim() : '';
      };

      // Try multiple selectors for ad content
      const selectors = {
        primary: '[data-testid="ad-primary-text"]',
        headline: '[data-testid="ad-headline"]',
        description: '[data-testid="ad-description"]',
        cta: '[data-testid="ad-cta"]',
        link: '[data-testid="ad-link"]'
      };

      // Fallback: grab all visible text
      const allText = document.body.innerText || '';
      const lines = allText.split('\n').filter(l => l.trim().length > 5);

      return {
        primary_text: getText(selectors.primary) || lines[0] || '',
        headline: getText(selectors.headline) || lines[1] || '',
        description: getText(selectors.description) || '',
        cta: getText(selectors.cta) || '',
        link_caption: getText(selectors.link) || '',
        raw_text: allText.substring(0, 1000),
        all_lines: lines.slice(0, 10)
      };
    });

    return {
      library_id: libraryId,
      ad_url: adUrl,
      ...content,
      enriched_at: new Date().toISOString()
    };
  } catch (err) {
    console.error(`  ⚠️  Failed ${libraryId}: ${err.message}`);
    return {
      library_id: libraryId,
      ad_url: adUrl,
      primary_text: '',
      headline: '',
      description: '',
      cta: '',
      error: err.message,
      enriched_at: new Date().toISOString()
    };
  }
}

async function main() {
  console.log('🔍 Facebook Ad Content Enricher');
  console.log('='.repeat(60));

  // Load library IDs
  const inputData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const allAds = [];
  
  for (const [category, companies] of Object.entries(inputData)) {
    for (const company of companies) {
      for (const ad of company.ads || []) {
        allAds.push({
          category,
          company: company.name,
          ...ad
        });
      }
    }
  }

  console.log(`📊 Found ${allAds.length} ads to enrich`);
  console.log(`� Processing ALL ads one by one\n`);

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: PROFILE_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  const enrichedAds = [];
  let processed = 0;
  const startTime = Date.now();

  // Process ALL ads one by one
  for (let i = 0; i < allAds.length; i++) {
    const ad = allAds[i];
    const progress = `[${i + 1}/${allAds.length}]`;
    process.stdout.write(`\r${progress} ${ad.company}: ${ad.library_id.substring(0, 16)}... `);

    const enriched = await enrichAdContent(page, ad.library_id, ad.ad_url);
    enriched.company = ad.company;
    enriched.category = ad.category;
    enrichedAds.push(enriched);

    processed++;

    // Save progress every 25 ads
    if (processed % 25 === 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedAds, null, 2));
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (processed / elapsed * 60).toFixed(1);
      console.log(`✓ (${elapsed}s, ${rate} ads/min)`);
      console.log(`  💾 Saved ${processed} enriched ads`);
    }

    // Rate limit to avoid detection
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedAds, null, 2));

  console.log(`\n\n✅ Enrichment complete!`);
  console.log(`📊 Processed: ${enrichedAds.length}/${allAds.length} ads`);
  console.log(`📁 Saved to: ${OUTPUT_FILE}`);

  await browser.close();
}

main().catch(console.error);
