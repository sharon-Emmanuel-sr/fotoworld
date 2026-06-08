/* ============================================
   FOTO WORLD — Animations JavaScript
   IntersectionObserver, Counters, Parallax
   ============================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  initCounters();
  initParallax();
  initTestimonialsCarousel();
  initStaggerReveal();
});

// ── SCROLL REVEAL ──
function initScrollReveal() {
  if (!('IntersectionObserver' in window)) {
    // Fallback: show all
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(el => {
      el.classList.add('visible');
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -60px 0px'
  });

  document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(el => {
    observer.observe(el);
  });
}

// ── STAGGER REVEAL ──
function initStaggerReveal() {
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const children = entry.target.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
        children.forEach((child, i) => {
          setTimeout(() => child.classList.add('visible'), i * 80);
        });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.stagger').forEach(el => observer.observe(el));
}

// ── COUNTER ANIMATION ──
function initCounters() {
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-counter]').forEach(el => observer.observe(el));
}

function animateCounter(el) {
  const target = parseInt(el.getAttribute('data-counter'), 10);
  const suffix = el.getAttribute('data-suffix') || '';
  const prefix = el.getAttribute('data-prefix') || '';
  const duration = parseInt(el.getAttribute('data-duration') || '2000', 10);
  const startTime = performance.now();

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);
    const current = Math.round(easedProgress * target);

    el.textContent = prefix + current.toLocaleString() + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ── PARALLAX ──
function initParallax() {
  const parallaxEls = document.querySelectorAll('[data-parallax]');
  if (!parallaxEls.length) return;

  // Disable parallax on mobile for performance
  if (window.innerWidth < 768) return;

  let ticking = false;

  const handleScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        parallaxEls.forEach(el => {
          const rect = el.getBoundingClientRect();
          const speed = parseFloat(el.getAttribute('data-parallax') || '0.3');
          const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * speed;
          el.style.transform = `translateY(${offset}px)`;
        });
        ticking = false;
      });
      ticking = true;
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
}

// ── TESTIMONIALS CAROUSEL ──
function initTestimonialsCarousel() {
  const track = document.querySelector('.testimonials-track');
  if (!track) return;

  const slides = track.querySelectorAll('.testimonial-slide');
  if (slides.length === 0) return;

  const dots = document.querySelectorAll('.carousel-dot');
  const prevBtn = document.querySelector('.carousel-btn.prev');
  const nextBtn = document.querySelector('.carousel-btn.next');

  let currentIndex = 0;
  let autoplayTimer = null;

  function goTo(index) {
    currentIndex = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;

    dots.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
  }

  function startAutoplay() {
    autoplayTimer = setInterval(() => goTo(currentIndex + 1), 5000);
  }

  function stopAutoplay() {
    clearInterval(autoplayTimer);
  }

  if (prevBtn) prevBtn.addEventListener('click', () => { stopAutoplay(); goTo(currentIndex - 1); startAutoplay(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { stopAutoplay(); goTo(currentIndex + 1); startAutoplay(); });
  dots.forEach((dot, i) => dot.addEventListener('click', () => { stopAutoplay(); goTo(i); startAutoplay(); }));

  // Touch support
  let touchStartX = 0;
  track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) { stopAutoplay(); goTo(currentIndex + (delta > 0 ? 1 : -1)); startAutoplay(); }
  });

  goTo(0);
  startAutoplay();
}

// ── NUMBER TICKER ──
function initStatCounters() {
  document.querySelectorAll('.stat-number[data-counter]').forEach(el => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(el);
          observer.disconnect();
        }
      });
    }, { threshold: 0.5 });
    observer.observe(el);
  });
}

document.addEventListener('DOMContentLoaded', initStatCounters);
