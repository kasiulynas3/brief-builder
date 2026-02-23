#!/usr/bin/env node

/**
 * Extract All Ads + Ollama Analysis
 * 1. Visit each of 656 ads 1-by-1
 * 2. Extract full ad content (text, headline, CTA)
 * 3. Send to ollama for hooks/angles/themes/compliance analysis
 * 4. Save enriched data
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
const LOG_FILE = path.join(DATA_DIR, 'extraction-log.json');
const PROFILE_DIR = path.join(__dirname, '../.stealth-profile');

const OLLAMA_API = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'mistral';

// Ollama analysis prompt
function createAnalysisPrompt(adContent) {
  return `You are an expert ad copywriter analyzing Facebook ads. Analyze this ad content and extract:

AD CONTENT:
${adContent}

Please provide ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "hook": "The primary hook/attention-grabber (max 2 sentences)",
  "angle": "The main selling angle/benefit (max 2 sentences)",
  "theme": "Visual/narrative theme (e.g., 'clinical but warm', 'tech-forward', 'before/after')",
  "compliance_pattern": "Any compliance disclaimers or legal language observed",
  "cta": "Call-to-action text if visible",
  "target_audience": "Who this ad targets",
  "trending_phrase": "Most memorable phrase from the ad"
}`;
}

async function extractAdContent(page, adUrl, libraryId) {
  try {
    // Ensure country=US
    const urlWithCountry = adUrl.includes('country=US') ? adUrl : adUrl + (adUrl.includes('?') ? '&' : '?') + 'country=US';
    
    // Reasonable timeout (25 seconds) - If page doesn't load, move on
    try {
      await page.goto(urlWithCountry, { waitUntil: 'networkidle0', timeout: 25000 });
    } catch (navErr) {
      // Page load failed - just try to work with whatever's loaded
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    const content = await page.evaluate(() => {
      // Find the actual ad creative card (the red box content)
      // Look for the main ad content area
      const adCard = document.querySelector('div[data-ad-preview], [role="article"], div[class*="ad"], div[class*="creative"]');
      
      if (!adCard) {
        // Fallback: get all text and parse it
        const allText = document.body.innerText || '';
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        return {
          primary_text: lines.slice(2, 10).join(' '),
          headline: lines[0] || '',
          cta: lines.filter(l => l.toLowerCase().includes('shop') || l.toLowerCase().includes('buy') || l.toLowerCase().includes('learn'))[0] || '',
          all_visible_text: allText.substring(0, 3000),
          line_count: lines.length,
          top_lines: lines.slice(0, 20)
        };
      }

      // Extract from the ad card
      const adText = adCard.innerText || adCard.textContent || '';
      const lines = adText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      return {
        primary_text: lines.slice(2, 8).join(' '), // Main ad body text
        headline: lines[0] || '', // Company name/headline
        cta: lines.filter(l => l.match(/shop|buy|learn|start|try|get/i))[0] || lines[lines.length - 1] || '',
        all_visible_text: adText.substring(0, 3000),
        line_count: lines.length,
        top_lines: lines
      };
    });

    return {
      success: true,
      library_id: libraryId,
      url: adUrl,
      ...content,
      extracted_at: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      library_id: libraryId,
      url: adUrl,
      error: err.message,
      extracted_at: new Date().toISOString()
    };
  }
}

async function analyzeWithOllama(adContent, libraryId, timeout = 20000) {
  try {
    const prompt = createAnalysisPrompt(adContent);
    
    const response = await axios.post(
      OLLAMA_API,
      {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.3,
        top_p: 0.8
      },
      { timeout }
    );

    if (!response.data.response) {
      throw new Error('No response from ollama');
    }

    // Parse JSON from response
    let jsonStr = response.data.response.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const analysis = JSON.parse(jsonStr);
    return { success: true, analysis };
  } catch (err) {
    // Don't log every failure - just return false and move on
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('🔍 Extract & Analyze All 656 Ads');
  console.log('='.repeat(70));

  // Load extracted ads - structure is {category: [{name, adCount, ads: [...]}, ...]...}
  const inputData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  
  const allAds = [];
  for (const category in inputData) {
    const categoryData = inputData[category];
    if (Array.isArray(categoryData)) {
      for (const company of categoryData) {
        if (company.ads && Array.isArray(company.ads)) {
          for (const ad of company.ads) {
            allAds.push({
              category,
              company: company.name,
              adCount: company.adCount,
              ...ad
            });
          }
        }
      }
    }
  }

  console.log(`📊 Total ads found: ${allAds.length}`);
  console.log(`🌐 Will extract content 1-by-1 and feed to ollama\n`);

  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS !== '0',
    userDataDir: PROFILE_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1920, height: 1080 }
  });

  let page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  const enrichedAds = [];
  const log = {
    start_time: new Date().toISOString(),
    total_ads: allAds.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    logs: []
  };

  const startTime = Date.now();
  let pageRecycleCounter = 0;
  const PAGE_RECYCLE_INTERVAL = 15; // Recreate page every 15 ads to prevent resource leaks

  // Process each ad
  for (let i = 0; i < allAds.length; i++) {
    // Periodically recreate page to prevent browser memory buildup
    if (pageRecycleCounter >= PAGE_RECYCLE_INTERVAL) {
      try {
        await page.close().catch(() => {});
      } catch (e) {
        // Ignore
      }
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      pageRecycleCounter = 0;
    }
    pageRecycleCounter++;
    const ad = allAds[i];
    const progress = `[${i + 1}/${allAds.length}]`;
    
    process.stdout.write(`\r${progress} ${ad.company.padEnd(20)} ${ad.library_id.substring(0, 14)}... `);

    // Step 1: Extract content
    const extracted = await extractAdContent(page, ad.ad_url, ad.library_id);
    
    if (!extracted.success) {
      process.stdout.write(`❌ Extract failed`);
      log.failed++;
      log.logs.push({
        index: i + 1,
        library_id: ad.library_id,
        company: ad.company,
        status: 'extract_failed',
        error: extracted.error
      });
      enrichedAds.push({ ...ad, ...extracted, analysis: null });
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    // Combine all extracted text - LIMIT TO 500 CHARS (avoid ollama timeout)
    const combinedText = [
      extracted.primary_text,
      extracted.headline,
      extracted.cta,
      extracted.top_lines?.join(' ') || ''
    ]
      .filter(t => t && t.length > 0)
      .join('\n')
      .substring(0, 500); // ONLY send first 500 chars to ollama to avoid timeout

    if (!combinedText || combinedText.trim().length < 10) {
      process.stdout.write(`⚠️ No ad content found`);
      log.logs.push({
        index: i + 1,
        library_id: ad.library_id,
        company: ad.company,
        status: 'no_content'
      });
      enrichedAds.push({ ...ad, ...extracted, analysis: null });
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    // Step 2: Analyze with ollama (30s timeout - text is now limited to 500 chars)
    const analysis = await analyzeWithOllama(combinedText, ad.library_id, 30000);
    
    if (analysis.success) {
      process.stdout.write(`✅ Analyzed`);
      log.succeeded++;
    } else {
      process.stdout.write(`⚠️ Ollama failed`);
      log.failed++;
    }

    log.logs.push({
      index: i + 1,
      library_id: ad.library_id,
      company: ad.company,
      status: analysis.success ? 'success' : 'ollama_failed',
      error: analysis.error || null
    });

    enrichedAds.push({
      category: ad.category,
      company: ad.company,
      library_id: ad.library_id,
      ad_url: ad.ad_url,
      extraction: {
        primary_text: extracted.primary_text,
        headline: extracted.headline,
        cta: extracted.cta,
        top_lines: extracted.top_lines
      },
      analysis: analysis.analysis || null,
      processed_at: new Date().toISOString()
    });

    log.processed++;

    // Save every 20 ads
    if ((i + 1) % 20 === 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedAds, null, 2));
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = ((i + 1) / elapsed * 60).toFixed(1);
      console.log(`\n  💾 Checkpoint: ${i + 1} ads processed (${rate} ads/min, ${elapsed}s elapsed)`);
    }

    // Rate limiting - shorter pause since we're recycling pages
    await new Promise(r => setTimeout(r, 800));
  }

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedAds, null, 2));
  log.end_time = new Date().toISOString();
  log.duration_seconds = ((Date.now() - startTime) / 1000).toFixed(0);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));

  console.log(`\n\n✅ Complete!`);
  console.log(`📊 Results:`);
  console.log(`  ✓ Succeeded: ${log.succeeded}`);
  console.log(`  ✗ Failed: ${log.failed}`);
  console.log(`  ⏱️  Duration: ${log.duration_seconds}s`);
  console.log(`📁 Saved to:`);
  console.log(`  ${OUTPUT_FILE}`);
  console.log(`  ${LOG_FILE}`);

  await browser.close();
}

main().catch(console.error);
