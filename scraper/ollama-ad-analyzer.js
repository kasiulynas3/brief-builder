#!/usr/bin/env node

/**
 * Ollama Ad Analyzer
 * Sends extracted Facebook ads to ollama LLM for hook/angle/theme extraction
 * Saves results to data/facebook-ads-analyzed.json
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'mistral';
const DATA_DIR = path.join(__dirname, '../data');
const INPUT_FILE = path.join(DATA_DIR, 'facebook-ads-direct-links.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'facebook-ads-analyzed.json');

class OllamaAdAnalyzer {
  constructor() {
    this.ollamaUrl = OLLAMA_URL;
    this.model = MODEL;
  }

  async checkOllamaHealth() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`, { timeout: 3000 });
      return response.status === 200;
    } catch (err) {
      console.error('❌ Ollama not running at', this.ollamaUrl);
      console.error('   Start ollama with: ollama serve');
      return false;
    }
  }

  async analyzeAdText(adText, company) {
    try {
      const prompt = `Analyze this Facebook ad and extract key information in JSON format.

Ad Text/Context: "${adText || 'Video ad - no text extracted'}"
Brand: ${company}

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "primary_hook": "Main attention-grabbing hook (1 sentence)",
  "angles": ["angle1", "angle2", "angle3"],
  "messaging_themes": ["theme1", "theme2"],
  "cta_type": "call to action type if identifiable",
  "compliance_concerns": ["concern1", "concern2"] or [],
  "ad_type": "video|image|carousel|collection"
}

Keep responses concise and factual.`;

      const response = await axios.post(
        `${this.ollamaUrl}/api/generate`,
        {
          model: this.model,
          prompt: prompt,
          stream: false,
          temperature: 0.7
        },
        { timeout: 30000 }
      );

      const responseText = response.data.response || '';
      
      // Extract JSON from response (handle cases where model wraps it in markdown)
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch (err) {
      console.error(`⚠️  Failed to analyze ad: ${err.message}`);
      return {
        primary_hook: 'Analysis failed',
        angles: [],
        messaging_themes: [],
        cta_type: 'unknown',
        compliance_concerns: [],
        ad_type: 'unknown'
      };
    }
  }

  async loadAdsData() {
    try {
      if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ Input file not found: ${INPUT_FILE}`);
        return null;
      }
      return JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
    } catch (err) {
      console.error(`❌ Failed to load ads data: ${err.message}`);
      return null;
    }
  }

  async analyzeAllAds() {
    console.log('🤖 Ollama Ad Analyzer');
    console.log('==============================================================');

    // Check ollama health
    const isHealthy = await this.checkOllamaHealth();
    if (!isHealthy) {
      process.exit(1);
    }

    console.log(`✅ Connected to ollama at ${this.ollamaUrl}`);
    console.log(`📊 Using model: ${this.model}\n`);

    // Load ads
    const allAds = await this.loadAdsData();
    if (!allAds) {
      process.exit(1);
    }

    const analyzedData = {};
    let totalProcessed = 0;
    let startTime = Date.now();

    // Process each category and company
    for (const category of Object.values(allAds)) {
      for (const company of category) {
        const companyName = company.name;
        const ads = company.ads || [];
        
        console.log(`\n📱 ${companyName} (${ads.length} ads)`);
        analyzedData[companyName] = {
          name: companyName,
          category: company.category,
          adCount: ads.length,
          analyzedAt: new Date().toISOString(),
          ads: []
        };

        for (let i = 0; i < ads.length; i++) {
          const ad = ads[i];
          const libId = ad.library_id || 'unknown';
          
          process.stdout.write(`  📖 [${i + 1}/${ads.length}] ${libId.substring(0, 20)}... `);

          // Use raw_text or hook as analysis input
          const textToAnalyze = (ad.raw_text || ad.hook || '').trim();
          const analysis = await this.analyzeAdText(textToAnalyze, companyName);

          analyzedData[companyName].ads.push({
            library_id: libId,
            ad_url: ad.ad_url,
            original_hook: ad.hook,
            original_raw_text: ad.raw_text,
            analysis: analysis,
            timestamp: ad.timestamp
          });

          console.log('✓');
          totalProcessed++;

          // Rate limit to avoid overwhelming ollama
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    // Save analyzed data
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analyzedData, null, 2));

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n==============================================================');
    console.log(`✅ Analysis complete in ${duration}s`);
    console.log(`📊 Total ads analyzed: ${totalProcessed}`);
    console.log(`📁 Results saved to: ${OUTPUT_FILE}`);
  }
}

// Run analyzer
const analyzer = new OllamaAdAnalyzer();
analyzer.analyzeAllAds().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
