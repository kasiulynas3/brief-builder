#!/usr/bin/env node

/**
 * Simple approach: Just use the Library IDs we have + ollama for analysis
 * Don't try to extract from pages - use the existing library_id format
 * Facebook Ad Library permalink format: https://www.facebook.com/ads/library/?id=LIBRARY_ID
 * 
 * Actually, the real ad creatives are shown in a modal/overlay
 * We need to wait for and click on the ad to load its content
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const DATA_DIR = path.join(__dirname, '../data');
const INPUT_FILE = path.join(DATA_DIR, 'facebook-ads-direct-links.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'facebook-ads-analyzed.json');

async function extractAdContent(page, libraryId, attemptCount = 0) {
  try {
    // Use the direct ad URL
    const adUrl = `https://www.facebook.com/ads/library/?id=${libraryId}&country=US`;
    
    await page.goto(adUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to find and click on the ad card to reveal content
    const content = await page.evaluate(() => {
      // Look for ad text in multiple locations
      const selectors = [
        '[data-testid="ad_creative_body_text"]',
        '[data-testid*="text"]',
        '[role="heading"]',
        'div[style*="primaryText"]',
        'span._97w2'  // Facebook Ad Library text span
      ];

      let textContent = '';
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText?.trim();
          if (text && text.length > 10) {
            textContent += text + '\n';
          }
        }
      }

      // Get all text from the page body, filter meaningful lines
      const allText = document.body.innerText || '';
      const lines = allText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 5 && l.length < 200 && !l.includes('Meta') && !l.includes('Ad Library') && !l.includes('Report'))
        .slice(0, 10);

      // Alternative: look for structured content
      const contentDiv = document.querySelector('[data-testid="ad_creative"]');
      const creativeDivText = contentDiv ? contentDiv.innerText : '';

      return {
        primary_text: textContent.substring(0, 300),
        all_lines: lines,
        creative_text: creativeDivText.substring(0, 200),
        page_title: document.title
      };
    });

    return { success: true, library_id: libraryId, ...content };
  } catch (err) {
    if (attemptCount < 2) {
      await new Promise(r => setTimeout(r, 2000));
      return extractAdContent(page, libraryId, attemptCount + 1);
    }
    return { success: false, library_id: libraryId, error: err.message };
  }
}

async function analyzeWithOllama(adContent, libraryId, timeout = 30000) {
  try {
    if (!adContent || adContent.trim().length < 5) {
      return { success: false, error: 'No content to analyze' };
    }

    const prompt = `Analyze this Facebook ad copy and extract key marketing elements:

"${adContent}"

Return ONLY valid JSON (no markdown):
{
  "hook": "main attention-grabber (1 sentence max)",
  "angle": "primary benefit (1 sentence)",
  "cta": "call-to-action if any",
  "theme": "visual/narrative theme"
}`;

    const response = await axios.post(
      'http://localhost:11434/api/generate',
      {
        model: 'mistral',
        prompt: prompt,
        stream: false,
        temperature: 0.2
      },
      { timeout }
    );

    if (!response.data.response) throw new Error('No response');

    let jsonStr = response.data.response.trim();
    if (jsonStr.includes('```json')) jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    else if (jsonStr.includes('```')) jsonStr = jsonStr.split('```')[1].split('```')[0].trim();

    const analysis = JSON.parse(jsonStr);
    return { success: true, analysis };
  } catch (err) {
    console.error(`  ⚠️  Ollama failed for ${libraryId}: ${err.message.substring(0, 50)}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('🔍 Smart Extract & Analyze - Focus on Ad Text');
  console.log('='.repeat(70));

  const inputData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  
  const allAds = [];
  for (const category in inputData) {
    if (Array.isArray(inputData[category])) {
      for (const company of inputData[category]) {
        if (company.ads && Array.isArray(company.ads)) {
          for (const ad of company.ads) {
            allAds.push({ category, company: company.name, ...ad });
          }
        }
      }
    }
  }

  console.log(`📊 Processing ${allAds.length} ads\n`);

  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: path.join(__dirname, '../.stealth-profile'),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < allAds.length; i++) {
    const ad = allAds[i];
    process.stdout.write(`\r[${i + 1}/${allAds.length}] ${ad.company.padEnd(18)} ${ad.library_id.substring(0, 12)}... `);

    const extracted = await extractAdContent(page, ad.library_id);
    
    if (!extracted.success) {
      process.stdout.write('❌');
      results.push({ ...ad, ...extracted, analysis: null });
      await new Promise(r => setTimeout(r, 800));
      continue;
    }

    // Pick best text to analyze
    const textToAnalyze = [
      extracted.primary_text,
      extracted.creative_text,
      extracted.all_lines?.join(' ') || ''
    ]
      .filter(t => t && t.length > 10)
      [0] || '';

    if (!textToAnalyze || textToAnalyze.trim().length < 10) {
      process.stdout.write('⚠️');
      results.push({ ...ad, ...extracted, analysis: null });
      await new Promise(r => setTimeout(r, 800));
      continue;
    }

    const analysis = await analyzeWithOllama(textToAnalyze, ad.library_id);
    process.stdout.write(analysis.success ? '✅' : '⚠️');

    results.push({
      category: ad.category,
      company: ad.company,
      library_id: ad.library_id,
      extracted_text: textToAnalyze.substring(0, 100),
      analysis: analysis.analysis || null,
      timestamp: new Date().toISOString()
    });

    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`\n  💾 Checkpoint: ${i + 1} ads (${elapsed}s)`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const succeeded = results.filter(r => r.analysis).length;
  
  console.log(`\n\n✅ Complete!`);
  console.log(`✓ Processed: ${results.length}`);
  console.log(`✓ Analyzed: ${succeeded}`);
  console.log(`⏱️  Duration: ${elapsed}s`);
  console.log(`📁 Saved: ${OUTPUT_FILE}`);

  await browser.close();
}

main().catch(console.error);
