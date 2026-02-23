#!/usr/bin/env node

/**
 * Facebook Ad Library Scraper V2
 * Extracts real Library IDs and ad content from US-only health/supplement ads
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// Configuration
const HEADLESS = process.env.HEADLESS === '0' ? false : true;
const MAX_ADS_PER_COMPETITOR = 15;
const DELAY_BETWEEN_COMPETITORS = 5000;
const SCROLL_ATTEMPTS = 10;
const DEBUG = process.env.DEBUG === '1';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';
const OLLAMA_ENABLE = process.env.OLLAMA_ENABLE !== '0';
const USER_DATA_DIR = process.env.USER_DATA_DIR || path.join(__dirname, '../.puppeteer-profile');
const CHROME_EXECUTABLE = process.env.CHROME_EXECUTABLE || '';
const CHROME_USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR || '';
const CTA_LABELS = [
  'Learn More', 'Shop Now', 'Sign Up', 'Get Started', 'Book Now', 'Apply Now',
  'Download', 'Subscribe', 'Buy Now', 'Order Now', 'Send Message'
];

const ALIAS_TOKENS = {
  'Hims & Hers': ['hims', 'hers', 'hims & hers'],
  'GoodRx or GoodRx Health': ['goodrx', 'goodrx health'],
  'Noom (GLP-1 + App)': ['noom'],
  'Lemme (Supplement Brand)': ['lemme', 'kim kardashian', 'kardashian'],
  'Higher Dose': ['higher dose', 'higherdose'],
  'HUM Nutrition': ['hum', 'hum nutrition'],
  'Pure Health Research': ['pure health research', 'purehealthresearch'],
  'Health Insider': ['health insider', 'healthinsider'],
  'Daily Harvest': ['daily harvest', 'dailyharvest'],
  'Oats Overnight': ['oats overnight', 'oatsovernight']
};

// Relevance keywords - filter out irrelevant ads
const HEALTH_KEYWORDS = [
  'weight', 'health', 'glp-1', 'semaglutide', 'tirzepatide', 'ozempic', 'wegovy',
  'doctor', 'prescription', 'medical', 'treatment', 'medication', 'supplement',
  'wellness', 'fitness', 'metabolism', 'hormone', 'telemedicine', 'telehealth',
  'body', 'fat', 'bmi', 'nutrition', 'diet', 'protein', 'vitamin', 'clinic',
  'fiber', 'probiotic', 'gut', 'prebiotic', 'digestion', 'appetite'
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const COMPETITORS_FILE = path.join(__dirname, '../data/competitors.json');

/**
 * Check if ad text is relevant to health/supplements
 */
function isRelevantAd(text) {
  if (!text || text.length < 30) return false;
  
  const lowerText = text.toLowerCase();
  
  // Must contain at least one health keyword
  const hasHealthKeyword = HEALTH_KEYWORDS.some(keyword => 
    lowerText.includes(keyword)
  );
  
  // Filter out irrelevant stuff
  const irrelevantPatterns = [
    'meta ad library',
    'see ad details',
    'sponsored',
    'active status',
    'platforms',
    'library id:',
    'this ad has multiple versions',
    'ad library report',
    'eu transparency'
  ];
  
  const containsMetadata = irrelevantPatterns.some(pattern =>
    lowerText.includes(pattern.toLowerCase())
  );
  
  return hasHealthKeyword && !containsMetadata;
}

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getCompanyTokens(companyName) {
  const aliasTokens = ALIAS_TOKENS[companyName] || [];
  const normalizedAliases = aliasTokens.map(alias => normalizeName(alias));
  const normalizedCompany = normalizeName(companyName);
  const baseTokens = normalizedCompany
    .split(' ')
    .filter(token => token.length > 2)
    .filter(token => !['health', 'supplement', 'brand', 'app', 'and', 'the', 'or'].includes(token));
  
  const aliasTokensFlat = normalizedAliases
    .flatMap(alias => alias.split(' '))
    .filter(token => token.length > 2)
    .filter(token => !['health', 'supplement', 'brand', 'app', 'and', 'the', 'or'].includes(token));
  
  return Array.from(new Set([...baseTokens, ...aliasTokensFlat]));
}

