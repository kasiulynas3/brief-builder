#!/usr/bin/env node

/**
 * Quick debug test - see what's on the page
 */

const { webkit } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROFILE_DIR = path.join(__dirname, '.playwright-profile');

async function test() {
  console.log('🔍 Testing Facebook Ad Library in visible mode...\n');

  const context = await webkit.launchPersistentContext(PROFILE_DIR, {
    headless: false, // VISIBLE MODE
    viewport: { width: 1280, height: 900 },
    locale: 'en-US'
  });

  const page = await context.newPage();
  
  // Directly navigate to a simple Ad Library search
  const url = 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&locale=en_US&search_type=keyword_unordered&q=Ro';
  
  console.log(`📍 Navigating to: ${url}\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  
  // Wait for user to see the page
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Get page info
  const title = await page.title();
  const currentUrl = page.url();
  console.log(`\n📄 Page Title: ${title}`);
  console.log(`🔗 Current URL: ${currentUrl}`);
  
  // Check if we got redirected to login
  if (currentUrl.includes('/login/')) {
    console.log('\n❌ REDIRECTED TO LOGIN - Session is invalid/expired!\n');
    console.log('Solution: Delete .playwright-profile and run scraper with HEADLESS=0 to re-login\n');
    await context.close();
    return;
  }

  // Try to find ad cards
  const cardCount = await page.locator('div[role="article"], div[data-testid="ad_library_card"]').count();
  console.log(`\n🃏 Cards found with selectors: ${cardCount}`);
  
  if (cardCount === 0) {
    // Try alternative selectors
    const alternatives = [
      '[data-testid="ad_library_card"]',
      'div[role="article"]',
      '[role="article"]',
      '.ad-library-card',
      '[data-test="ad_card"]'
    ];
    
    console.log('\n📌 Trying alternative selectors:');
    for (const sel of alternatives) {
      const count = await page.locator(sel).count();
      console.log(`   ${sel}: ${count} elements`);
    }
    
    // Save debug
    const html = await page.content();
    const debugPath = path.join(__dirname, 'scraper/debug');
    if (!fs.existsSync(debugPath)) fs.mkdirSync(debugPath, { recursive: true });
    
    fs.writeFileSync(path.join(debugPath, 'debug_test.html'), html);
    console.log(`\n💾 HTML saved: scraper/debug/debug_test.html`);
  }

  console.log('\n⏳ Keeping browser open for 30 seconds. Inspect the page manually...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  await context.close();
  console.log('\n✅ Done');
}

test().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
