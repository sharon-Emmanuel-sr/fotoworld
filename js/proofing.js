/* ============================================
   FOTO WORLD — Client Proofing JavaScript
   localStorage for state persistence
   ============================================ */

'use strict';

// ── DEMO DATA ──
const DEMO_GALLERY = {
  code: 'DEMO2024',
  password: 'foto2024',
  sessionName: 'Priya & Karthik Wedding',
  sessionMeta: 'Session Date: 12 May 2024',
  photos: [
    { id: 'p1', src: 'assets/images/hero_wedding.png', label: 'The Ceremony Moment', category: 'Wedding' },
    { id: 'p2', src: 'assets/images/portfolio_wedding1.png', label: 'Mandap Blessing', category: 'Wedding' },
    { id: 'p3', src: 'assets/images/portfolio_engagement.png', label: 'Golden Hour Romance', category: 'Portrait' },
    { id: 'p4', src: 'assets/images/portfolio_portrait1.png', label: 'Bridal Radiance', category: 'Portrait' },
    { id: 'p5', src: 'assets/images/portfolio_kids.png', label: 'Flower Girls', category: 'Candid' },
    { id: 'p6', src: 'assets/images/studio_interior.png', label: 'Studio Portraits', category: 'Studio' },
    { id: 'p7', src: 'assets/images/hero_wedding.png', label: 'Garland Exchange', category: 'Wedding' },
    { id: 'p8', src: 'assets/images/portfolio_engagement.png', label: 'Candid Laugh', category: 'Candid' },
    { id: 'p9', src: 'assets/images/portfolio_portrait1.png', label: 'Close-Up Portrait', category: 'Portrait' },
    { id: 'p10', src: 'assets/images/portfolio_wedding1.png', label: 'Reception Dance', category: 'Wedding' },
    { id: 'p11', src: 'assets/images/portfolio_kids.png', label: 'Family Together', category: 'Family' },
    { id: 'p12', src: 'assets/images/portfolio_engagement.png', label: 'Final Frame', category: 'Wedding' },
  ]
};

const STORAGE_KEY = 'fw_proofing_session';
const FAV_KEY = 'fw_proofing_favourites';

// ── STATE ──
let currentGallery = null;
let favourites = new Set();
let showingFavsOnly = false;
let lbCurrentId = null;

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  // Check existing session
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    currentGallery = JSON.parse(saved);
    loadSavedFavourites();
    showGallery();
  }

  // Login form
  const form = document.getElementById('login-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    handleLogin();
  });
});

function handleLogin() {
  const code = document.getElementById('client-code').value.trim().toUpperCase();
  const password = document.getElementById('client-password').value.trim();
  const errorEl = document.getElementById('login-error');

  // Check against demo data
  if (code === DEMO_GALLERY.code && (password === DEMO_GALLERY.password || password === '')) {
    errorEl.style.display = 'none';
    currentGallery = DEMO_GALLERY;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(currentGallery));
    loadSavedFavourites();
    showGallery();
  } else {
    errorEl.style.display = 'block';
    errorEl.textContent = `Incorrect code or password. Try code: DEMO2024`;
    document.getElementById('client-code').classList.add('error');
  }
}

window.demoLogin = function(e) {
  e.preventDefault();
  document.getElementById('client-code').value = 'DEMO2024';
  document.getElementById('client-password').value = 'foto2024';
  handleLogin();
};

function loadSavedFavourites() {
  const saved = localStorage.getItem(FAV_KEY);
  if (saved) favourites = new Set(JSON.parse(saved));
}

function saveFavourites() {
  localStorage.setItem(FAV_KEY, JSON.stringify([...favourites]));
}

function showGallery() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('gallery-screen').classList.add('visible');

  document.getElementById('session-name-display').textContent = currentGallery.sessionName;
  document.getElementById('session-meta-display').textContent = currentGallery.sessionMeta;
  document.getElementById('photo-count-badge').textContent = `${currentGallery.photos.length} photos`;

  renderProofGrid();
  updateFavCount();

  // Preloader done
  const preloader = document.getElementById('preloader');
  if (preloader) {
    setTimeout(() => {
      preloader.style.opacity = '0';
      setTimeout(() => preloader.remove(), 600);
    }, 800);
  }
}

