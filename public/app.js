// Global state
const S = {
  productName: '',
  productContext: '',
  angles: [],
  selectedAngle: null,
  selectedHeadline: null,
  allAds: [],
  currentPlatform: 'facebook'
};

// ─── GENERATE BULK CAMPAIGN ─────────────────────────────────────────────────
async function generateBulkCampaign() {
  console.log('🔥 generateBulkCampaign called');
  const prodName = document.getElementById('productName').value.trim();
  const prodContext = document.getElementById('productContext').value.trim();
  const numAds = parseInt(document.getElementById('numAds').value) || 10;
  const btn = document.getElementById('generateBtn');
  console.log('Button:', btn, 'Product:', prodName, 'Ads:', numAds);
  
  if (!prodName || !prodContext) {
    alert('Fill in product name and context');
    return;
  }
  
  S.productName = prodName;
  S.productContext = prodContext;
  
  // Disable button and show loading
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>Generating...';
  
  const maxRetries = 5;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      showStatus(`<span class="spinner"></span> Generating ${numAds} complete ad variations (attempt ${attempt}/${maxRetries})...`, 'loading');
      
      const res = await fetch('/api/generate-bulk-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: prodName, productContext: prodContext, numAds })
      });
      
      if (!res.ok) {
        const err = await res.json();
        console.warn(`Attempt ${attempt} failed:`, err.error);
        showStatus(`<span class="spinner"></span> Retrying (${attempt}/${maxRetries})...`, 'loading');
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      const data = await res.json();
      console.log('✅ Got response:', data);
      S.allAds = data.campaign.ads;
      
      // Update stats
      document.getElementById('adCount').textContent = data.campaign.totalAds;
      const uniqueAngles = new Set(S.allAds.map(a => a.angle)).size;
      document.getElementById('angleCount').textContent = uniqueAngles;
      
      // Success!
      showStatus(`✅ Generated ${data.campaign.totalAds} complete ads!`, 'success');
      document.getElementById('bulkSection').style.display = 'block';
      renderAdGrid();
      
      // Re-enable button
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    } catch (e) {
      console.error(`Attempt ${attempt} error:`, e.message);
      if (attempt === maxRetries) {
        showStatus(`❌ Failed after ${maxRetries} attempts. Check console for error details.`, 'error');
      }
    }
  }
  
  // All retries failed
  showStatus(`❌ Could not generate campaign after ${maxRetries} attempts`, 'error');
  btn.disabled = false;
  btn.textContent = originalText;
}

