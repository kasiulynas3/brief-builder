#!/usr/bin/env node

/**
 * Simple: Open ad, get all visible text, send to ollama
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const DATA_DIR = path.join(__dirname, '../data');
const INPUT_FILE = path.join(DATA_DIR, 'facebook-ads-direct-links.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'facebook-ads-analyzed-simple.json');

const OLLAMA_API = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'mistral';

async function extractAndAnalyze(page, adUrl, libraryId, company) {
  try {
    // Just load the ad
    const urlWithCountry = adUrl.includes('country=US') ? adUrl : adUrl + (adUrl.includes('?') ? '&' : '?') + 'country=US';
    
    console.log(`  📱 Loading ad...`);
    await page.goto(urlWithCountry, { waitUntil: 'domcontentloaded', timeout: 12000 });
    
    // Wait for content to render
    console.log(`  ⏳ Waiting for content...`);
    await new Promise(r => setTimeout(r, 3000));

    // Get ALL visible text on page
    const allText = await page.evaluate(() => {
      return document.body.innerText || '';
    });

    console.log(`  📝 Got ${allText.length} chars of text`);

    if (allText.length < 50) {
      console.log(`  ⚠️  Too little content (${allText.length} chars)`);
      return { success: false, reason: 'insufficient_content' };
    }

    // Send to ollama for analysis
    console.log(`  🧠 Sending to ollama...`);
    const prompt = `Analyze this Facebook ad and extract ONLY JSON with these fields:
{
  "hook": "main attention-grabber line",
  "angle": "benefit/positioning",
  "theme": "visual theme or narrative style",
  "cta": "call to action if any"
}

AD TEXT:
${allText.substring(0, 2000)}

Reply with ONLY valid JSON, no markdown or explanations:`;

    const response = await axios.post(
      OLLAMA_API,
      {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.2
      },
      { timeout: 15000 }
    );

    let jsonStr = response.data.response.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const analysis = JSON.parse(jsonStr);
    console.log(`  ✅ Analyzed! Hook: "${analysis.hook?.substring(0, 40)}..."`);

    return {
      success: true,
      library_id: libraryId,
      company,
      ad_url: adUrl,
      text_length: allText.length,
      analysis
    };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message?.substring(0, 50)}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('🔍 Simple Ad Analysis - Just get text + ollama\n');

  const inputData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  
  const allAds = [];
  for (const category in inputData) {
    if (Array.isArray(inputData[category])) {
      for (const company of inputData[category]) {
        if (company.ads && Array.isArray(company.ads)) {
          for (const ad of company.ads) {
            allAds.push({
              category,
              company: company.name,
              ...ad
            });
          }
        }
      }
    }
  }

  console.log(`📊 Processing ${allAds.length} ads\n`);

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: path.join(__dirname, '../.stealth-profile'),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < allAds.length; i++) {
    const ad = allAds[i];
    process.stdout.write(`[${i + 1}/${allAds.length}] ${ad.company.padEnd(18)} ${ad.library_id.substring(0, 12)}... `);

    const result = await extractAndAnalyze(page, ad.ad_url, ad.library_id, ad.company);
    
    if (result.success) {
      succeeded++;
      results.push(result);
    } else {
      failed++;
    }

    // Save every 50 ads
    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
      console.log(`\n💾 Saved checkpoint: ${i + 1} ads`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 1500));
  }

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  console.log(`\n\n✅ Complete!`);
  console.log(`✓ Succeeded: ${succeeded}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`📁 Saved to: ${OUTPUT_FILE}`);

  await browser.close();
}

main().catch(console.error);
