// Global state management
const S = {
  productName: '',
  productContext: '',
  angle: '',
  angles: [],
  hooks: [],
  benefits: {},
  images: {},
  textLayers: {}
};

// ─── GENERATE ANGLES (WITH AUTO-RETRY) ──────────────────────────────────────
async function generateAngles() {
  const prodName = document.getElementById('productName').value.trim();
  const prodContext = document.getElementById('productContext').value.trim();
  
  if (!prodName || !prodContext) {
    alert('Please fill in both product name and context');
    return;
  }
  
  S.productName = prodName;
  S.productContext = prodContext;
  
  const maxRetries = 10;
  let attempt = 1;
  
  const showStatus = (msg) => {
    const statusEl = document.getElementById('statusMessage');
    if (statusEl) statusEl.textContent = msg;
  };
  
  // Create or show status message
  let statusEl = document.getElementById('statusMessage');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'statusMessage';
    statusEl.style.cssText = 'padding: 10px; margin: 10px 0; background: #e3f2fd; color: #1565c0; border-radius: 4px; font-weight: bold;';
    document.body.insertBefore(statusEl, document.body.firstChild);
  }
  
  try {
    while (attempt <= maxRetries) {
      showStatus(`✓ Generating Meta-compliant angles (attempt ${attempt}/${maxRetries})...`);
      
      const res = await fetch('/api/generate-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: prodName, productContext: prodContext })
      });
      
      const data = await res.json();
      
      if (res.ok && data.angles) {
        S.angles = data.angles;
        S.angle = '';
        S.hooks = [];
        S.benefits = {};
        S.images = {};
        S.textLayers = {};
        
        renderAngles();
        document.getElementById('anglesSection').style.display = 'block';
        showStatus('✅ Meta-compliant angles generated!');
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
        return;
      }
      
      // Compliance failed, retry
      console.warn(`Attempt ${attempt} failed:`, data.error);
      attempt++;
      
      // Small delay before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // All retries exhausted
    alert(`❌ Could not generate Meta-compliant angles after ${maxRetries} attempts.\n\nTry different context keywords that avoid weight loss, medical claims, or transformation language.`);
    showStatus('❌ Failed to generate compliant content');
  } catch (e) {
    alert('Error generating angles: ' + e.message);
    showStatus('❌ Error: ' + e.message);
  }
}

// ─── RENDER ANGLES ──────────────────────────────────────────────────────────
function renderAngles() {
  const container = document.getElementById('anglesContainer');
  container.innerHTML = '';
  
  S.angles.forEach((angle, idx) => {
    const btn = document.createElement('button');
    btn.className = 'angle-btn';
    if (angle === S.angle) btn.classList.add('active');
    btn.textContent = angle;
    btn.onclick = () => selectAngle(angle);
    container.appendChild(btn);
  });
}

// ─── SELECT ANGLE (WITH AUTO-RETRY FOR HOOKS) ───────────────────────────────
async function selectAngle(angle) {
  S.angle = angle;
  S.hooks = [];
  S.benefits = {};
  S.images = {};
  S.textLayers = {};
  
  renderAngles();
  
  const maxRetries = 10;
  let attempt = 1;
  
  const showStatus = (msg) => {
    const statusEl = document.getElementById('statusMessage');
    if (statusEl) statusEl.textContent = msg;
  };
  
  let statusEl = document.getElementById('statusMessage');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'statusMessage';
    statusEl.style.cssText = 'padding: 10px; margin: 10px 0; background: #e3f2fd; color: #1565c0; border-radius: 4px; font-weight: bold;';
    document.body.insertBefore(statusEl, document.body.firstChild);
  }
  
  try {
    while (attempt <= maxRetries) {
      showStatus(`✓ Generating Meta-compliant hooks (attempt ${attempt}/${maxRetries})...`);
      
      const res = await fetch('/api/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angle: angle, productName: S.productName })
      });
      
      const data = await res.json();
      
      if (res.ok && data.hooks) {
        S.hooks = data.hooks;
        renderHooks();
        showStatus('✅ Meta-compliant hooks generated!');
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
        return;
      }
      
      console.warn(`Attempt ${attempt} failed:`, data.error);
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    alert(`❌ Could not generate Meta-compliant hooks after ${maxRetries} attempts.`);
    showStatus('❌ Failed to generate compliant hooks');
  } catch (e) {
    alert('Error generating hooks: ' + e.message);
    showStatus('❌ Error: ' + e.message);
  }
}