// ─── RENDER AD GRID ─────────────────────────────────────────────────────────
function renderAdGrid() {
  const container = document.getElementById('adGrid');
  container.innerHTML = '';
  
  S.allAds.forEach(ad => {
    const card = document.createElement('div');
    card.className = 'ad-card';
    card.innerHTML = `
      <div class="ad-card-header">
        <span class="angle-badge">${escapeHtml(ad.angle.substring(0, 40))}</span>
        <span class="ad-id">Ad #${ad.id}</span>
      </div>
      <div class="ad-card-content">
        <h3 class="ad-headline">${escapeHtml(ad.headline)}</h3>
        <p class="ad-body">${escapeHtml(ad.bodyCopy)}</p>
        <div class="ad-footer">
          <button class="btn-cta">${escapeHtml(ad.cta)}</button>
        </div>
      </div>
      <div class="ad-card-actions">
        <button class="btn-small" onclick="copyAdText(${ad.id})">📋 Copy</button>
        <button class="btn-small" onclick="viewAdDetails(${ad.id})">👁️ Details</button>
        <button class="btn-small" onclick="downloadAdImage(${ad.id})">📥 Whisk</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// ─── VIEW AD DETAILS (PLATFORMS) ──────────────────────────────────────────
function viewAdDetails(adId) {
  const ad = S.allAds.find(a => a.id === adId);
  if (!ad) return;
  
  let html = `<div style="background: white; padding: 20px; border-radius: 8px;">
    <h3>${escapeHtml(ad.angle)}</h3>
    <h2>${escapeHtml(ad.headline)}</h2>
    <p>${escapeHtml(ad.bodyCopy)}</p>
    <p><strong>CTA:</strong> ${escapeHtml(ad.cta)}</p>
    
    <hr style="margin: 20px 0;">
    <h4>Platform Versions:</h4>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;">`;
  
  Object.entries(ad.platforms || {}).forEach(([platform, v]) => {
    html += `<div style="border: 1px solid #e0e0e0; padding: 15px; border-radius: 8px;">
      <h5>${platform.toUpperCase()}</h5>
      <p><strong>${escapeHtml(v.headline)}</strong></p>
      <p>${escapeHtml(v.bodyCopy)}</p>
      <p style="color: #667eea; font-weight: bold;">${escapeHtml(v.cta)}</p>
    </div>`;
  });
  
  html += `</div><button class="btn-primary" onclick="closeModal()">Close</button></div>`;
  
  showModal('Ad Details', html);
}

// ─── COPY AD TEXT ───────────────────────────────────────────────────────────
function copyAdText(adId) {
  const ad = S.allAds.find(a => a.id === adId);
  if (!ad) return;
  
  const text = `Headline: ${ad.headline}\n\nBody: ${ad.bodyCopy}\n\nCTA: ${ad.cta}`;
  navigator.clipboard.writeText(text).then(() => {
    showStatus('✅ Ad copied to clipboard!', 'success');
  });
}

// ─── A/B TEST RECOMMENDATIONS ──────────────────────────────────────────────
async function generateABTests() {
  if (S.allAds.length < 2) {
    alert('Generate at least 2 ads first');
    return;
  }
  
  try {
    showStatus('📊 Analyzing A/B test opportunities...', 'loading');
    
    const res = await fetch('/api/generate-ab-tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ads: S.allAds })
    });
    
    const data = await res.json();
    
    let html = `<div style="background: white; padding: 20px;">
      <h3>A/B Test Strategy</h3>
      <p style="color: #666; margin: 10px 0;">${data.strategy}</p>
      
      <div style="margin-top: 20px;">`;
    
    data.recommendedTests.forEach((test, idx) => {
      html += `<div style="border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; background: #f8f8ff;">
        <h4>${test.name}</h4>
        <p><strong>${test.description}</strong></p>
        <p>${test.hypothesis}</p>
        <p style="color: #667eea; font-size: 14px;">📈 Success metric: ${test.successMetric}</p>
      </div>`;
    });
    
    html += `</div><button class="btn-primary" onclick="closeModal()">Got it</button></div>`;
    
    showModal('A/B Test Recommendations', html);
    showStatus('✅ A/B tests analyzed!', 'success');
  } catch (e) {
    showStatus('❌ Error: ' + e.message, 'error');
  }
}

// ─── GENERATE WHISK PROMPT ──────────────────────────────────────────────────
async function downloadAdImage(adId) {
  const ad = S.allAds.find(a => a.id === adId);
  if (!ad) return;
  
  try {
    showStatus('🎨 Creating Whisk prompt...', 'loading');
    
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook: ad.headline,
        benefit: ad.bodyCopy,
        angle: ad.angle,
        productName: S.productName
      })
    });
    
    const data = await res.json();
    
    let html = `<div style="background: white; padding: 20px;">
      <h3>Whisk Image Prompt</h3>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0; line-height: 1.6;">
        ${escapeHtml(data.imageDescription)}
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn-primary" onclick="copyWhiskPrompt('${data.imageDescription.replace(/'/g, "\\'")}')">📋 Copy Prompt</button>
        <a href="https://labs.google/fx/tools/whisk/" target="_blank" class="btn-primary">🎨 Open Whisk</a>
      </div>
      <button class="btn-secondary" onclick="closeModal()" style="margin-top: 10px; width: 100%;">Close</button>
    </div>`;
    
    showModal('Generate Image in Whisk', html);
    showStatus('✅ Whisk prompt ready!', 'success');
  } catch (e) {
    showStatus('❌ Error: ' + e.message, 'error');
  }
}

function copyWhiskPrompt(text) {
  navigator.clipboard.writeText(text).then(() => {
    showStatus('✅ Prompt copied!', 'success');
  });
}

// ─── EXPORT CAMPAIGN ────────────────────────────────────────────────────────
function exportCampaign() {
  if (S.allAds.length === 0) {
    alert('Generate ads first');
    return;
  }
  
  const csv = [
    ['Ad ID', 'Angle', 'Headline', 'Body Copy', 'CTA'],
    ...S.allAds.map(a => [
      a.id,
      a.angle,
      `"${a.headline}"`,
      `"${a.bodyCopy}"`,
      a.cta
    ])
  ].map(row => row.join(',')).join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${S.productName}-ads.csv`;
  a.click();
  
  showStatus('✅ Campaign exported as CSV!', 'success');
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────
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

function showStatus(msg, type = 'info') {
  let statusEl = document.getElementById('statusMessage');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'statusMessage';
    document.body.insertBefore(statusEl, document.body.firstChild);
  }
  
  statusEl.innerHTML = msg;
  statusEl.style.padding = '15px 25px';
  statusEl.style.margin = '15px 0';
  statusEl.style.borderRadius = '8px';
  statusEl.style.fontWeight = 'bold';
  statusEl.style.animation = 'slideIn 0.3s ease';
  statusEl.style.display = 'flex';
  statusEl.style.alignItems = 'center';
  
  if (type === 'success') {
    statusEl.style.background = '#c8e6c9';
    statusEl.style.color = '#1b5e20';
    setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
  } else if (type === 'error') {
    statusEl.style.background = '#ffcdd2';
    statusEl.style.color = '#c62828';
    setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
  } else if (type === 'loading') {
    statusEl.style.background = '#e3f2fd';
    statusEl.style.color = '#0d47a1';
    // Keep loading message visible
  } else {
    statusEl.style.background = '#fff9c4';
    statusEl.style.color = '#f57f17';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
  }
  
  return statusEl;
}

function showModal(title, content) {
  let modal = document.getElementById('modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 12px; max-width: 600px; max-height: 80vh; overflow-y: auto; padding: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
      <h2>${title}</h2>
      ${content}
    </div>
  `;
  modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.style.display = 'none';
}

// Close modal on background click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('modal');
  if (modal && e.target === modal) {
    modal.style.display = 'none';
  }
});