function matchesAdvertiser(pageName, companyName) {
  const normalizedPage = normalizeName(pageName);
  if (!normalizedPage) return false;
  
  const companyTokens = getCompanyTokens(companyName);
  if (companyTokens.length === 0) return false;
  
  return companyTokens.some(token => normalizedPage.includes(token));
}

async function acceptCookiesIfPresent(page) {
  const candidates = [
    'Allow all cookies',
    'Allow essential and optional cookies',
    'Accept all cookies',
    'Accept all'
  ];
  
  const clicked = await page.evaluate((labels) => {
    const elements = Array.from(document.querySelectorAll('button, div[role="button"]'));
    for (const label of labels) {
      const match = elements.find(el => (el.innerText || '').trim().includes(label));
      if (match) {
        match.click();
        return true;
      }
    }
    return false;
  }, candidates);

  if (clicked) {
    await sleep(1000);
    return true;
  }
  
  return false;
}

async function feedOllama(allScrapedData) {
  console.log('\n🧠 Feeding Ollama...');
  
  for (const competitor of allScrapedData) {
    const payload = {
      model: OLLAMA_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Store and organize the following ad data for later retrieval. Keep original fields and do not alter ad_url or library_id.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            company: competitor.companyName,
            ads: competitor.ads
          })
        }
      ],
      stream: false
    };
    
    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        console.log(`   ⚠️  Ollama error for ${competitor.companyName}: ${response.status}`);
        continue;
      }
      
      await response.json();
      console.log(`   ✅ Sent ${competitor.companyName} (${competitor.ads.length} ads)`);
    } catch (error) {
      console.log(`   ⚠️  Ollama request failed for ${competitor.companyName}: ${error.message}`);
    }
  }
}

async function extractCardMetadata(cardHandle) {
  return await cardHandle.evaluate(card => {
    const text = card.innerText || '';
    const idMatch = text.match(/Library ID:\s*(\d{10,})/i);
    const libraryId = idMatch ? idMatch[1] : null;
    
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const sponsoredIndex = lines.findIndex(line => line.toLowerCase() === 'sponsored');
    const pageName = sponsoredIndex > 0 ? lines[sponsoredIndex - 1] : '';
    
    return { libraryId, pageName };
  });
}

async function extractModalText(page) {
  return await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]');
    if (!modal) return null;
    
    const text = modal.innerText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    return { lines };
  });
}

async function findPrimaryTextFromLines(lines) {
  const metadataPatterns = [
    'library id',
    'started running',
    'platforms',
    'active',
    'inactive',
    'see ad details',
    'this ad has multiple versions',
    'eu transparency',
    'ad library report',
    'meta ad library'
  ];
  
  let primaryText = '';
  lines
    .filter(line => line.length > 25 && line.length < 400)
    .filter(line => !metadataPatterns.some(pattern => line.toLowerCase().includes(pattern)))
    .forEach(line => {
      if (line.length > primaryText.length && isRelevantAd(line)) {
        primaryText = line;
      }
    });
  
  return primaryText;
}

