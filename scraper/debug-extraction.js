#!/usr/bin/env node

/**
 * DEBUG: Extract & Analyze - VISIBLE MODE
 * Shows each ad being processed in Chrome so you can see what's happening
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const DATA_DIR = path.join(__dirname, '../data');
const INPUT_FILE = path.join(DATA_DIR, 'facebook-ads-direct-links.json');

async function extractAdContent(page, adUrl, libraryId) {
  try {
    const urlWithCountry = adUrl.includes('country=US') ? adUrl : adUrl + (adUrl.includes('?') ? '&' : '?') + 'country=US';
    
    console.log(`\n📍 Loading: ${urlWithCountry.substring(0, 80)}...`);
    await page.goto(urlWithCountry, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const content = await page.evaluate(() => {
      // Get everything visible on the page
      const allText = document.body.innerText || '';
      const lines = allText.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 2 && l.length < 300);

      // Try different selectors
      const selectors = [
        { name: 'primary', sel: '[data-testid="ad-creative-body-text"]' },
        { name: 'headline', sel: 'h1, h2, h3' },
        { name: 'text', sel: 'p' },
        { name: 'cta', sel: '[role="button"]' }
      ];

      let extracted = {};
      for (const { name, sel } of selectors) {
        const el = document.querySelector(sel);
        if (el) extracted[name] = el.innerText?.trim() || '';
      }

      return {
        extracted_fields: extracted,
        top_lines: lines.slice(0, 10),
        total_lines: lines.length,
        page_title: document.title,
        page_url: window.location.href
      };
    });

    return { success: true, library_id: libraryId, ...content };
  } catch (err) {
    return { success: false, library_id: libraryId, error: err.message };
  }
}

async function main() {
  console.log('🔍 DEBUG MODE: Extract + Show Each Ad');
  console.log('='.repeat(70));
  console.log('Browser will be VISIBLE so you can see what\'s happening');
  console.log('Processing first 5 ads from each company\n');

  const inputData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  
  const allAds = [];
  for (const category in inputData) {
    if (Array.isArray(inputData[category])) {
      for (const company of inputData[category]) {
        if (company.ads && Array.isArray(company.ads)) {
          // Only first 5 ads per company for debugging
          for (let i = 0; i < Math.min(5, company.ads.length); i++) {
            const ad = company.ads[i];
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

  console.log(`📊 Will process ${allAds.length} ads (5 per company)`);
  console.log(`Companies: Lemme, Pendulum Life, Triquetra Health, Rosabella\n`);

  const browser = await puppeteer.launch({
    headless: false, // VISIBLE!
    userDataDir: path.join(__dirname, '../.stealth-profile'),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  for (let i = 0; i < allAds.length; i++) {
    const ad = allAds[i];
    console.log(`\n${'='.repeat(70)}`);
    console.log(`[${i + 1}/${allAds.length}] ${ad.company} - Library ID: ${ad.library_id}`);
    console.log(`${'='.repeat(70)}`);

    const result = await extractAdContent(page, ad.ad_url, ad.library_id);

    if (result.success) {
      console.log(`✅ Extraction successful!\n`);
      console.log(`📄 Extracted fields:`);
      for (const [key, value] of Object.entries(result.extracted_fields || {})) {
        if (value) console.log(`   ${key}: "${value.substring(0, 60)}${value.length > 60 ? '...' : ''}"`);
      }
      
      console.log(`\n📋 Top visible lines (${result.total_lines} total):`);
      result.top_lines.slice(0, 5).forEach((line, idx) => {
        console.log(`   ${idx + 1}. "${line.substring(0, 70)}${line.length > 70 ? '...' : ''}"`);
      });

      // Check if we have meaningful content
      const allContent = Object.values(result.extracted_fields || {}).join(' ').trim();
      if (allContent.length < 20) {
        console.log(`\n⚠️  WARNING: Very little content extracted (${allContent.length} chars)`);
        console.log(`   This is why ollama times out - not enough text to analyze!`);
      } else {
        console.log(`\n📝 Total content for analysis: ${allContent.length} characters`);
      }
    } else {
      console.log(`❌ Extraction failed: ${result.error}`);
    }

    // Wait before next ad
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ Debug complete! Check the Chrome window to see what was extracted.`);
  console.log(`\nProblem identified:`);
  console.log(`→ If content is empty/minimal, the ad pages don't have visible ad text`);
  console.log(`→ We need to extract from a different part of the page or use a different approach`);

  await browser.close();
}

main().catch(console.error);