// ─── RENDER HOOKS ───────────────────────────────────────────────────────────
function renderHooks() {
  const container = document.getElementById('hooksContainer');
  container.innerHTML = '';
  
  S.hooks.forEach((hook, idx) => {
    const card = document.createElement('div');
    card.className = 'hook-card';
    card.innerHTML = `
      <div class="hook-text">${escapeHtml(hook)}</div>
      <button class="btn-primary" onclick="generateBenefit(${idx})">
        Generate Benefit & Image Brief
      </button>
      <div class="benefit-section" id="benefit-${idx}" style="display: none;">
        <div class="benefit-content">
          <h4>Benefit Copy</h4>
          <p id="benefit-text-${idx}"></p>
        </div>
        <div class="image-brief">
          <h4>Whisk Image Prompt</h4>
          <p id="image-desc-${idx}" style="background: #f5f5f5; padding: 12px; border-radius: 4px; font-size: 14px; line-height: 1.6; margin-bottom: 10px;"></p>
          <div style="display: flex; gap: 10px;">
            <button class="btn-secondary" onclick="copyToClipboard(${idx})">📋 Copy Prompt</button>
            <a href="https://labs.google/fx/tools/whisk/" target="_blank" class="btn-secondary" style="text-decoration: none; display: inline-flex; align-items: center;">🎨 Open Whisk</a>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// ─── GENERATE BENEFIT & IMAGE DESCRIPTION (WITH AUTO-RETRY) ─────────────────
async function generateBenefit(hookIdx) {
  const hook = S.hooks[hookIdx];
  
  const maxRetries = 10;
  let attempt = 1;
  
  const showStatus = (msg) => {
    const statusEl = document.getElementById('statusMessage');
    if (statusEl) statusEl.textContent = msg;
  };
  
  let statusEl = document.getElementById('statusMessage');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'statusMessage';
    statusEl.style.cssText = 'padding: 10px; margin: 10px 0; background: #e3f2fd; color: #1565c0; border-radius: 4px; font-weight: bold;';
    document.body.insertBefore(statusEl, document.body.firstChild);
  }
  
  try {
    while (attempt <= maxRetries) {
      showStatus(`✓ Generating Meta-compliant benefit & image brief (attempt ${attempt}/${maxRetries})...`);
      
      // Generate benefit
      const benefitRes = await fetch('/api/generate-benefit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hook: hook,
          angle: S.angle,
          productName: S.productName,
          productContext: S.productContext
        })
      });
      
      const benefitData = await benefitRes.json();
      
      if (!benefitRes.ok) {
        console.warn(`Attempt ${attempt} - Benefit failed:`, benefitData.error);
        attempt++;
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      S.benefits[hookIdx] = benefitData.benefit;
      document.getElementById(`benefit-text-${hookIdx}`).textContent = benefitData.benefit;
      
      // Generate image description
      const imgRes = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hook: hook,
          benefit: benefitData.benefit,
          angle: S.angle,
          productName: S.productName
        })
      });
      
      const imgData = await imgRes.json();
      
      if (!imgRes.ok) {
        console.warn(`Attempt ${attempt} - Image failed:`, imgData.error);
        attempt++;
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      S.images[hookIdx] = imgData.imageDescription;
      document.getElementById(`image-desc-${hookIdx}`).textContent = imgData.imageDescription;
      
      // Reveal benefit section
      document.getElementById(`benefit-${hookIdx}`).style.display = 'block';
      showStatus('✅ Meta-compliant benefit & image brief generated!');
      setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      return;
    }
    
    alert(`❌ Could not generate Meta-compliant benefit and image after ${maxRetries} attempts.`);
    showStatus('❌ Failed to generate compliant content');
  } catch (e) {
    alert('Error: ' + e.message);
    showStatus('❌ Error: ' + e.message);
  }
}

// ─── UTILITY: ESCAPE HTML ───────────────────────────────────────────────────
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ─── UTILITY: COPY TO CLIPBOARD ─────────────────────────────────────────────
function copyToClipboard(hookIdx) {
  const prompt = document.getElementById(`image-desc-${hookIdx}`).textContent;
  
  navigator.clipboard.writeText(prompt).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }).catch(() => {
    alert('Failed to copy. Please try again.');
  });
}