async function scrapeAdsFromCards(page, companyName, maxAds) {
  console.log(`   📋 Extracting ads from cards...`);
  
  const adsById = new Map();
  
  for (let i = 0; i < SCROLL_ATTEMPTS && adsById.size < maxAds; i++) {
    const cardHandles = await page.$$('div[role="article"], div[data-testid="ad_library_card"]');
    
    for (const card of cardHandles) {
      if (adsById.size >= maxAds) break;
      
      const { libraryId, pageName } = await extractCardMetadata(card);
      if (!libraryId || adsById.has(libraryId)) continue;
      if (!matchesAdvertiser(pageName, companyName)) continue;
      
      const clicked = await card.evaluate(cardEl => {
        const elements = Array.from(cardEl.querySelectorAll('a, button, div[role="button"], span'));
        const target = elements.find(el => (el.innerText || '').trim().toLowerCase().includes('see ad details'));
        if (!target) return false;
        const clickable = target.closest('a, button, div[role="button"]') || target;
        clickable.click();
        return true;
      });

      if (!clicked) continue;

      await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
      await sleep(1500);
      
      const modalData = await extractModalText(page);
      if (!modalData) {
        const closeBtn = await page.$('[aria-label="Close"]');
        if (closeBtn) await closeBtn.click();
        continue;
      }
      
      const primaryText = await findPrimaryTextFromLines(modalData.lines);
      const cta = await page.evaluate((labels) => {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return '';
        const buttons = Array.from(modal.querySelectorAll('button, a, div[role="button"]'));
        for (const btn of buttons) {
          const text = (btn.innerText || '').trim();
          if (labels.includes(text)) return text;
        }
        return '';
      }, CTA_LABELS);
      
      const closeBtn = await page.$('[aria-label="Close"]');
      if (closeBtn) await closeBtn.click();
      await sleep(800);
      
      if (!primaryText) continue;
      if (!isRelevantAd(primaryText)) continue;
      
      adsById.set(libraryId, {
        library_id: libraryId,
        ad_url: `https://www.facebook.com/ads/library/?id=${libraryId}`,
        primary_text: primaryText,
        page_name: pageName,
        cta: cta,
        started_running: '',
        scraped_date: new Date().toISOString().split('T')[0]
      });
    }
    
    console.log(`   ✓ Found ${adsById.size} relevant ads (scroll ${i + 1}/${SCROLL_ATTEMPTS})`);
    await page.evaluate(() => window.scrollBy(0, 1200));
    await sleep(2500);
  }
  
  return Array.from(adsById.values()).slice(0, maxAds);
}

/**
 * Scrape ads for one competitor
 */
