require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3002;

const OLLAMA_API = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'gemma:2b';

// ─── OLLAMA HELPER ──────────────────────────────────────────────────────────
async function callGroq(prompt) {
  try {
    const res = await axios.post(OLLAMA_API, {
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      temperature: 0.6
    }, { timeout: 300000 });
    return res.data.response;
  } catch (e) {
    throw new Error(`Ollama API error: ${e.message}`);
  }
}

// ─── SAFE JSON PARSER ────────────────────────────────────────────────────────
function extractJSON(text) {
  if (!text) throw new Error('Empty response');
  
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Noop, continue to extraction
  }
  
  // Clean up the text
  let cleaned = text
    .replace(/[\n\r]+/g, ' ')
    .replace(/\t/g, ' ');
  
  // Find first opening bracket  
  const idxArr = cleaned.indexOf('[');
  const idxObj = cleaned.indexOf('{');
  let startIdx = -1;
  
  if (idxArr !== -1 && (idxObj === -1 || idxArr < idxObj)) {
    startIdx = idxArr;
  } else if (idxObj !== -1) {
    startIdx = idxObj;
  }
  
  if (startIdx === -1) {
    throw new Error('No JSON start bracket found');
  }
  
  // Find matching closing bracket
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '[' || char === '{') depth++;
    if (char === ']' || char === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  
  if (endIdx === -1) {
    throw new Error('No matching closing bracket found');
  }
  
  let json = cleaned.substring(startIdx, endIdx + 1);
  json = json.trim();
  
  // Step 1: Fix common Ollama issues
  json = json.replace(/,\s*([}\]])/g, '$1');                    // Remove trailing commas
  json = json.replace(/:\s*undefined/gi, ': null');             // Fix undefined values
  
  // Step 2: Handle unquoted string values more intelligently
  // Match pattern: "key": VALUE where VALUE is not quoted and not a number/boolean
  json = json.replace(/:\s*(?!["'{[]|true|false|null|-?\d)([^,}]*?)([,}])/g, ': "$1"$2');
  
  // Step 3: Fix quoted keys with special characters
  json = json.replace(/([{,]\s*)'([^']*)'(\s*:)/g, '$1"$2"$3');     // Single quoted keys to double
  json = json.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3'); // Unquoted keys to double quoted
  
  // Step 4: Final cleanup
  json = json.replace(/:\s*'([^']*)'/g, ': "$1"');                 // Single quoted values to double
  
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error('[JSON Parse Error]', e.message);
    console.error('[Input (first 150 chars)]:', text.substring(0, 150));
    console.error('[Cleaned (first 150 chars)]:', json.substring(0, 150));
    throw e;
  }
}

// ─── STRICT COMPLIANCE VALIDATION ────────────────────────────────────────────
const BANNED_TERMS = [
  // Weight/Body claims
  /\blose\s+(weight|lbs|pounds|fat|belly)/gi,
  /\bloser\b/gi,
  /\bburns?\s+(fat|calories|weight)/gi,
  /\bslim/gi,
  /\bskinny\b/gi,
  /\bfat\b/gi,
  /\bmelt/gi,
  /\bblast/gi,
  /\bchub/gi,
  /\bachieves?\s+flat\s+abs/gi,
  /\btransform\s+(body|yourself|figure)/gi,
  /\bbefore\s+and\s+after/gi,
  
  // Medical/Health claims
  /\bcures?\b/gi,
  /\bheals?\b/gi,
  /\btreats?\b/gi,
  /\bdiagnose/gi,
  /\bmedication\b/gi,
  /\bprescription\b/gi,
  /\bprevents?\b/gi,
  /\bcondition\b/gi,
  /\bdisease\b/gi,
  /\bsymptoms?\b/gi,
  /\btherapy\b/gi,
  /\bclinically\s+proven/gi,
  /\bscientific\s+breakthrough/gi,
  
  // Guaranteed results
  /\bguarantee[ds]?\b/gi,
  /\b100%\s+result/gi,
  /\bproven\s+to\b/gi,
  /\bwill\s+(make|transform|change)/gi,
  /\bsure\s+to\b/gi,
  /\babsolutely\s+will/gi,
  /\bneeds?\s+to\b/gi,
  /\bmust\b/gi,
  
  // Scarcity/Urgency
  /\blimited\s+time/gi,
  /\bonly\s+\d+\s+(left|available)/gi,
  /\bact\s+now\b/gi,
  /\brush\b/gi,
  /\bbefore\s+it's\s+too\s+late/gi,
  /\bdon't\s+wait\b/gi,
  /\burge/gi,
  /\bessential\s+you\b/gi,
  
  // Hype words
  /\brevolutionary\b/gi,
  /\bgame[- ]?changing/gi,
  /\blife[- ]?changing/gi,
  /\bbreakthrough/gi,
  /\bmagic\b/gi,
  /\bmiracle/gi,
  /\bamazing(\s+results)?/gi,
  /\bamazing\b/gi,
  /\bincredible\b/gi,
  /\bawesome\b/gi,
  /\bsecret/gi,
  /\bhidden\s+trick/gi,
  /\btelevision/gi,
  
  // Body shaming
  /\bug(ly)?\b/gi,
  /\bunattractive/gi,
  /\bundesirable\b/gi,
  /\bshameful/gi,
  /\bembarrass(ing|ed)/gi,
  /\bfail(ed|ing)?\b/gi,
  /\bhealth\s+crisis/gi,
  /\bfear\s+of\b/gi,
  /\bdesperately\b/gi,
  /\bdesperate/gi,
  /\bworthless\b/gi,
  /\bincompetent\b/gi,
  
  // Testimonials (implicit)
  /\bclient\s+said/gi,
  /\bcustomer\s+reviews?\b/gi,
  /\buser\s+results/gi,
  /\bsuccess\s+stories?/gi,
];

