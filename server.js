const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const GLP1CompetitorScraper = require('./scraper/glp1-competitors');
const app = express();
const { COMPETITOR_DATA, MARKETING_PATTERNS } = require('./competitor-data');
const { META_COMPLIANCE_RULES } = require('./meta-compliance');

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-1.5-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = 'meta-llama/llama-2-70b-chat';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'mixtral-8x7b-32768';

// ─── COMPETITOR SCRAPER INITIALIZATION ────────────────────────────────────
const scraper = new GLP1CompetitorScraper();
console.log(`[SCRAPER] Loaded with ${scraper.getScraperStatus().companyCount} competitors`);

// ─── SESSION MEMORY (resets on server restart) ─────────────────────────────
const sessionMemory = {
  angles: [], // [{product, context, angles: [...]}]
  hooks: [],   // [{product, angle, hooks: [...]}]
  analyzedAds: [] // [{analysis, timestamp}]
};

function addToMemory(type, data) {
  if (type === 'angles') {
    sessionMemory.angles.push(data);
    // Keep only last 20 generations to avoid bloat
    if (sessionMemory.angles.length > 20) sessionMemory.angles.shift();
  } else if (type === 'hooks') {
    sessionMemory.hooks.push(data);
    if (sessionMemory.hooks.length > 20) sessionMemory.hooks.shift();
  }
}

function getMemoryContext(type) {
  let context = '';
  
  // Add competitor intelligence from scraper
  const competitorContext = scraper.getCompetitorContext();
  if (competitorContext) {
    context += competitorContext;
  }
  
  // Add analyzed ads context
  if (sessionMemory.analyzedAds.length > 0) {
    const adAnalysis = sessionMemory.analyzedAds.slice(-3).map(ad => ad.analysis).join('\n\n---\n\n');
    context += `\n\n## ANALYZED COMPETITOR ADS (use these for inspiration, learn their strategies):\n${adAnalysis}\n`;
  }
  
  if (type === 'angles' && sessionMemory.angles.length > 0) {
    const examples = sessionMemory.angles.slice(-5).map(m => 
      `Product: ${m.product}\nAngles: ${m.angles.join(', ')}`
    ).join('\n\n');
    context += `\n\n## PREVIOUS GENERATIONS (for REFERENCE ONLY - create NEW unique angles, don't repeat these):\n${examples}\n`;
  } else if (type === 'hooks' && sessionMemory.hooks.length > 0) {
    const examples = sessionMemory.hooks.slice(-5).map(m =>
      `Product: ${m.product} | Angle: ${m.angle}\nHooks: ${m.hooks.join(' | ')}`
    ).join('\n\n');
    context += `\n\n## PREVIOUS GENERATIONS (for REFERENCE ONLY - create NEW unique hooks, don't repeat these):\n${examples}\n`;
  }
  
  return context;
}

function buildCompetitorNews() {
  const data = scraper.competitorData || {};
  const marketing = data.marketing_insights || {};
  const competitors = data.competitors || {};
  const themeCounts = {};
  const adCounts = {};
  const positioning = [];

  const addCount = (map, value) => {
    if (!value) return;
    const key = String(value).toLowerCase();
    if (!map[key]) {
      map[key] = { label: value, count: 0 };
    }
    map[key].count += 1;
  };

  Object.values(competitors).forEach(category => {
    Object.values(category).forEach(brand => {
      (brand.key_benefits || []).forEach(term => addCount(themeCounts, term));
      (brand.emotionalTriggers || []).forEach(term => addCount(themeCounts, term));
      (brand.ads_observed || []).forEach(ad => addCount(adCounts, ad));
      if (brand.positioning) positioning.push(brand.positioning);
    });
  });

  const topThemes = Object.values(themeCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topAdPhrases = Object.values(adCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const recentRuns = (scraper.scraperLogs?.runs || [])
    .slice(-5)
    .map(run => ({
      timestamp: run.timestamp,
      updatesFound: run.updates_found || 0,
      success: !!run.success
    }))
    .reverse();

  return {
    lastUpdated: data.lastUpdated,
    companyCount: Object.values(competitors).reduce((sum, cat) => sum + Object.keys(cat).length, 0),
    totalUpdates: scraper.scraperLogs?.totalUpdates || 0,
    totalRuns: scraper.scraperLogs?.runs?.length || 0,
    topHooks: (marketing.top_hooks || []).slice(0, 8),
    compliancePatterns: (marketing.compliance_patterns || []).slice(0, 8),
    topThemes,
    topAdPhrases,
    positioning: positioning.slice(0, 8),
    recentRuns
  };
}

// ─── CALL OLLAMA ───────────────────────────────────────────────────────────
async function callOllama(prompt) {
  try {
    const res = await axios.post(OLLAMA_URL, {
      model: 'gemma:2b',
      prompt: prompt,
      stream: false,
      temperature: 0.7
    }, { timeout: 300000 });

    return res.data.response.trim();
  } catch (err) {
    console.error('Ollama error:', err.message);
    throw new Error('Failed to generate content with Ollama');
  }
}

// ─── CALL GEMINI ───────────────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024
        }
      },
      { timeout: 30000 }
    );

    if (res.data.candidates && res.data.candidates[0]?.content?.parts?.[0]?.text) {
      return res.data.candidates[0].content.parts[0].text.trim();
    }
    throw new Error('No response from Gemini');
  } catch (err) {
    console.error('Gemini error:', err.message);
    throw new Error('Failed to generate content with Gemini');
  }
}

// ─── CALL OPENROUTER ───────────────────────────────────────────────────────
async function callOpenRouter(prompt) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  try {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1024
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost:3002',
          'X-Title': 'Hook Generator'
        },
        timeout: 60000
      }
    );

    if (res.data.choices && res.data.choices[0]?.message?.content) {
      return res.data.choices[0].message.content.trim();
    }
    throw new Error('No response from OpenRouter');
  } catch (err) {
    console.error('OpenRouter error:', err.message);
    throw new Error('Failed to generate content with OpenRouter');
  }
}

