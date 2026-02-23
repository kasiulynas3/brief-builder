// Meta Advertising Compliance Rules for Health/Supplement Products
// Based on Meta Business Help Center policies for health products and weight loss ads

const META_COMPLIANCE_RULES = `
## ❌ STRICTLY PROHIBITED (META WILL REJECT):

**Before/After & Body Images:**
- NO before/after images or transformations
- NO images depicting "ideal" or "perfect" body types
- NO close-ups of body parts (abs, thighs, etc.)
- NO body-shaming or negative self-image messaging

**Specific Claims & Numbers:**
- NO specific weight loss amounts ("lose 10 pounds", "drop 3 sizes")
- NO specific timeframes ("in 2 weeks", "30 days to flat stomach")
- NO miracle cure language ("melts fat", "magic pill", "overnight results")
- NO exaggerated efficacy ("100% guaranteed", "works for everyone")

**Medical & Health Claims:**
- NO disease cure claims ("cures diabetes", "eliminates cancer")
- NO FDA approval claims (unless actually FDA-approved as drug)
- NO diagnostic claims ("find out if you have...")
- NO drug comparison claims unless product is FDA-approved drug

**Targeting & Personal Attributes:**
- NO personal health attribute targeting in copy ("Are you overweight?", "Diabetic?")
- NO body shaming ("tired of being fat?", "embarrassed by your belly?")
- NO assumptions about viewer's health status

**Sensational Language:**
- NO "shocking", "miracle", "secret doctors don't want you to know"
- NO urgency manipulation ("last chance", "limited spots")
- NO fear-mongering about health consequences

**Age Restrictions:**
- Weight loss products: Must target 18+
- Supplements: Check if 18+ or 21+ required

## ✅ WHAT'S ALLOWED:

**General Wellness Language:**
- "Support healthy weight management"
- "May help support metabolism" (with disclaimers)
- "Formulated to support overall wellness"
- "Designed to complement a healthy lifestyle"

**Lifestyle Messaging:**
- "Feel your best"
- "Support your wellness journey"
- "Crafted for active lifestyles"
- "Your daily wellness companion"

**Science & Credentials:**
- "Clinically studied ingredients" (if true)
- "Doctor-formulated" (if true)
- "Backed by research" (if you have studies)
- "Third-party tested"

**Soft Benefits:**
- "May support energy levels"
- "Designed to support gut health"
- "Formulated to support your goals"
- "Complements healthy diet and exercise"

## 📋 REQUIRED DISCLAIMERS:

- "These statements have not been evaluated by the FDA"
- "This product is not intended to diagnose, treat, cure, or prevent any disease"
- "Results may vary"
- "Consult your healthcare provider before use"

## 🎯 BEST PRACTICES FOR APPROVAL:

1. Focus on SUPPORT and WELLNESS, not weight loss
2. Show product in lifestyle context, not body transformations
3. Use aspirational but realistic messaging
4. Include proper disclaimers
5. Target broadly (18+), not health conditions
6. Emphasize ingredients, research, quality over results
`;

const COMPLIANCE_FILTER_WORDS = {
  // Words that need context or should be avoided
  prohibited: [
    'cure', 'cures', 'curing',
    'lose weight', 'weight loss', 'fat loss',
    'miracle', 'magic',
    'guaranteed', '100%',
    'fda approved', 'fda-approved',
    'before and after', 'transformation',
    'shocking', 'secret',
    'doctors hate', 'big pharma',
    'overnight', 'instant',
    'melts fat', 'burns fat',
    'flat belly', 'six pack',
    'obese', 'overweight', 'fat'
  ],
  
  // Safe alternatives
  safe: [
    'support', 'may help', 'designed to',
    'formulated for', 'crafted to',
    'complements', 'supports',
    'wellness', 'balance', 'vitality',
    'energy', 'metabolism', 'gut health',
    'daily routine', 'lifestyle',
    'natural', 'plant-based', 'science-backed'
  ]
};

module.exports = { META_COMPLIANCE_RULES, COMPLIANCE_FILTER_WORDS };
