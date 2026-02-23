const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function test() {
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: path.join(__dirname, '../.stealth-profile'),
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  
  const url = 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&q=lemmebykourtneykardashian&search_type=keyword_unordered&media_type=all';
  
  console.log('Loading page...');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  
  await new Promise(r => setTimeout(r, 3000));
  
  // Scroll
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('Extracting...');
  const data = await page.evaluate(() => {
    // Try to find ad cards with DOM
    const ads = [];
    
    // Strategy 1: Find all divs that might be ad cards
    const allDivs = Array.from(document.querySelectorAll('div'));
    const cardDivs = allDivs.filter(div => {
      const text = div.innerText || '';
      return text.includes('Library ID') && text.length > 50 && text.length < 2000;
    });
    
    cardDivs.slice(0, 10).forEach(card => {
      const text = card.innerText;
      const idMatch = text.match(/Library ID:\s*(\d+)/);
      if (idMatch) {
        ads.push({
          library_id: idMatch[1],
          text: text.substring(0, 300)
        });
      }
    });
    
    return {
      found: ads.length,
      ads: ads,
      bodySnippet: document.body.innerText.substring(0, 2000)
    };
  });
  
  console.log(JSON.stringify(data, null, 2));
  
  // Save HTML
  const html = await page.content();
  fs.writeFileSync(path.join(__dirname, '../data/debug-page.html'), html);
  console.log('\n✅ Saved HTML to data/debug-page.html');
  
  console.log('\nBrowser left open - press Ctrl+C to close');
}

test().catch(console.error);
