#!/usr/bin/env node

/**
 * Facebook Ad Library Scraper (Playwright WebKit)
 * Uses Safari engine via WebKit. Requires a one-time login in the profile.
 */

const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const COMPETITORS_FILE = path.join(__dirname, '../data/competitors.json');

const HEADLESS = process.env.HEADLESS === '0' ? false : true;
const PROFILE_DIR = process.env.PROFILE_DIR || path.join(__dirname, '../.playwright-profile');
const MAX_ADS_PER_COMPETITOR = 15;
const SCROLL_PAGES = 10;
const DELAY_BETWEEN_COMPETITORS = 4000;
const DEBUG = process.env.DEBUG === '1';
const LIMIT_COMPETITORS = Number(process.env.LIMIT_COMPETITORS || 0);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';
const OLLAMA_ENABLE = process.env.OLLAMA_ENABLE !== '0';

const CTA_LABELS = [
  'Learn More', 'Shop Now', 'Sign Up', 'Get Started', 'Book Now', 'Apply Now',
  'Download', 'Subscribe', 'Buy Now', 'Order Now', 'Send Message'
];

const HEALTH_KEYWORDS = [
  'weight', 'health', 'glp-1', 'semaglutide', 'tirzepatide', 'ozempic', 'wegovy',
  'doctor', 'prescription', 'medical', 'treatment', 'medication', 'supplement',
  'wellness', 'fitness', 'metabolism', 'hormone', 'telemedicine', 'telehealth',
  'body', 'fat', 'bmi', 'nutrition', 'diet', 'protein', 'vitamin', 'clinic',
  'fiber', 'probiotic', 'gut', 'prebiotic', 'digestion', 'appetite'
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForEnter(message) {
  return new Promise(resolve => {
    process.stdout.write(message);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => resolve());
  });
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

function isRelevantAd(text) {
  if (!text || text.length < 30) return false;
  const lowerText = text.toLowerCase();

  const hasHealthKeyword = HEALTH_KEYWORDS.some(keyword => lowerText.includes(keyword));
  const metadataPatterns = [
    'meta ad library', 'see ad details', 'sponsored', 'active status',
    'platforms', 'library id:', 'this ad has multiple versions',
    'ad library report', 'eu transparency'
  ];

  const containsMetadata = metadataPatterns.some(pattern => lowerText.includes(pattern));
  return hasHealthKeyword && !containsMetadata;
}

async function acceptCookiesIfPresent(page) {
  const labels = [
    'Allow all cookies',
    'Allow essential and optional cookies',
    'Accept all cookies',
    'Accept all'
  ];

  for (const label of labels) {
    const button = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await button.count()) {
      await button.click();
      await sleep(1000);
      return true;
    }
  }

  return false;
}