function validateCompliance(text) {
  if (!text) return false;
  
  for (const pattern of BANNED_TERMS) {
    if (pattern.test(text)) {
      return false;
    }
  }
  
  return true;
}

// ─── FIX COMPLIANCE BY REPLACING BANNED TERMS ────────────────────────────────
function fixCompliance(text) {
  if (!text) return '';
  
  const replacements = [
    // CRITICAL: Meta heavily bans before/after language
    [/\b(before|after)\b/gi, 'journey'],
    [/\breals?\s+(results?|success)/gi, 'your experience'],
    [/\b(lose|shed|drop)\s+(weight|lbs|pounds|fat|belly|20\s+pounds|10%)\b/gi, 'weight management'],
    [/\bweight\s+(loss|reduction|gone)/gi, 'weight management'],
    [/\bloser\b/gi, 'person'],
    [/\bburns?\s+(fat|calories|weight)/gi, 'supports energy'],
    [/\bslim(ming)?\b/gi, 'body composition'],
    [/\bskinny\b/gi, 'lean'],
    [/\bfat\s+loss/gi, 'body recomposition'],
    [/\bmelt(ing)?\s+(away|fat)/gi, 'supports wellness'],
    [/\bblast(ing)?\s+fat/gi, 'supports'],
    [/\btransform(ing|ed)?\s+(body|shape|yourself|figure)/gi, 'support your wellness'],
    [/\bdramatic\s+(change|transformation|results?)/gi, 'positive experience'],
    [/\bincredible\s+(change|results?|transformation)/gi, 'noticeable changes'],
    [/\b(cures?|curing)\b/gi, 'supports'],
    [/\b(heals?|healing)\b/gi, 'promotes'],
    [/\b(treats?|treating)\b/gi, 'addresses'],
    [/\bdiagnose[sd]?/gi, 'assess'],
    [/\bmedication\b/gi, 'support'],
    [/\bprescription/gi, 'wellness'],
    [/\bprevents?\s+disease/gi, 'supports wellness'],
    [/\bguarantee[ds]?\b/gi, 'helps support'],
    [/\b100%\s+(results?|effective)/gi, 'significant support'],
    [/\bproven\s+(to|results?)/gi, 'designed to help'],
    [/\bwill\s+(make|transform|change|get|give.*results?)/gi, 'may help'],
    [/\blimited\s+(time|offer|availability)/gi, 'available'],
    [/\b(act|shop)\s+now\b/gi, 'learn more'],
    [/\brush(ing)?\b/gi, 'take action'],
    [/\brevolutionary\b/gi, 'modern'],
    [/\bgame[- ]?changing/gi, 'beneficial'],
    [/\blife[- ]?changing/gi, 'wellness-focused'],
    [/\bbreakthrough/gi, 'advancement'],
    [/\bmagic(al)?\b/gi, 'effective'],
    [/\bmiracle/gi, 'positive'],
    [/\bamazing\b/gi, 'great'],
    [/\bincredible\b/gi, 'significant'],
    [/\bsecret\b/gi, 'key'],
    [/\b(success\s+story|testimony|testimonial)/gi, 'user experience'],
    [/\bsee\s+results?\s+in/gi, 'support begins'],
    [/\b(shed|get\s+rid\s+of)\s+(fat|weight)/gi, 'weight management'],
    [/\bfigure\s+out\b/gi, 'discover'],
  ];
  
  let fixed = text;
  for (const [pattern, replacement] of replacements) {
    fixed = fixed.replace(pattern, replacement);
  }
  
  // Additional cleanup: remove overly hype language
  fixed = fixed.replace(/\b(just|only|simply|simply)\s+(lose|manage|control)/gi, 'help manage');
  
  return fixed.trim();
}

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ─── GENERATE 3 ANGLES ──────────────────────────────────────────────────────
app.post('/api/generate-angles', async (req, res) => {
  const { productName, productContext } = req.body;
  
  try {
    const prompt = `Product: ${productName}
Context: ${productContext}

Generate 3 distinct marketing angles (unique audience focus for this product).
AVOID: before/after, weight loss claims, medical language, guarantees, hype words.
FOCUS: benefits (energy, wellness, confidence), audience goals, lifestyle appeal.
Output as numbered list:
1. Angle
2. Angle
3. Angle`;

    const raw = await callGroq(prompt);
    console.log('[Angles] Raw response:', raw.substring(0, 400));
    
    // Parse numbered list
    const lines = raw.split('\n').filter(l => l.trim());
    const angles = lines
      .filter(line => /^\d+\./.test(line.trim()))
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(a => a.length > 3 && a.length < 100)
      .slice(0, 3)
      .map(a => fixCompliance(a));
    
    if (angles.length < 3) {
      throw new Error(`Only ${angles.length} angles extracted`);
    }
    
    res.json({ angles });
  } catch (e) {
    console.error('[generate-angles ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GENERATE HOOKS FOR ANGLE ────────────────────────────────────────────────
app.post('/api/generate-hooks', async (req, res) => {
  const { angle, productName } = req.body;
  
  try {
    const prompt = `Generate 5 conversational ad hooks for "${productName}" (targeting: "${angle}").
Max 15 words each. Conversational, relatable tone.
AVOID: weight loss, before/after, medical claims, "results", guarantees, hype.
FOCUS: relatable, curiosity, lifestyle fit, real situations.
Output as numbered list:
1. Hook
2. Hook
3. Hook
4. Hook
5. Hook`;

    const raw = await callGroq(prompt);
    console.log('[Hooks] Raw response:', raw.substring(0, 400));
    
    // Parse numbered list
    const lines = raw.split('\n').filter(l => l.trim());
    const hooks = lines
      .filter(line => /^\d+\./.test(line.trim()))
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(h => h.length > 5 && h.length < 100)
      .slice(0, 5)
      .map(h => fixCompliance(h));
    
    if (hooks.length < 5) {
      throw new Error(`Only ${hooks.length}/5 hooks extracted`);
    }
    
    res.json({ hooks });
  } catch (e) {
    console.error('[generate-hooks ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GENERATE BENEFIT TEXT ──────────────────────────────────────────────────
app.post('/api/generate-benefit', async (req, res) => {
  const { hook, angle, productName, productContext } = req.body;
  
  try {
    const prompt = `Write 2-3 sentences about consumer benefit:
Product: ${productName}
Hook: ${hook}
Angle: ${angle}
Context: ${productContext}

RULES:
- Conversational, relatable tone
- AVOID: weight loss, before/after, medical claims, "results", "proven", guarantees, hype
- FOCUS: how it fits lifestyle, what it supports, why they'd care
- Benefit, NOT transformation
- Real, human language (not marketing speak)`;

    const raw = await callGroq(prompt);
    console.log('[Benefit] Raw response:', raw.substring(0, 400));
    
    const benefit = fixCompliance(raw.trim());
    if (benefit.length < 20) {
      return res.status(400).json({ error: 'Benefit text too short' });
    }
    
    res.json({ benefit });
  } catch (e) {
    console.error('[generate-benefit ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GENERATE IMAGE PROMPT FOR WHISK ────────────────────────────────────────
app.post('/api/generate-image', async (req, res) => {
  const { hook, benefit, angle, productName } = req.body;
  
  try {
    const prompt = `Create a detailed, specific Whisk AI image prompt (3-4 sentences) for a social media ad:
Product: ${productName}
Hook: ${hook}
Benefit: ${angle}

WHISK PROMPT GUIDELINES:
- Start with composition: "A professional product photo showing..."
- PRODUCT: Centered, well-lit, packaging clearly visible and readable
- PEOPLE: Real, diverse, happy/confident expressions, actively using/holding product
- SETTING: Modern, clean, lifestyle context (kitchen, office, home, morning routine)
- COLORS: Vibrant, warm, inviting professional tones
- LIGHTING: Bright, natural-looking, professional product photography style
- STYLE: Instagram/Facebook quality, polished, modern aesthetic
- AVOID: Before/after imagery, clinical settings, dramatic transformations
- BE SPECIFIC: "woman in white linen holding purple bottle on white marble counter" not generic descriptions

Create one detailed, concrete Whisk prompt that generates compelling product-focused lifestyle imagery.`;

    const raw = await callGroq(prompt);
    console.log('[Image] Raw response:', raw.substring(0, 400));
    
    const imageDescription = raw.trim();
    if (imageDescription.length < 50) {
      return res.status(400).json({ error: 'Image prompt too short' });
    }
    
    res.json({ imageDescription });
  } catch (e) {
    console.error('[generate-image ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── START SERVER ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✓ Ad Brief Builder → http://localhost:${PORT}\n`);
});