async function scrapeCompetitor(browser, companyName, maxAds) {
  console.log(`\n🔎 ${companyName}`);
  
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30000);
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9'
  });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  
  try {
    // Build search URL (US only)
    const searchUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&media_type=all&search_type=keyword_unordered&locale=en_US&q=${encodeURIComponent(companyName)}`;
    
    console.log(`   🌐 Searching US ads...`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    await acceptCookiesIfPresent(page);

    let cardCount = 0;
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('div[role="article"], div[data-testid="ad_library_card"]').length > 0,
        { timeout: 15000 }
      );
    } catch (error) {
      // continue to diagnostic below
    }

    cardCount = await page.evaluate(() =>
      document.querySelectorAll('div[role="article"], div[data-testid="ad_library_card"]').length
    );

    if (cardCount === 0 && DEBUG) {
      const debugPath = path.join(__dirname, `debug_${companyName.replace(/[^a-z0-9]/gi, '_')}.png`);
      await page.screenshot({ path: debugPath, fullPage: true });
      console.log(`   🧪 Debug screenshot saved: ${debugPath}`);
    }

    if (DEBUG) {
      const debugInfo = await page.evaluate(() => {
        const cards = document.querySelectorAll('div[role="article"], div[data-testid="ad_library_card"]');
        const firstCard = cards[0];
        const firstText = firstCard ? firstCard.innerText : '';
        const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'))
          .map(btn => (btn.innerText || '').trim())
          .filter(text => text.length > 0);
        return {
          cardCount: cards.length,
          firstCardText: firstText.split('\n').slice(0, 12),
          buttonSamples: buttons.slice(0, 20)
        };
      });
      console.log(`   🧪 Debug card count: ${debugInfo.cardCount}`);
      console.log(`   🧪 First card lines: ${JSON.stringify(debugInfo.firstCardText)}`);
      console.log(`   🧪 Button samples: ${JSON.stringify(debugInfo.buttonSamples)}`);
    }
    
    // Extract ads from cards (US only)
    const adsData = await scrapeAdsFromCards(page, companyName, maxAds);
    
    if (adsData.length === 0) {
      console.log(`   ⚠️  No ads found`);
      await page.close();
      return [];
    }
    
    console.log(`   ✅ Extracted ${adsData.length} relevant ads`);
    await page.close();
    return adsData;
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    try { await page.close(); } catch (e) {}
    return [];
  }
}

/**
 * Update competitors.json with scraped data
 */
function updateCompetitorsJson(allScrapedData) {
  console.log('\n💾 Updating competitors.json...');
  
  const data = JSON.parse(fs.readFileSync(COMPETITORS_FILE, 'utf8'));
  
  let totalAdded = 0;
  
  // Update each competitor
  Object.values(data.competitors).forEach(category => {
    Object.entries(category).forEach(([key, competitor]) => {
      const companyName = competitor.name;
      
      // Find scraped data for this competitor
      const scrapedData = allScrapedData.find(d => d.companyName === companyName);
      if (!scrapedData || scrapedData.ads.length === 0) return;
      
      // Ensure ads_observed is an array
      if (!Array.isArray(competitor.ads_observed)) {
        competitor.ads_observed = [];
      }
      
      // Add new ads
      scrapedData.ads.forEach(ad => {
        // Check if already exists
        const exists = competitor.ads_observed.some(existingAd => {
          if (typeof existingAd === 'object' && existingAd.library_id) {
            return existingAd.library_id === ad.library_id;
          }
          return false;
        });
        
        if (!exists) {
          competitor.ads_observed.push({
            hook: ad.primary_text,
            ad_url: ad.ad_url,
            library_id: ad.library_id,
            page_name: ad.page_name,
            cta: ad.cta || '',
            started_running: ad.started_running,
            scraped_date: ad.scraped_date
          });
          totalAdded++;
        }
      });
    });
  });
  
  // Update metadata
  data.scraper_metadata = data.scraper_metadata || {};
  data.scraper_metadata.last_update = new Date().toISOString();
  data.scraper_metadata.last_scraper = 'facebook-library-scraper-v2';
  
  // Backup and save
  const backupFile = COMPETITORS_FILE.replace('.json', `_backup_${Date.now()}.json`);
  fs.copyFileSync(COMPETITORS_FILE, backupFile);
  fs.writeFileSync(COMPETITORS_FILE, JSON.stringify(data, null, 2));
  
  console.log(`   ✅ Added ${totalAdded} new ads`);
  console.log(`   💾 Saved to competitors.json`);
}

/**
 * Main
 */
async function main() {
  console.log('🤖 Facebook Ad Library Scraper V2 (US Health Ads Only)');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Load competitors
  const data = JSON.parse(fs.readFileSync(COMPETITORS_FILE, 'utf8'));
  
  const competitorsList = [];
  Object.values(data.competitors).forEach(category => {
    Object.values(category).forEach(competitor => {
      competitorsList.push(competitor.name);
    });
  });
  
  const limit = Number(process.env.LIMIT_COMPETITORS || 0);
  const competitorsToScrape = limit > 0 ? competitorsList.slice(0, limit) : competitorsList;

  console.log(`🎯 ${competitorsToScrape.length} competitors to scrape`);
  console.log(`📊 Max ${MAX_ADS_PER_COMPETITOR} ads per competitor`);
  console.log(`🇺🇸 US-only health/supplement ads\n`);
  
  competitorsToScrape.forEach((name, i) => {
    console.log(`   ${i + 1}. ${name}`);
  });
  
  // Launch browser
  console.log('\n🌐 Launching browser...');
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    executablePath: CHROME_EXECUTABLE || undefined,
    userDataDir: CHROME_USER_DATA_DIR || USER_DATA_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US'
    ]
  });
  
  const allScrapedData = [];
  
  // Scrape ALL competitors
  for (const companyName of competitorsToScrape) {
    const ads = await scrapeCompetitor(browser, companyName, MAX_ADS_PER_COMPETITOR);
    if (ads.length > 0) {
      allScrapedData.push({
        companyName,
        ads
      });
    }
    await sleep(DELAY_BETWEEN_COMPETITORS);
  }
  
  await browser.close();
  
  // Summary
  console.log('\n📊 Scraping Complete');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Competitors scraped: ${allScrapedData.length}/${competitorsToScrape.length}`);
  console.log(`Total ads found: ${allScrapedData.reduce((sum, c) => sum + c.ads.length, 0)}`);
  
  // Update file
  if (allScrapedData.length > 0) {
    updateCompetitorsJson(allScrapedData);
    if (OLLAMA_ENABLE) {
      await feedOllama(allScrapedData);
    }
  }
  
  console.log('\n✅ Done!');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