function extractPrimaryText(lines) {
  const metadataPatterns = [
    'library id', 'started running', 'platforms', 'active', 'inactive',
    'see ad details', 'this ad has multiple versions', 'eu transparency',
    'ad library report', 'meta ad library'
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

async function scrapeCompetitor(page, companyName) {
  console.log(`\n🔎 ${companyName}`);

  const searchUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&media_type=all&search_type=keyword_unordered&locale=en_US&q=${encodeURIComponent(companyName)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await acceptCookiesIfPresent(page);

  const adsById = new Map();
  let lastCardCount = 0;

  for (let i = 0; i < SCROLL_PAGES && adsById.size < MAX_ADS_PER_COMPETITOR; i++) {
    const cards = page.locator('div[role="article"], div[data-testid="ad_library_card"]');
    const cardCount = await cards.count();
    lastCardCount = cardCount;

    if (DEBUG) {
      console.log(`   🧪 Card count: ${cardCount}`);
    }

    for (let c = 0; c < cardCount && adsById.size < MAX_ADS_PER_COMPETITOR; c++) {
      const card = cards.nth(c);
      const text = (await card.innerText()).trim();
      const idMatch = text.match(/Library ID:\s*(\d{10,})/i);
      const libraryId = idMatch ? idMatch[1] : null;
      if (!libraryId || adsById.has(libraryId)) continue;

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const sponsoredIndex = lines.findIndex(line => line.toLowerCase() === 'sponsored');
      const pageName = sponsoredIndex > 0 ? lines[sponsoredIndex - 1] : '';
      if (!matchesAdvertiser(pageName, companyName)) continue;

      const detailsButton = card.getByText(/see ad details/i).first();
      if (await detailsButton.count()) {
        await detailsButton.click();
        await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
        await sleep(1200);

        const modal = page.locator('[role="dialog"]').first();
        const modalText = await modal.innerText();
        const modalLines = modalText.split('\n').map(l => l.trim()).filter(Boolean);
        const primaryText = extractPrimaryText(modalLines);
        const cta = await modal
          .locator('button, a, div[role="button"]')
          .filter({ hasText: new RegExp(CTA_LABELS.join('|'), 'i') })
          .first()
          .innerText()
          .catch(() => '');

        await page.keyboard.press('Escape');
        await sleep(600);

        if (!primaryText || !isRelevantAd(primaryText)) continue;

        adsById.set(libraryId, {
          library_id: libraryId,
          ad_url: `https://www.facebook.com/ads/library/?id=${libraryId}`,
          primary_text: primaryText,
          page_name: pageName,
          cta: cta || '',
          started_running: '',
          scraped_date: new Date().toISOString().split('T')[0]
        });
      }
    }

    console.log(`   ✓ Found ${adsById.size} relevant ads (scroll ${i + 1}/${SCROLL_PAGES})`);
    await page.mouse.wheel(0, 1200);
    await sleep(2000);
  }

  if (adsById.size === 0) {
    if (DEBUG) {
      const safeName = companyName.replace(/[^a-z0-9]/gi, '_');
      const debugDir = path.join(__dirname, '../scraper/debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      const htmlPath = path.join(debugDir, `debug_${safeName}.html`);
      const shotPath = path.join(debugDir, `debug_${safeName}.png`);
      const html = await page.content();
      fs.writeFileSync(htmlPath, html);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`   🧪 Debug saved (cards: ${lastCardCount}): ${htmlPath}`);
      console.log(`   🧪 Screenshot: ${shotPath}`);
    }
    console.log('   ⚠️  No ads found');
  }

  return Array.from(adsById.values()).slice(0, MAX_ADS_PER_COMPETITOR);
}

function updateCompetitorsJson(allScrapedData) {
  console.log('\n💾 Updating competitors.json...');

  const data = JSON.parse(fs.readFileSync(COMPETITORS_FILE, 'utf8'));
  let totalAdded = 0;

  Object.values(data.competitors).forEach(category => {
    Object.entries(category).forEach(([key, competitor]) => {
      const companyName = competitor.name;
      const scrapedData = allScrapedData.find(d => d.companyName === companyName);
      if (!scrapedData || scrapedData.ads.length === 0) return;

      if (!Array.isArray(competitor.ads_observed)) {
        competitor.ads_observed = [];
      }

      scrapedData.ads.forEach(ad => {
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

  data.scraper_metadata = data.scraper_metadata || {};
  data.scraper_metadata.last_update = new Date().toISOString();
  data.scraper_metadata.last_scraper = 'facebook-library-scraper-playwright';

  const backupFile = COMPETITORS_FILE.replace('.json', `_backup_${Date.now()}.json`);
  fs.copyFileSync(COMPETITORS_FILE, backupFile);
  fs.writeFileSync(COMPETITORS_FILE, JSON.stringify(data, null, 2));

  console.log(`   ✅ Added ${totalAdded} new ads`);
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

function logScraperRun(success, updatesCount, errors, duration) {
  const logsPath = path.join(__dirname, '../data/scraper-logs.json');
  const updates = {
    timestamp: new Date().toISOString(),
    success,
    updates_found: updatesCount,
    errors: errors,
    duration: Math.round(duration / 1000),
    updates: errors.length > 0 ? errors : [] // Show errors in updates for failed runs
  };

  try {
    let logs = { runs: [] };
    if (fs.existsSync(logsPath)) {
      logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
    }
    
    logs.runs.push(updates);
    // Keep only last 50 runs
    if (logs.runs.length > 50) {
      logs.runs = logs.runs.slice(-50);
    }
    
    fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('  ⚠️ Failed to log scraper run:', err.message);
  }
}

async function main() {
  console.log('🤖 Facebook Ad Library Scraper (Playwright WebKit)');
  console.log('═══════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const errors = [];
  let updatesFound = 0;
  let success = true;

  try {
    const data = JSON.parse(fs.readFileSync(COMPETITORS_FILE, 'utf8'));
    const competitorsList = [];

    Object.values(data.competitors).forEach(category => {
      Object.values(category).forEach(competitor => {
        competitorsList.push(competitor.name);
      });
    });

    console.log(`🎯 ${competitorsList.length} competitors to scrape`);
    console.log(`📊 Max ${MAX_ADS_PER_COMPETITOR} ads per competitor`);
    console.log(`🇺🇸 US-only health/supplement ads`);
    console.log(`🧭 Profile: ${PROFILE_DIR}\n`);

    const context = await webkit.launchPersistentContext(PROFILE_DIR, {
      headless: HEADLESS,
      viewport: { width: 1280, height: 900 },
      locale: 'en-US'
    });

    const page = await context.newPage();
    await page.goto('https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US', { waitUntil: 'domcontentloaded' });

    if (!HEADLESS) {
      console.log('\n🔐 Login step required (one time).');
      console.log('1) Log in to Facebook in the open WebKit window.');
      console.log('2) After you see the Ad Library results, return here.');
      await waitForEnter('Press Enter to continue scraping...\n');
    }

    const allScrapedData = [];
    // Reorder to start with Lemme
    const lemmeName = 'Lemme (Supplement Brand)';
    const lemmeIndex = competitorsList.indexOf(lemmeName);
    if (lemmeIndex > 0) {
      const [lemme] = competitorsList.splice(lemmeIndex, 1);
      competitorsList.unshift(lemme);
    }
    
    const competitorsToScrape = LIMIT_COMPETITORS > 0
      ? competitorsList.slice(0, LIMIT_COMPETITORS)
      : competitorsList;

    for (const companyName of competitorsToScrape) {
      const ads = await scrapeCompetitor(page, companyName);
      if (ads.length > 0) {
        allScrapedData.push({ companyName, ads });
        updatesFound += ads.length;
      }
      await sleep(DELAY_BETWEEN_COMPETITORS);
    }

    await context.close();

    console.log('\n📊 Scraping Complete');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Competitors scraped: ${allScrapedData.length}/${competitorsToScrape.length}`);
    console.log(`Total ads found: ${updatesFound}`);

    if (allScrapedData.length > 0) {
      updateCompetitorsJson(allScrapedData);
      if (OLLAMA_ENABLE) {
        await feedOllama(allScrapedData);
      }
    }

    console.log('\n✅ Done!');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    success = false;
    errors.push(err.message);
  }

  // Log the run
  const duration = Date.now() - startTime;
  logScraperRun(success, updatesFound, errors, duration);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
