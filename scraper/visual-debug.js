const { webkit } = require('playwright');
const path = require('path');
const fs = require('fs');

async function test() {
  const context = await webkit.launchPersistentContext(
    path.join(__dirname, '../.playwright-profile'),
    { headless: false, viewport: { width: 1280, height: 900 } }
  );

  const page = await context.newPage();
  console.log('🌐 Opening Ad Library...');
  
  await page.goto('https://www.facebook.com/ads/library/?q=Ro&country=US&ad_type=all');
  
  // Wait for cards to load (increase timeout)
  await page.waitForTimeout(5000);
  
  // Look for any div or section elements
  const allDivs = await page.locator('div').count();
  console.log(`Total divs: ${allDivs}`);
  
  // Try to get text content to see if ads are there
  const bodyText = await page.locator('body').innerText();
  const hasAds = bodyText.includes('Library ID') || bodyText.includes('Ro') || bodyText.match(/Sponsored|Ad/i);
  console.log(`Page has ad-like content: ${hasAds}`);
  
  if (hasAds) {
    console.log('✅ Ads ARE on the page, just need correct selectors!\n');
    // Print first 2000 chars of body text
    console.log(bodyText.substring(0, 2000));
  } else {
    console.log('❌ No ad content found on page\n');
  }
  
  // Take screenshot
  const shotPath = path.join(__dirname, 'scraper/debug/visual.png');
  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`\n📸 Screenshot: ${shotPath}`);
  
  await new Promise(r => setTimeout(r, 3000));
  await context.close();
}

test().catch(console.error);
