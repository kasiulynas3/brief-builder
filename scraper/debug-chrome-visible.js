#!/usr/bin/env node

/**
 * DEBUG: Open Chrome 1-by-1 - Show exactly what we're doing with each ad
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function processAd(page, adNumber, company, libraryId, adUrl) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`AD ${adNumber}: ${company} - Library ID: ${libraryId}`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`📍 URL: ${adUrl}\n`);
  
  try {
    console.log('⏳ Loading page...');
    await page.goto(adUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('✅ Page loaded');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Waited for dynamic content\n');

    // Get detailed page info
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        bodyText: document.body.innerText?.substring(0, 500) || '',
        allText: document.body.innerText || '',
        elementCount: document.querySelectorAll('*').length
      };
    });

    console.log(`📄 Page Title: ${pageInfo.title}`);
    console.log(`📍 Final URL: ${pageInfo.url}`);
    console.log(`📊 Elements on page: ${pageInfo.elementCount}\n`);
    
    console.log('📋 First 300 chars of visible text:');
    console.log('─'.repeat(80));
    console.log(pageInfo.bodyText);
    console.log('─'.repeat(80));
    
    const lines = pageInfo.allText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 3 && l.length < 200);
    
    console.log(`\n📊 Total lines of text: ${lines.length}`);
    console.log('Top 10 lines:');
    lines.slice(0, 10).forEach((line, i) => {
      console.log(`  ${i + 1}. "${line.substring(0, 70)}${line.length > 70 ? '...' : ''}"`);
    });

    console.log('\n✅ Ready for ollama analysis');
    
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}

async function main() {
  console.log('\n🔍 CHROME DEBUG MODE - Open 1-by-1 with Visible Window');
  console.log('═'.repeat(80));
  console.log('This will open Chrome in VISIBLE mode so you can see each ad being processed\n');

  const DATA_FILE = path.join(__dirname, '../data/facebook-ads-direct-links.json');
  const inputData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  
  // Get first 5 ads from all companies
  const allAds = [];
  for (const category in inputData) {
    if (Array.isArray(inputData[category])) {
      for (const company of inputData[category]) {
        if (company.ads && Array.isArray(company.ads)) {
          for (let i = 0; i < Math.min(5, company.ads.length); i++) {
            allAds.push({
              category,
              company: company.name,
              adCount: company.adCount,
              ...company.ads[i]
            });
          }
        }
      }
    }
  }

  console.log(`📊 Will process ${allAds.length} ads (first 5 from each company)\n`);
  console.log('Companies:');
  [...new Set(allAds.map(a => a.company))].forEach(c => console.log(`  • ${c}`));
  console.log('');

  const browser = await puppeteer.launch({
    headless: false, // ← VISIBLE MODE!
    userDataDir: path.join(__dirname, '../.stealth-profile'),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ],
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  for (let i = 0; i < allAds.length; i++) {
    const ad = allAds[i];
    
    // Ensure country=US in URL
    const adUrl = ad.ad_url.includes('country=US') 
      ? ad.ad_url 
      : ad.ad_url + (ad.ad_url.includes('?') ? '&' : '?') + 'country=US';

    await processAd(page, i + 1, ad.company, ad.library_id, adUrl);

    if (i < allAds.length - 1) {
      console.log('\n⏳ Waiting 5 seconds before next ad...');
      console.log('(Watch Chrome window open the next ad automatically)\n');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`\n${'═'.repeat(80)}`);
  console.log('✅ COMPLETE - Chrome will close in 10 seconds');
  console.log('═'.repeat(80));
  
  await new Promise(r => setTimeout(r, 10000));
  await browser.close();
  
  console.log('✅ Done!');
}

main().catch(console.error);