function renderProofGrid(filter = false) {
  const grid = document.getElementById('proof-grid');
  const photos = filter ? currentGallery.photos.filter(p => favourites.has(p.id)) : currentGallery.photos;

  if (filter && photos.length === 0) {
    grid.innerHTML = '';
    document.getElementById('fav-empty').style.display = 'block';
    return;
  }

  document.getElementById('fav-empty').style.display = 'none';

  grid.innerHTML = photos.map(photo => {
    const isFav = favourites.has(photo.id);
    return `
      <div class="proof-item" data-id="${photo.id}" onclick="openProofLb('${photo.id}')">
        <img src="${photo.src}" alt="${photo.label}" loading="lazy" />
        <div class="proof-actions" onclick="event.stopPropagation()">
          <button class="proof-action-btn ${isFav ? 'active' : ''}" title="Favourite" onclick="toggleFav('${photo.id}', this)">
            <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <a href="${photo.src}" download="${photo.label}.jpg" class="proof-action-btn" title="Download" onclick="event.stopPropagation()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
        </div>
        <div style="position:absolute;bottom:0.5rem;left:0.5rem;font-size:0.7rem;background:rgba(0,0,0,0.6);color:white;padding:2px 8px;border-radius:99px;pointer-events:none">${photo.category}</div>
      </div>
    `;
  }).join('');
}

window.toggleFav = function(id, btn) {
  if (favourites.has(id)) {
    favourites.delete(id);
    btn.classList.remove('active');
    const svg = btn.querySelector('svg path');
    if (svg) { svg.setAttribute('fill', 'none'); }
  } else {
    favourites.add(id);
    btn.classList.add('active');
    const svg = btn.querySelector('svg path');
    if (svg) { svg.setAttribute('fill', 'currentColor'); }
  }
  saveFavourites();
  updateFavCount();

  // If currently showing favs only, re-render
  if (showingFavsOnly) renderProofGrid(true);
};

function updateFavCount() {
  document.getElementById('fav-count-badge').textContent = favourites.size;
}

window.showOnlyFavourites = function() {
  showingFavsOnly = !showingFavsOnly;
  const btn = document.getElementById('fav-filter-btn');
  btn.textContent = showingFavsOnly ? 'Show All Photos' : 'Show Favourites';
  btn.classList.toggle('active', showingFavsOnly);
  renderProofGrid(showingFavsOnly);
};

window.showAllPhotos = function() {
  showingFavsOnly = false;
  document.getElementById('fav-filter-btn').textContent = 'Show Favourites';
  document.getElementById('fav-filter-btn').classList.remove('active');
  renderProofGrid(false);
};

// ── LIGHTBOX ──
window.openProofLb = function(id) {
  const photo = currentGallery.photos.find(p => p.id === id);
  if (!photo) return;
  lbCurrentId = id;
  const lb = document.getElementById('proof-lightbox');
  document.getElementById('proof-lb-img').src = photo.src;
  document.getElementById('lb-photo-label').textContent = photo.label;
  document.getElementById('lb-download-btn').href = photo.src;
  updateLbFavBtn();
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
};

function updateLbFavBtn() {
  const btn = document.getElementById('lb-fav-btn');
  const isFav = favourites.has(lbCurrentId);
  btn.classList.toggle('active', isFav);
  const svg = btn.querySelector('svg path');
  if (svg) svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
}

window.toggleFavFromLb = function() {
  if (!lbCurrentId) return;
  if (favourites.has(lbCurrentId)) {
    favourites.delete(lbCurrentId);
  } else {
    favourites.add(lbCurrentId);
  }
  saveFavourites();
  updateFavCount();
  updateLbFavBtn();
  renderProofGrid(showingFavsOnly);
};

window.closeProofLightbox = function() {
  document.getElementById('proof-lightbox').classList.remove('open');
  document.body.style.overflow = '';
  lbCurrentId = null;
};

document.addEventListener('keydown', e => {
  const lb = document.getElementById('proof-lightbox');
  if (lb && lb.classList.contains('open')) {
    if (e.key === 'Escape') closeProofLightbox();
  }
});

// ── LOGOUT ──
window.logoutPortal = function() {
  sessionStorage.removeItem(STORAGE_KEY);
  currentGallery = null;
  document.getElementById('gallery-screen').classList.remove('visible');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('client-code').value = '';
  document.getElementById('client-password').value = '';
};

// ── REQUEST PRINTS ──
window.requestPrints = function() {
  const favPhotos = currentGallery.photos.filter(p => favourites.has(p.id));
  document.getElementById('fav-print-count').textContent = favPhotos.length;

  const msg = encodeURIComponent(
    `🖨️ *Print Request — FOTO WORLD*\n\n` +
    `📸 Session: ${currentGallery.sessionName}\n` +
    `💛 Favourited Photos: ${favPhotos.length}\n` +
    `📋 Photo Labels:\n${favPhotos.map(p => `• ${p.label}`).join('\n')}\n\n` +
    `Please contact me to confirm print sizes and finishes.`
  );
  document.getElementById('print-whatsapp-btn').href = `https://wa.me/919876543210?text=${msg}`;

  const modal = document.getElementById('prints-modal');
  modal.style.display = 'flex';
};