// ─── CALL GROQ ──────────────────────────────────────────────────────────────
async function callGroq(prompt) {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key not configured');
  }

  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1024
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    if (res.data.choices && res.data.choices[0]?.message?.content) {
      return res.data.choices[0].message.content.trim();
    }
    throw new Error('No response from Groq');
  } catch (err) {
    console.error('Groq error:', err.message);
    throw new Error('Failed to generate content with Groq');
  }
}

// ─── UNIVERSAL GENERATOR (Ollama, Gemini, OpenRouter, or Groq with Ollama fallback) ────────────────────────────────────────
async function generateContent(prompt, model = 'ollama') {
  try {
    if (model === 'gemini') {
      return await callGemini(prompt);
    } else if (model === 'openrouter') {
      return await callOpenRouter(prompt);
    } else if (model === 'groq') {
      return await callGroq(prompt);
    }
    // Default to Ollama
    return await callOllama(prompt);
  } catch (err) {
    // Fallback to Ollama if API fails
    console.error(`[${model.toUpperCase()}] Generation failed, falling back to Ollama...`);
    try {
      return await callOllama(prompt);
    } catch (ollamaErr) {
      throw new Error(`All models failed. Last error: ${err.message}`);
    }
  }
}

// ─── PARSE NUMBERED LIST ───────────────────────────────────────────────────
function parseNumberedList(text, expectedCount) {
  const lines = text.split('\n').filter(l => l.trim());
  const items = [];

  lines.forEach(line => {
    const match = line.match(/^\d+[\.\)]\s*(.+)/);
    if (match) {
      // Strip markdown bold/italic formatting
      let item = match[1].trim().replace(/\*\*/g, '').replace(/\*/g, '').replace(/^["']|["']$/g, '');
      items.push(item);
    }
  });

  return items.slice(0, expectedCount);
}

// ═════════════════════════════════════════════════════════════════════════════
// ──────────────────────── API ENDPOINTS ─────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/generate-angles - Returns 3 distinct marketing angles
app.post('/api/generate-angles', async (req, res) => {
  try {
    const { productName, productContext, customContext, model = 'ollama' } = req.body;

    if (!productName || !productContext) {
      return res.status(400).json({ error: 'Missing product name or context' });
    }

    const memoryContext = getMemoryContext('angles');
    const customContextSection = customContext ? `\n\nADDITIONAL DIRECTION:\n${customContext}` : '';

    const prompt = `You are generating marketing angles for a supplement product.

An angle is a concept that frames how to sell the product. It can be short and punchy (3 words) or a bit longer if needed (up to 15 words). MIX IT UP - don't make them all the same length.

Examples of GOOD angles (various lengths):
- "No Needles"
- "Skip The Doctor"    
- "Gut Reset"
- "The Energy You're Actually Missing"
- "Clean Energy Without The Crash"
- "What Your Body's Been Asking For"
- "Feel Better"
- "Your Daily Wellness, Simplified"
- "The Science Your Gut Deserves"

RULES:
- Each angle is 3-15 words (variety is good!)
- Mix short punchy angles (3-4 words) with slightly longer descriptive ones (8-15 words)
- Simple, clear, everyday language
- NO brand names, NO competitor mentions
- Focus on what the customer WANTS or what problem they AVOID
- At least one angle should be 3-4 words, and at least one should be 7+ words
- Output ONLY the angle text, do NOT include word counts${memoryContext}
Product: ${productName}
Context: ${productContext}${customContextSection}

Generate EXACTLY 3 UNIQUE angles (numbered list, just the angle text):`;

    const response = await generateContent(prompt, model);
    const angles = parseNumberedList(response, 3);

    if (angles.length < 3) {
      return res.status(400).json({ error: `Only ${angles.length}/3 angles extracted` });
    }

    // Save to session memory
    addToMemory('angles', { product: productName, context: productContext, angles });

    res.json({ angles });
  } catch (err) {
    console.error('[generate-angles ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate-hooks - Returns 5 short hooks for an angle with supporting sentences
app.post('/api/generate-hooks', async (req, res) => {
  try {
    const { productName, productContext, angle, model = 'ollama' } = req.body;

    if (!productName || !productContext || !angle) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const memoryContext = getMemoryContext('hooks');

    const prompt = `You generate punchy hooks for supplement ad images that MUST comply with Meta/Facebook advertising policies.

${META_COMPLIANCE_RULES}

Product: ${productName}
Context: ${productContext}
Angle: "${angle}"

YOUR GENERATION RULES:
- Each hook has TWO parts: MAIN HOOK (8-12 words) + SUPPORTING SENTENCE (10-15 words)
- Main hook goes ON the image as text overlay - must be SHORT and PUNCHY
- Supporting sentence explains/elaborates the hook - provides context
- NO brand names, NO competitor names, NO company mentions
- Bold, attention-grabbing, memorable
- Speaks directly to the customer
- MUST follow all Meta compliance rules above (no specific claims, no body shaming, no miracle language)

FORMAT (CRITICAL):
1. [MAIN HOOK] | [SUPPORTING SENTENCE]
2. [MAIN HOOK] | [SUPPORTING SENTENCE]

Example:
1. Support your wellness journey | A daily supplement designed to complement your healthy lifestyle choices.
2. Your gut deserves better | Formulated with ingredients that support digestive comfort and balance.
3. Designed for your daily routine | Easy to incorporate into your morning or evening wellness ritual.
${memoryContext}
Generate EXACTLY 5 Meta-compliant hooks with supporting sentences (use | separator):`;

    const response = await generateContent(prompt, model);
    const lines = response.split('\n').filter(l => l.trim());
    const hooks = [];

    lines.forEach(line => {
      const match = line.match(/^\d+[\.\)]\s*(.+?)\s*\|\s*(.+)/);
      if (match) {
        hooks.push({
          main: match[1].trim().replace(/\*\*/g, '').replace(/\*/g, '').replace(/^["']|["']$/g, ''),
          supporting: match[2].trim().replace(/\*\*/g, '').replace(/\*/g, '').replace(/^["']|["']$/g, '')
        });
      } else {
        // Fallback: treat as main hook only
        const hookMatch = line.match(/^\d+[\.\)]\s*(.+)/);
        if (hookMatch) {
          hooks.push({
            main: hookMatch[1].trim().replace(/\*\*/g, '').replace(/\*/g, '').replace(/^["']|["']$/g, ''),
            supporting: 'A complement to your wellness journey.'
          });
        }
      }
    });

    const finalHooks = hooks.slice(0, 5);

    if (finalHooks.length < 5) {
      console.log(`[generate-hooks WARNING] Only ${finalHooks.length}/5 hooks extracted`);
    }

    // Save to session memory
    addToMemory('hooks', { product: productName, angle, hooks: finalHooks });

    res.json({ hooks: finalHooks });
  } catch (err) {
    console.error('[generate-hooks ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate-whisk-prompts - Generate 3 prompt styles (surreal, out-of-box, basic)
app.post('/api/generate-whisk-prompts', async (req, res) => {
  try {
    const { angle, hook, productName, productContext, model = 'ollama' } = req.body;

    if (!angle || !hook || !productName || !productContext) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Load competitor context if available
    let competitorContext = '';
    try {
      const analyzedPath = path.join(__dirname, 'data/facebook-ads-analyzed.json');
      if (fs.existsSync(analyzedPath)) {
        const ads = JSON.parse(fs.readFileSync(analyzedPath, 'utf-8'));
        const randomAds = ads.sort(() => Math.random() - 0.5).slice(0, 3);
        competitorContext = 'Competitor context:\n' + randomAds.map(ad => 
          `- ${ad.analysis?.hook || ''} (${ad.company})`
        ).join('\n');
      }
    } catch (e) {
      // Optional context, don't fail
    }

    // SURREAL PROMPT - DREAMLIKE, IMPOSSIBLE, ABSTRACT
    const surrealPrompt = `GENERATE A SURREAL, DREAMLIKE WHISK IMAGE PROMPT THAT EMBODIES THIS MARKETING ANGLE

Marketing Angle: "${angle}"
Hook Message: "${hook}"
Product: ${productName} (${productContext})

YOUR TASK (CRITICAL):
Create a VISUAL METAPHOR that shows/embodies the angle "${angle}" in a SURREAL, IMPOSSIBLE, DREAMLIKE way.
The visual should make people FEEL what the angle means - through impossible physics, transformations, abstract shapes, otherworldly colors.

RULES FOR SURREAL EXECUTION:
- The bottle TRANSFORMS, MORPHS, or becomes part of impossible geometry that REPRESENTS the angle
- Reality is WARPED in ways that SHOW the angle's benefit/concept
- Otherworldly colors, iridescent, holographic - colors that symbolize the angle  
- The hook message is EMBEDDED in the visual metaphor
- Think: Dalí, dreamscapes, impossible physics that MEAN something
- Viewers should feel wonder AND understand the angle intuitively
- NO generic bottle floating in space - make it INTENTIONAL to the angle

EXAMPLE:
If angle is "No Needles" → surreal image could show: needle-like objects DISSOLVING into light, or bottle transforming into a protective barrier, or pills becoming fluid motion away from sharp objects

CREATE SOMETHING THAT VISUALLY COMMUNICATES THE ANGLE "${angle}" IN A SURREAL, METAPHORICAL WAY:
(2-3 sentences, focus on how the impossible elements EXPRESS the angle's benefit)`;

    // OUT-OF-BOX PROMPT - UNEXPECTED, GUERRILLA, UNCONVENTIONAL
    const outOfBoxPrompt = `GENERATE AN UNEXPECTED, OUT-OF-THE-BOX WHISK IMAGE PROMPT THAT DEMONSTRATES THIS MARKETING ANGLE

Marketing Angle: "${angle}"
Hook Message: "${hook}"
Product: ${productName} (${productContext})

YOUR TASK (CRITICAL):
Create a DISRUPTIVE, UNEXPECTED visual that PROVES or DEMONSTRATES the angle "${angle}" in real-world terms.
The visual should make people STOP and THINK differently - using mashups, unexpected contexts, or alternative perspectives.

RULES FOR OUT-OF-BOX EXECUTION:
- The bottle appears in an UNEXPECTED context that PROVES or SHOWS the angle
- Mashups with unrelated objects/contexts that reveal the angle in fresh ways
- Use wrong scale, macro/micro photography, or unexpected POV that makes the angle CLEVER
- The unexpected composition should make people say "I never thought of it that way"
- Hook message LANDS with the unexpected visual
- Think: viral TikTok discoveries, "wait what?" moments that actually mean something
- The weirdness SERVES the angle - not random, intentional messaging

EXAMPLE:
If angle is "Gut Reset" → unexpected image could show: bottle integrated into natural landscape like it's part of an ecosystem, or used as a building material showing foundation strength, or in a place of natural power

CREATE SOMETHING THAT CLEVERLY, UNEXPECTEDLY DEMONSTRATES THE ANGLE "${angle}":
(2-3 sentences, focus on the creative mashup or context that reveals the angle)`;

    // BASIC PROMPT - SOPHISTICATED, CLEAN, PROFESSIONAL
    const basicPrompt = `GENERATE A PROFESSIONAL, PREMIUM WHISK IMAGE PROMPT THAT COMMUNICATES THIS MARKETING ANGLE

Marketing Angle: "${angle}"
Hook Message: "${hook}"
Product: ${productName} (${productContext})

YOUR TASK (CRITICAL):
Create a HIGH-END, PROFESSIONAL visual that COMMUNICATES the angle "${angle}" with premium credibility.
The visual should scream QUALITY, TRUST, and make the angle feel REAL and ACHIEVABLE.

RULES FOR PROFESSIONAL EXECUTION:
- The bottle is the PREMIUM HERO - lit beautifully, clearly visible, desirable
- Color palette, lighting, composition all SUPPORT and ELEVATE the angle's message
- Visual credibility: studio light OR natural healthy aesthetic OR scientific setting - whatever PROVES the angle
- The professional aesthetic makes the angle feel TRUSTWORTHY and SCIENTIFICALLY VALID
- Hook message lands cleanly - the visual supports every word
- Think: premium supplement brands (Rosabella, Lemme, Ora Organics) who own their categories
- High production value - this is what PREMIUM looks like

EXAMPLE:
If angle is "Gut Reset" → professional image could show: bottle surrounded by healthy ingredients at exact angles, golden hour lighting creating premium feel, maybe person being active showing the benefit, clean composition

CREATE SOMETHING THAT COMMUNICATES THE ANGLE "${angle}" WITH PREMIUM, TRUSTWORTHY CREDIBILITY:
(2-3 sentences, focus on the premium aesthetic and visual proof of the angle)`;

    // Call ollama or gemini for all three styles
    const [surrealRes, outOfBoxRes, basicRes] = await Promise.all([
      generateContent(surrealPrompt, model),
      generateContent(outOfBoxPrompt, model),
      generateContent(basicPrompt, model)
    ]);

    res.json({
      surreal: surrealRes.trim(),
      outOfBox: outOfBoxRes.trim(),
      basic: basicRes.trim()
    });
  } catch (err) {
    console.error('[generate-whisk-prompts ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/regenerate-whisk-prompt - Regenerate a single prompt style
app.post('/api/regenerate-whisk-prompt', async (req, res) => {
  try {
    const { style, angle, hook, productName, model = 'ollama' } = req.body;

    if (!style || !angle || !hook || !productName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let styleDesc = '';
    let prompt = '';
    
    if (style === 'surreal') {
      prompt = `REGENERATE A SURREAL, DREAMLIKE WHISK IMAGE THAT EMBODIES THE ANGLE

Angle: "${angle}"
Hook: "${hook}"
Product: ${productName}

TASK: Create a COMPLETELY NEW surreal visual that shows/embodies the angle "${angle}" in impossible, dreamlike ways.
- Different from before, but still serving the same angle
- Use impossible physics or transformations that REPRESENT what the angle means
- Otherworldly colors and dream logic that COMMUNICATE the benefit
- The visual should make people FEEL and UNDERSTAND the angle

CREATE SOMETHING COMPLETELY NEW THAT VISUALLY EMBODIES THE ANGLE "${angle}":
(2-3 sentences, focus on how the impossible elements EXPRESS the angle)`;
    } else if (style === 'out-of-box') {
      prompt = `REGENERATE AN UNEXPECTED, OUT-OF-THE-BOX WHISK IMAGE THAT DEMONSTRATES THE ANGLE

Angle: "${angle}"
Hook: "${hook}"
Product: ${productName}

TASK: Create a COMPLETELY NEW unexpected visual that demonstrates the angle "${angle}" in clever, surprising ways.
- Different context, different mashup, but proving the same angle
- Use unexpected positioning or mashup that reveals the angle in fresh ways
- Make people stop and think "I never thought about it like that"
- The unexpected composition should be INTENTIONAL to the angle's message

CREATE SOMETHING COMPLETELY NEW THAT CLEVERLY DEMONSTRATES THE ANGLE "${angle}":
(2-3 sentences, focus on a creative new mashup or unexpected context that proves the angle)`;
    } else if (style === 'basic') {
      prompt = `REGENERATE A PROFESSIONAL, PREMIUM WHISK IMAGE THAT COMMUNICATES THE ANGLE

Angle: "${angle}"
Hook: "${hook}"
Product: ${productName}

TASK: Create a COMPLETELY NEW professional visual that communicates the angle "${angle}" with premium credibility.
- Different lighting, aesthetic, or context than before, but same premium feel
- Visual should scream TRUSTWORTHY and CREDIBLE while communicating the angle
- High-end composition and color palette that elevates the angle's message
- The professional look should make people BELIEVE in the benefit

CREATE SOMETHING COMPLETELY NEW THAT COMMUNICATES THE ANGLE "${angle}" WITH CREDIBILITY:
(2-3 sentences, focus on the premium aesthetic that proves the angle)`;
    }

    const response = await generateContent(prompt, model);

    res.json({ prompt: response.trim() });
  } catch (err) {
    console.error('[regenerate-whisk-prompt ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analyze-ad - Analyze competitor ad image with vision model
app.post('/api/analyze-ad', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // Read image and convert to base64
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');

    // Delete temp file
    fs.unlinkSync(req.file.path);

    const prompt = `Analyze this supplement/wellness ad image in detail. Extract:

1. MARKETING ANGLE: What's the main concept/frame? (e.g., "No needles", "Natural energy", "Gut reset")
2. HOOK/HEADLINE: The main text/headline on the image
3. COPY STRATEGY: What emotional appeal or pain point is being addressed?
4. VISUAL STRATEGY: Colors, composition, imagery style
5. TARGET AUDIENCE: Who is this ad for?
6. CALL TO ACTION: What action do they want?

Be specific and analytical. Focus on what makes this ad effective.`;

    console.log('[analyze-ad] Calling vision model...');
    
    const visionResponse = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3.2-vision:11b',
      prompt: prompt,
      images: [base64Image],
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 500
      }
    }, { timeout: 300000 });

    const analysis = visionResponse.data.response;
    
    // Store in session memory
    sessionMemory.analyzedAds.push({
      analysis,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 5 analyzed ads
    if (sessionMemory.analyzedAds.length > 5) {
      sessionMemory.analyzedAds.shift();
    }

    console.log('[analyze-ad] Analysis complete');
    res.json({ analysis });
  } catch (err) {
    console.error('[analyze-ad ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate-hooks-from-ad - Generate hooks inspired by analyzed competitor ad
app.post('/api/generate-hooks-from-ad', async (req, res) => {
  try {
    const { productName, productContext, adAnalysis } = req.body;

    if (!productName || !productContext || !adAnalysis) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const prompt = `You generate punchy hooks for supplement ad images that MUST comply with Meta/Facebook advertising policies.

${META_COMPLIANCE_RULES}

Product: ${productName}
Context: ${productContext}

ANALYZED COMPETITOR AD (for strategy inspiration only - DO NOT copy their text):
${adAnalysis}

YOUR TASK:
Generate 5 hooks inspired by the competitor's STRATEGY (not their exact text):
- MAXIMUM 8-12 WORDS per hook (strict limit!)
- Learn from their emotional appeal, angle, and messaging approach
- Adapt their strategy to OUR product: ${productName}
- Make it Meta/Facebook compliant (no specific claims, body shaming, miracles)
- Hooks must be SHORT, PUNCHY image overlay text
- Each hook should capture the same psychological trigger as the competitor

Examples of COMPLIANT hooks (notice they're short!):
- "Support your wellness journey"
- "Your gut deserves better"
- "Designed for your daily routine"
- "One scoop, balanced energy"

Generate EXACTLY 5 Meta-compliant hooks (numbered list):`;

    const response = await callOllama(prompt);
    const hooks = parseNumberedList(response, 5);

    if (hooks.length < 5) {
      console.log(`[generate-hooks-from-ad WARNING] Only ${hooks.length}/5 hooks extracted`);
    }

    // Extract visual theme from analysis for Whisk prompts
    const visualThemeMatch = adAnalysis.match(/VISUAL STRATEGY[:\s]+(.*?)(?=\n\d+\.|TARGET AUDIENCE|$)/is);
    const visualTheme = visualThemeMatch ? visualThemeMatch[1].trim() : 'Clean, professional wellness aesthetic';

    res.json({ hooks, visualTheme });
  } catch (err) {
    console.error('[generate-hooks-from-ad ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate-image-prompt - Creates Whisk image prompt for a hook
app.post('/api/generate-image-prompt', async (req, res) => {
  try {
    const { productName, hook, angle, aspectRatio, visualTheme } = req.body;

    if (!productName || !hook) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // If visualTheme is provided (from ad analysis), use it; otherwise use default insights
    const visualInsights = visualTheme 
      ? `
## VISUAL STRATEGY FROM ANALYZED COMPETITOR AD:

Match this visual theme and style in your generated image:
${visualTheme}

Key guidelines:
- Adopt similar color palette and aesthetic
- Match the mood and composition style
- Keep the same level of professionalism/energy
- Use similar visual elements (people, product focus, environment)
- Maintain Meta/Facebook compliance`
      : `
## VISUAL STRATEGY FROM TOP SUPPLEMENT BRANDS:

**Rosabella's Visual Language:**
- Vibrant, nutrient-rich imagery (greens, oranges, natural colors)
- Healthy, energetic people (not models, relatable)
- Product + ingredient visibility
- Scientific/clinical looking infographics
- Action-oriented (running, working, thriving)

**Lemme's Visual Approach:**
- Playful, colorful, Instagram-aesthetic
- Fun, aspirational but achievable
- Celebrity/influencer style
- Modern, clean design
- Lifestyle + product integration

**Ora Organics' Visual Identity:**
- Clean, minimalist, premium look
- Organic textures (leaves, plants, raw ingredients)
- Earthy color palettes
- Nature-forward, sustainable imagery
- The actual product is the hero

## KEY PRINCIPLE:
The image must feel premium, trustworthy, and support the hook message - not distract from it.
`;

    // Aspect ratio context
    const aspectRatioContext = aspectRatio === '4:5' 
      ? `\n\n**FORMAT: VERTICAL 4:5 RATIO (1080x1350px)**
- Ideal for Instagram/Facebook Feed and Reels
- Vertical format with balanced composition
- Hook text typically at top or bottom third
- Product prominently placed in center
- Ensure composition works in portrait orientation`
      : aspectRatio === '9:16'
      ? `\n\n**FORMAT: TALL VERTICAL 9:16 RATIO (1080x1920px)**
- Optimized for TikTok, Instagram Stories, Facebook Stories
- Very tall vertical format - use full height
- Hook text placement flexible (top, middle, bottom)
- Product should anchor the composition
- Think mobile-first, full-screen experience`
      : '';

    // If "both", generate two prompts
    if (aspectRatio === 'both') {
      const prompt45 = `You are an expert visual designer for supplement advertising who understands Rosabella's vibrant nutrient-rich style, Lemme's playful premium aesthetic, and Ora Organics' clean minimalist approach.

${visualInsights}

**FORMAT: VERTICAL 4:5 RATIO (1080x1350px)**
- Ideal for Instagram/Facebook Feed and Reels
- Vertical format with balanced composition
- Hook text typically at top or bottom third
- Product prominently placed in center
- Ensure composition works in portrait orientation

Product: ${productName}
Angle: "${angle}"

Create a LITERAL image prompt for Google Whisk. Output ONE paragraph only (no headings, no bullet points, no labels).
Requirements:
1. Describe concrete objects, people, setting, lighting, camera angle, and composition
2. Reserve empty space for text overlay but DO NOT include any text, letters, logos, labels, or UI
3. Product is prominent and clearly visible
4. Use the visual strategy above and match the aspect ratio (4:5)
5. Avoid abstract marketing language; be direct and visual

Generate the image prompt NOW (single paragraph, concrete, actionable):`;

      const prompt916 = `You are an expert visual designer for supplement advertising who understands Rosabella's vibrant nutrient-rich style, Lemme's playful premium aesthetic, and Ora Organics' clean minimalist approach.

${visualInsights}

**FORMAT: TALL VERTICAL 9:16 RATIO (1080x1920px)**
- Optimized for TikTok, Instagram Stories, Facebook Stories
- Very tall vertical format - use full height
- Hook text placement flexible (top, middle, bottom)
- Product should anchor the composition
- Think mobile-first, full-screen experience

Product: ${productName}
Angle: "${angle}"

Create a LITERAL image prompt for Google Whisk. Output ONE paragraph only (no headings, no bullet points, no labels).
Requirements:
1. Describe concrete objects, people, setting, lighting, camera angle, and composition
2. Reserve empty space for text overlay but DO NOT include any text, letters, logos, labels, or UI
3. Product is prominent and clearly visible
4. Use the visual strategy above and match the aspect ratio (9:16)
5. Avoid abstract marketing language; be direct and visual

Generate the image prompt NOW (single paragraph, concrete, actionable):`;

      console.log('[generate-image-prompt] Generating BOTH aspect ratios...');
      const [response45, response916] = await Promise.all([
        callOllama(prompt45),
        callOllama(prompt916)
      ]);

      return res.json({
        prompts: [
          { ratio: '4:5', imagePrompt: response45 },
          { ratio: '9:16', imagePrompt: response916 }
        ],
        whiskUrl: 'https://labs.google/fx/tools/whisk/'
      });
    }

    // Single aspect ratio
    const prompt = `You are an expert visual designer for supplement advertising who understands Rosabella's vibrant nutrient-rich style, Lemme's playful premium aesthetic, and Ora Organics' clean minimalist approach.

${visualInsights}${aspectRatioContext}

Product: ${productName}
Angle: "${angle}"

Create a LITERAL image prompt for Google Whisk. Output ONE paragraph only (no headings, no bullet points, no labels).
Requirements:
1. Describe concrete objects, people, setting, lighting, camera angle, and composition
2. Reserve empty space for text overlay but DO NOT include any text, letters, logos, labels, or UI
3. Product is prominent and clearly visible
4. Use the visual strategy above${aspectRatio ? `\n5. Match the ${aspectRatio} aspect ratio` : ''}
5. Avoid abstract marketing language; be direct and visual

Generate the image prompt NOW (single paragraph, concrete, actionable):`;

    const response = await callOllama(prompt);
    
    res.json({ 
      imagePrompt: response,
      aspectRatio: aspectRatio || 'default',
      whiskUrl: 'https://labs.google/fx/tools/whisk/'
    });
  } catch (err) {
    console.error('[generate-image-prompt ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════

// POST /api/regenerate-angle - Regenerate angle with user edits
app.post('/api/regenerate-angle', async (req, res) => {
  try {
    const { productName, productContext, currentAngle, userEdits } = req.body;

    const prompt = `You are refining a marketing angle for a supplement product.

Current angle: "${currentAngle}"

User feedback on what's wrong and what to fix:
"${userEdits}"

Your job:
1. READ the user's feedback carefully - they're telling you WHAT'S WRONG
2. Keep what works, fix what they flagged
3. The angle can be 3-15 words (short and punchy or longer descriptive - whatever fits best)
4. Output ONLY the improved angle text, nothing else

Product: ${productName}
Context: ${productContext}

Generate ONE improved angle based on their feedback:`;

    const response = await callOllama(prompt);
    let angle = response.split('\n').filter(l => l.trim())[0].trim();
    angle = angle.replace(/\*\*/g, '').replace(/^["']|["']$/g, '');
    angle = angle.replace(/^(Reimagined|Improved|New|Updated|Fixed)\s*(Angle|angle)\s*[:]\s*/i, '');
    angle = angle.replace(/^["']|["']$/g, '');

    res.json({ angle });
  } catch (err) {
    console.error('[regenerate-angle ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/regenerate-hook - Regenerate hook with user edits
app.post('/api/regenerate-hook', async (req, res) => {
  try {
    const { productName, angle, currentHook, userEdits } = req.body;

    const prompt = `You are an expert at refining marketing hooks for supplement ads that MUST comply with Meta/Facebook policies.

${META_COMPLIANCE_RULES}

Current hook: "${currentHook}"

User feedback on what's wrong and what to fix:
"${userEdits}"

Your job:
1. READ the user's feedback carefully - they're telling you WHAT'S WRONG
2. Keep what works, fix what they flagged
3. MAXIMUM 8-12 WORDS (strict limit!)
4. The hook must be SHORT, PUNCHY, and fit the angle
5. It goes on an image as text overlay - KEEP IT BRIEF
6. CRITICALLY IMPORTANT: The improved hook MUST follow all Meta compliance rules above
7. Output ONLY the improved hook text, nothing else

Product: ${productName}
Angle: ${angle}

Generate ONE improved SHORT Meta-compliant hook (8-12 words max) based on their feedback:`;

    const response = await callOllama(prompt);
    // Clean up: strip markdown, quotes, labels like "Improved hook:" etc.
    let hook = response.split('\n').filter(l => l.trim())[0].trim();
    hook = hook.replace(/\*\*/g, '').replace(/^["']|["']$/g, '');
    hook = hook.replace(/^(Reimagined|Improved|New|Updated|Fixed)\s*(Hook|hook)\s*[:]\s*/i, '');
    hook = hook.replace(/^["']|["']$/g, '');

    res.json({ hook });
  } catch (err) {
    console.error('[regenerate-hook ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/regenerate-image-prompt - Regenerate image prompt with user edits
app.post('/api/regenerate-image-prompt', async (req, res) => {
  try {
    const { currentPrompt, userEdits, hook } = req.body;

    const prompt = `You are an expert at creating literal, concrete image prompts for Google Whisk.

Current prompt: "${currentPrompt}"

User feedback/edits: "${userEdits}"

Your job: Regenerate the image prompt that:
1. Addresses the user's feedback
2. Is a single-paragraph, literal visual description
3. Describes concrete objects, setting, lighting, and composition
4. Reserves empty space for text overlay but includes NO text, letters, logos, labels, or UI
5. Avoids abstract marketing language

Generate the improved image prompt NOW (single paragraph, concrete, actionable):`;

    const response = await callOllama(prompt);

    res.json({ 
      imagePrompt: response,
      whiskUrl: 'https://labs.google/fx/tools/whisk/'
    });
  } catch (err) {
    console.error('[regenerate-image-prompt ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/competitor-news - Surface competitor insights for the UI
app.get('/api/competitor-news', (req, res) => {
  const competitorsPath = path.join(__dirname, 'data', 'competitors.json');
  const logsPath = path.join(__dirname, 'data', 'scraper-logs.json');

  const safeReadJson = (filePath, fallback) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  };

  const competitorData = safeReadJson(competitorsPath, {});
  const scraperLogs = safeReadJson(logsPath, {});

  const competitorGroups = competitorData.competitors || {};
  const companies = [];

  Object.values(competitorGroups).forEach(group => {
    Object.values(group || {}).forEach(company => {
      companies.push(company);
    });
  });

  const uniqueList = items => {
    const seen = new Set();
    return items.filter(item => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  };

  const popularAngles = uniqueList(companies.map(c => c.positioning).filter(Boolean)).slice(0, 8);
  const popularHooks = (competitorData.marketing_insights?.top_hooks || []).slice(0, 10);
  const popularThemes = (competitorData.marketing_insights?.visual_themes || []).slice(0, 10);
  const compliancePatterns = (competitorData.marketing_insights?.compliance_patterns || []).slice(0, 10);

  // Create mappings: hook/angle -> companies using it
  const hookMapping = {};
  const angleMapping = {};
  const complianceMapping = {};
  
  companies.forEach(company => {
    // Map ads_observed to hooks (support both string and object format)
    (company.ads_observed || []).forEach(ad => {
      const hook = typeof ad === 'string' ? ad : ad.hook;
      const ad_url = typeof ad === 'object' ? ad.ad_url : null;
      
      if (!hookMapping[hook]) hookMapping[hook] = [];
      hookMapping[hook].push({
        name: company.name,
        category: company.category,
        positioning: company.positioning,
        ad_url: ad_url
      });
    });
    
    // Map positioning to angles
    if (company.positioning) {
      if (!angleMapping[company.positioning]) angleMapping[company.positioning] = [];
      const firstAd = (company.ads_observed || []).find(ad => typeof ad === 'object' && ad.ad_url);
      angleMapping[company.positioning].push({
        name: company.name,
        category: company.category,
        ad_url: firstAd ? firstAd.ad_url : null
      });
    }
    
    // Map compliance patterns (from compliance_angle)
    if (company.compliance_angle) {
      if (!complianceMapping[company.compliance_angle]) complianceMapping[company.compliance_angle] = [];
      complianceMapping[company.compliance_angle].push({
        name: company.name,
        category: company.category
      });
    }
  });

  const adPhrases = companies.flatMap(c => (c.ads_observed || []).map(ad => 
    typeof ad === 'string' ? ad : ad.hook
  ));
  const phraseCounts = adPhrases.reduce((acc, phrase) => {
    if (!phrase) return acc;
    acc[phrase] = (acc[phrase] || 0) + 1;
    return acc;
  }, {});

  const trendingAds = Object.entries(phraseCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  const adLinks = companies.map(company => ({
    name: company.name,
    links: company.ad_links || []
  }));

  // Load real extracted ad links from direct scraping
  let realAdLinks = [];
  let analyzedAds = [];
  let uniqueHooks = new Set();
  let uniqueAngles = new Set();
  let uniqueTrendingPhrases = new Set();
  let allNewHooks = [];
  
  try {
    const directLinksPath = path.join(__dirname, 'data/facebook-ads-direct-links.json');
    if (fs.existsSync(directLinksPath)) {
      const directLinksData = JSON.parse(fs.readFileSync(directLinksPath, 'utf-8'));
      Object.values(directLinksData).forEach(category => {
        category.forEach(company => {
          realAdLinks.push({
            name: company.name,
            ads: company.ads || [],
            adCount: company.adCount,
            type: 'real_extracted'
          });
        });
      });
    }
  } catch (err) {
    console.log('[competitor-news] No extracted ads available yet');
  }

  // Load analyzed ads with ollama data
  try {
    const analyzedPath = path.join(__dirname, 'data/facebook-ads-analyzed.json');
    if (fs.existsSync(analyzedPath)) {
      analyzedAds = JSON.parse(fs.readFileSync(analyzedPath, 'utf-8'));
      
      // Extract unique hooks, angles, and trending phrases from ollama analysis
      analyzedAds.forEach(ad => {
        if (ad.analysis) {
          if (ad.analysis.hook) {
            uniqueHooks.add(ad.analysis.hook);
            allNewHooks.push(ad.analysis.hook);
          }
          if (ad.analysis.angle) {
            uniqueAngles.add(ad.analysis.angle);
          }
          if (ad.analysis.trending_phrase) {
            uniqueTrendingPhrases.add(ad.analysis.trending_phrase);
          }
        }
      });
    }
  } catch (err) {
    console.log('[competitor-news] No analyzed ads available yet');
  }

  const linksAvailable = adLinks.some(company => company.links.length > 0) || realAdLinks.length > 0;

  // Calculate week-over-week statistics from analyzed ads
  const weekOverWeek = {
    hooksCount: uniqueHooks.size,
    hooksGrowth: Math.min(Math.floor(uniqueHooks.size * 0.12), uniqueHooks.size), // Simulated 12% growth indicator
    anglesCount: uniqueAngles.size,
    anglesGrowth: Math.min(Math.floor(uniqueAngles.size * 0.15), uniqueAngles.size), // Simulated 15% growth
    newHooksFound: uniqueHooks.size > 10 ? uniqueHooks.size : 'Ongoing',
    analyzedAdsCount: analyzedAds.length,
    trendingPhrasesCount: uniqueTrendingPhrases.size
  };

  const scraperRuns = (scraperLogs.runs || []).slice(-10).reverse().map(run => {
    const date = new Date(run.timestamp);
    const formattedTime = date.toLocaleString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true
    });
    
    return {
      timestamp: run.timestamp,
      formattedTime,
      updatesFound: run.updates_found || 0,
      success: run.success || false,
      duration: run.duration || 0,
      errors: run.errors || []
    };
  });

  res.json({
    lastUpdated: competitorData.lastUpdated || null,
    companyCount: companies.length,
    weekOverWeek,
    popularAngles,
    popularHooks,
    popularThemes,
    compliancePatterns,
    trendingAds,
    adLinks,
    realAdLinks,
    linksAvailable,
    scraperRuns,
    sources: competitorData.scraper_metadata?.sources || [],
    scrapeCount: competitorData.scraper_metadata?.scrape_count || 0,
    hookMapping,
    angleMapping,
    complianceMapping
  });
});

// POST /api/analyze-ads-ollama - Trigger LLM analysis of extracted ads via ollama
app.post('/api/analyze-ads-ollama', async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const analyzerPath = path.join(__dirname, 'scraper', 'ollama-ad-analyzer.js');

    res.json({ 
      status: 'analysis_started',
      message: 'Started LLM analysis of extracted ads via ollama',
      nextCheckIn: 'Check /api/analyzed-ads endpoint in 30-60 seconds'
    });

    // Run analyzer in background
    const analyzer = spawn('node', [analyzerPath], {
      detached: true,
      stdio: 'ignore'
    });
    analyzer.unref();
  } catch (err) {
    res.status(500).json({ error: 'Failed to start analyzer', details: err.message });
  }
});

// GET /api/analyzed-ads - Retrieve LLM-analyzed ad insights
app.get('/api/analyzed-ads', (req, res) => {
  try {
    const analyzedPath = path.join(__dirname, 'data', 'facebook-ads-analyzed.json');
    
    if (!fs.existsSync(analyzedPath)) {
      return res.json({ 
        analyzed: null, 
        message: 'No analyzed data yet. Run /api/analyze-ads-ollama first.',
        available: false
      });
    }

    const analyzed = JSON.parse(fs.readFileSync(analyzedPath, 'utf8'));
    
    res.json({ 
      analyzed: analyzed,
      available: true,
      analyzedAt: Object.values(analyzed)[0]?.analyzedAt,
      totalCompanies: Object.keys(analyzed).length,
      totalAds: Object.values(analyzed).reduce((sum, company) => sum + (company.ads?.length || 0), 0)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load analyzed ads', details: err.message });
  }
});

// GET /api/scraper-status - Returns current competitor intelligence status
app.get('/api/scraper-status', (req, res) => {
  const status = scraper.getScraperStatus();
  res.json(status);
});

// GET /api/competitor-news - Returns summarized competitor intelligence
app.get('/api/competitor-news', (req, res) => {
  try {
    res.json(buildCompetitorNews());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/trigger-scraper - Manually trigger competitor scraper
app.post('/api/trigger-scraper', async (req, res) => {
  try {
    const result = await scraper.scrapeCompetitors();
    res.json({
      message: 'Scraper executed',
      ...result,
      status: scraper.getScraperStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/competitor-history/:period - Get historical data by period (day|week|month|year)
app.get('/api/competitor-history/:period', (req, res) => {
  try {
    const { period } = req.params;
    const { date } = req.query;
    
    const validPeriods = ['day', 'week', 'month', 'year'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Use: day, week, month, or year' });
    }
    
    const data = scraper.getHistoricalData(period, date);
    
    if (!data) {
      return res.json({
        period,
        message: 'No historical data available for this period yet',
        data: null
      });
    }
    
    res.json({
      period,
      requestedDate: date || new Date().toISOString().slice(0, 10),
      data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/competitor-trends - Get trend comparison
app.get('/api/competitor-trends', (req, res) => {
  try {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    
    const currentWeek = scraper.getHistoricalData('week', today);
    const lastWeek = scraper.getHistoricalData('week', weekAgo);
    
    const trends = {
      current_period: currentWeek,
      previous_period: lastWeek,
      changes: {}
    };
    
    if (currentWeek && lastWeek) {
      trends.changes = {
        hooks_delta: currentWeek.total_hooks - lastWeek.total_hooks,
        angles_delta: currentWeek.total_angles - lastWeek.total_angles,
        new_hooks: currentWeek.unique_hooks.filter(h => !lastWeek.unique_hooks.includes(h)),
        new_angles: currentWeek.unique_angles.filter(a => !lastWeek.unique_angles.includes(a))
      };
    }
    
    res.json(trends);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ─ AUTOMATIC HOURLY COMPETITOR SCRAPER (Option 3 - Automated)
// ═════════════════════════════════════════════════════════════════════════════
// Runs every hour at minute 0 - no intervention needed
cron.schedule('0 * * * *', async () => {
  console.log('[SCHEDULER] Running hourly competitor intelligence update...');
  try {
    const result = await scraper.scrapeCompetitors();
    console.log(`[SCHEDULER] ✓ Update complete: ${result.updates_found} changes found`);
  } catch (error) {
    console.error('[SCHEDULER] ✗ Error:', error.message);
  }
});

// Optional: Run a scrape on server startup to ensure fresh data
(async () => {
  console.log('[STARTUP] Performing initial competitor intelligence sync...');
  await scraper.scrapeCompetitors();
})();

// ═════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`\n✓ Hook Generator → http://localhost:${PORT}`);
  console.log(`✓ Competitor Scraper → Running (every hour)\n`);
});
