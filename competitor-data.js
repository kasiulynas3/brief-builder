// COMPETITOR INTELLIGENCE DATABASE
// Extracted from market leaders in supplement marketing

const COMPETITOR_DATA = {
  rosabella: {
    brand: "Rosabella",
    mainAngle: "You're not tired, inflamed, or foggy - you're undernourished",
    key_understanding: "Reframe problems as nutrient deficiencies rather than personal failures",
    productLines: {
      moringa: {
        key_claim: "92+ nutrients, most nutrient-dense plant",
        angle: "Whole-body nutrition in one product",
        benefits: ["energy", "digestion", "immunity", "skin & hair"]
      },
      beetroot: {
        key_claim: "Circulation and blood flow support",
        angle: "Clinical backing + natural ingredient",
        benefits: ["heart health", "blood pressure", "stamina"]
      },
      electrolytes: {
        key_claim: "Clean energy without the crash",
        angle: "Rapid hydration + sustainable energy",
        benefits: ["all-day energy", "stamina", "recovery"]
      }
    },
    marketingHooks: [
      "You're not tired, you're undernourished",
      "500,000+ customers trust Rosabella over generic supplements",
      "92% reported improved digestion within 15 days",
      "89% experienced higher energy and better stamina",
      "Clean, caffeine-free energy powered by nature",
      "60-day money-back guarantee",
      "Targets fatigue, bloating, joint pain, and skin in one stack"
    ],
    tone: "Problem-first. Solution-oriented. Data-backed.",
    socialProof: "500k+ customers, 4.8 stars, 100k+ reviews",
    targetAudience: "Health-conscious individuals tired of generic supplements, seeking whole-body nutrition"
  },

  lemme: {
    brand: "Lemme",
    positioning: "Wellness that's fun, accessible, and celebrity-backed",
    key_understanding: "Make wellness feel aspirational and achievable for younger audiences",
    productLines: {
      adaptogens: {
        angle: "Stress management through modern science",
        focus: "Accessible wellness, social media friendly"
      },
      functional_beverages: {
        angle: "Tasty wellness drinks that actually work",
        focus: "Fun, colorful, shareable aesthetics"
      }
    },
    marketingHooks: [
      "Wellness for people who actually want to enjoy it",
      "Celebrity-approved, scientifically-backed",
      "Adaptogens that don't taste like you're being healthy",
      "Functional beverages that are Instagram-worthy"
    ],
    tone: "Playful. Aspirational. Gen-Z friendly.",
    targetAudience: "Young professionals, Gen-Z, social media users, wellness enthusiasts who value aesthetics"
  },

  pendulum: {
    brand: "Pendulum",
    positioning: "Science-backed, doctor-formulated probiotics with clinical efficacy",
    key_understanding: "Medical-grade positioning with proof of clinical results (A1C improvement, peer-reviewed research)",
    productLines: {
      metabolic_daily: {
        key_claim: "4-in-1 probiotic with 5 strains for metabolism, mood, energy",
        angle: "Doctor-formulated microbiome transformation",
        benefits: ["digestive health", "metabolism", "mood", "energy"]
      },
      akkermansia: {
        key_claim: "Live Akkermansia (keystone strain in 3000+ publications)",
        angle: "Gut lining support + immune function",
        benefits: ["leaky gut", "gut permeability", "immune strength"]
      },
      glucose_control: {
        key_claim: "Only medical probiotic clinically shown to lower A1C in type 2 diabetes",
        angle: "Clinical efficacy + FDA positioning",
        benefits: ["blood glucose", "A1C reduction", "diabetes management"]
      }
    },
    marketingHooks: [
      "Founded by PhD doctors from Johns Hopkins, Harvard, Berkeley, Stanford",
      "The only probiotic clinically shown to improve A1C",
      "Live strains you can't get anywhere else",
      "Transform your gut microbiome with science",
      "Trusted by doctors and longevity experts",
      "Cutting-edge research + revolutionary manufacturing",
      "Mayo Clinic research partner"
    ],
    tone: "Scientific. Credible. Results-driven. Medical professional.",
    socialProof: "Doctor-backed, Mayo Clinic partnership, clinical trial results",
    targetAudience: "Health-conscious professionals, people with specific health conditions (diabetes, digestive issues), those who value clinical proof"
  }
};

// SUCCESSFUL MARKETING PATTERNS FROM COMPETITORS
const MARKETING_PATTERNS = {
  reframing: [
    "You're not X, you're experiencing Y (nutrient deficiency)",
    "Your problem isn't what you think - it's actually [root cause]",
    "Everyone feels this way because they're missing [key nutrient]"
  ],

  social_proof: [
    "X,XXX+ customers already switched",
    "Rated X stars from over X,XXX reviews",
    "The #1 chosen supplement by [demographic]"
  ],

  benefit_stacking: [
    "One product targets multiple problems (energy + digestion + skin)",
    "Complete system approach vs single-benefit supplements",
    "All-in-one wellness stack"
  ],

  guarantee_trust: [
    "60/90-day money-back guarantee (specific number = more credible)",
    "If you don't see results, full refund",
    "Risk-free trial"
  ],

  scientific_positioning: [
    "Clinically-backed ingredient",
    "Third-party tested",
    "X% of customers report [specific benefit]"
  ],

  aspirational_tone: [
    "Join X thousand customers who've already switched",
    "The premium choice for serious wellness enthusiasts",
    "What the best-performing people use"
  ]
};

module.exports = {
  COMPETITOR_DATA,
  MARKETING_PATTERNS
};
