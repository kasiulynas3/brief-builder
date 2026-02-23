const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://www.facebook.com/ads/library/?id=1824753171479105&country=US';
  
  console.log('🔍 Testing ad extraction on Pendulum Life ad...');
  console.log('');
  
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 25000 });
  await new Promise(r => setTimeout(r, 2000));

  const content = await page.evaluate(() => {
    const allText = document.body.innerText || '';
    const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    return lines;
  });

  console.log('✅ ALL TEXT ON PAGE:');
  console.log('');
  content.forEach((line, i) => console.log(`${i+1}. ${line}`));

  await browser.close();
})().catch(console.error);
