/**
 * AGGRESSIVE AD EXTRACTION
 * ========================
 * Instead of just reading the page - actually INTERACT with it
 * Click, scroll, wait for dynamic content to load
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const path = require('path');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const PROFILE_DIR = path.join(__dirname, '../.stealth-profile');

async function aggressiveExtract(companyName) {
  console.log(`\n🔥 AGGRESSIVE EXTRACTION: ${companyName}`);
  
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: PROFILE_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  try {
    const searchUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&q=${encodeURIComponent(companyName)}&search_type=keyword_unordered&media_type=all`;
    
    console.log(`📍 Loading ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for page to fully render
    await page.waitForTimeout(3000);
    
    // Check if we need to login
    const needsLogin = await page.evaluate(() => {
      return document.body.innerText.includes('Log in to your account');
    });
    
    if (needsLogin) {
      console.log('⚠️  Login required');
      console.log('Press Enter after logging in...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    console.log('📜 Aggressive scrolling...');
    
    // Scroll multiple times with longer waits
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      console.log(`  Scroll ${i + 1}/10`);
      await page.waitForTimeout(2000); // Wait longer for content to load
    }
    
    console.log('💾 Capturing full page content...');
    
    // Get ALL page text
    const fullText = await page.evaluate(() => document.body.innerText);
    
    // Take screenshot
    const screenshotPath = path.join(__dirname, `../data/extraction-${companyName.replace(/\s+/g, '-')}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot: ${screenshotPath}`);
    
    // Get HTML
    const html = await page.content();
    
    // Parse out ad IDs using regex
    const adIdPattern = /id["\']?\s*[:=]\s*["\']?(\d{15,})/gi;
    const adIds = [];
    let match;
    while ((match = adIdPattern.exec(html)) !== null) {
      adIds.push(match[1]);
    }
    
    // Parse out common ad text patterns
    const lines = fullText.split('\n').filter(line => line.trim().length > 0);
    
    console.log(`\n📊 EXTRACTED DATA:`);
    console.log(`📈 Found ${adIds.length} potential ad IDs`);
    console.log(`📄 Found ${lines.length} text lines`);
    console.log(`\n🔍 Ad IDs: ${adIds.slice(0, 10).join(', ')}`);
    console.log(`\n📝 Sample text lines:`);
    lines.slice(0, 20).forEach((line, idx) => {
      console.log(`   ${idx}: ${line.substring(0, 80)}`);
    });
    
    // Save full text for manual inspection
    const textPath = path.join(__dirname, `../data/extraction-${companyName.replace(/\s+/g, '-')}.txt`);
    const fs = require('fs');
    fs.writeFileSync(textPath, fullText);
    console.log(`\n💾 Full text saved to: ${textPath}`);
    
    return {
      adIds,
      textLines: lines,
      htmlLength: html.length
    };
    
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    return null;
  } finally {
    await browser.close();
  }
}

// Test
if (require.main === module) {
  aggressiveExtract('Lemme').catch(console.error);
}

module.exports = { aggressiveExtract };
