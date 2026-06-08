/* ============================================
   FOTO WORLD — Main JavaScript
   Core: Nav, Theme, Scroll, WhatsApp, Preloader
   ============================================ */

'use strict';

// ── WHATSAPP CONFIG ──
const WA_NUMBER = '919876543210'; // Replace with actual number
const WA_MESSAGE = encodeURIComponent('Hello! I would like to inquire about your photography services at FOTO WORLD.');

// ── DOM READY ──
document.addEventListener('DOMContentLoaded', () => {
  initPreloader();
  initNavbar();
  initTheme();
  initMobileMenu();
  initWhatsApp();
  initBackToTop();
  initSmoothScroll();
  setActiveNavLink();
});

// ── PRELOADER ──
function initPreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;

  const onLoad = () => {
    setTimeout(() => {
      preloader.classList.add('hidden');
      document.body.style.overflow = '';
    }, 400);
  };

  if (document.readyState === 'complete') {
    onLoad();
  } else {
    window.addEventListener('load', onLoad);
  }

  document.body.style.overflow = 'hidden';
}

// ── NAVBAR ──
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  let lastScroll = 0;
  let isScrolled = false;

  const handleScroll = () => {
    const scrollY = window.scrollY;

    // Add scrolled class
    if (scrollY > 60 && !isScrolled) {
      navbar.classList.add('scrolled');
      isScrolled = true;
    } else if (scrollY <= 60 && isScrolled) {
      navbar.classList.remove('scrolled');
      isScrolled = false;
    }

    lastScroll = scrollY;
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

// ── THEME ──
function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  const root = document.documentElement;

  // Load saved theme
  const savedTheme = localStorage.getItem('fw-theme') || 'light';
  root.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  if (!toggle) return;

  toggle.addEventListener('click', () => {
    const current = root.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('fw-theme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const sunIcon = document.querySelector('#theme-toggle .icon-sun');
  const moonIcon = document.querySelector('#theme-toggle .icon-moon');
  if (!sunIcon || !moonIcon) return;

  if (theme === 'dark') {
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  } else {
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  }
}

// ── MOBILE MENU ──
function initMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (!hamburger || !mobileMenu) return;

  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
    hamburger.setAttribute('aria-expanded', isOpen);
  });

  // Close on link click
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
}

// ── WHATSAPP FAB ──
function initWhatsApp() {
  const fab = document.getElementById('whatsapp-fab');
  if (!fab) return;
  fab.href = `https://wa.me/${WA_NUMBER}?text=${WA_MESSAGE}`;
}

// ── BACK TO TOP ──
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ── SMOOTH SCROLL FOR ANCHORS ──
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      const navHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height'));
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

// ── ACTIVE NAV LINK ──
function setActiveNavLink() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-links a, .mobile-nav-links a');

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

// ── TOAST NOTIFICATION ──
function showToast(message, type = 'info', duration = 3000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast ${type}`;

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ── LAZY LOADING ──
function initLazyLoading() {
  if (!('IntersectionObserver' in window)) {
    // Fallback: load all images
    document.querySelectorAll('img[data-src]').forEach(img => {
      img.src = img.dataset.src;
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '200px 0px' });

  document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
}

document.addEventListener('DOMContentLoaded', initLazyLoading);

// ── FORM VALIDATION ──
function validateForm(formEl) {
  let isValid = true;
  const required = formEl.querySelectorAll('[required]');

  required.forEach(field => {
    const errorEl = field.parentElement.querySelector('.form-error');
    if (!field.value.trim()) {
      field.classList.add('error');
      if (errorEl) errorEl.classList.add('visible');
      isValid = false;
    } else {
      field.classList.remove('error');
      if (errorEl) errorEl.classList.remove('visible');
    }
  });

  // Email validation
  const emailFields = formEl.querySelectorAll('input[type="email"]');
  emailFields.forEach(field => {
    if (field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) {
      field.classList.add('error');
      const errorEl = field.parentElement.querySelector('.form-error');
      if (errorEl) {
        errorEl.textContent = 'Please enter a valid email address';
        errorEl.classList.add('visible');
      }
      isValid = false;
    }
  });

  return isValid;
}

// Export for other scripts
window.FotoWorld = { showToast, validateForm, WA_NUMBER, WA_MESSAGE };
