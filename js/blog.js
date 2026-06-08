/* ============================================
   FOTO WORLD — Blog JavaScript
   Category filters, search
   ============================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initBlogFilters();
  initSearch();
  initNewsletterForm();
});

function initBlogFilters() {
  const items = document.querySelectorAll('.cat-filter-item');
  const posts = document.querySelectorAll('.blog-post-card');
  if (!items.length) return;

  items.forEach(item => {
    item.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const cat = item.dataset.category;
      posts.forEach(post => {
        if (cat === 'all' || post.dataset.category === cat) {
          post.style.display = '';
          setTimeout(() => { post.style.opacity = '1'; }, 10);
        } else {
          post.style.opacity = '0';
          setTimeout(() => { post.style.display = 'none'; }, 250);
        }
      });
    });
  });
}

function initSearch() {
  const searchInput = document.getElementById('blog-search');
  const posts = document.querySelectorAll('.blog-post-card');
  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    posts.forEach(post => {
      const title = post.querySelector('.blog-card-title')?.textContent.toLowerCase() || '';
      const excerpt = post.querySelector('.blog-card-excerpt')?.textContent.toLowerCase() || '';
      if (!query || title.includes(query) || excerpt.includes(query)) {
        post.style.display = '';
      } else {
        post.style.display = 'none';
      }
    });
  });
}

function initNewsletterForm() {
  const form = document.getElementById('newsletter-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const email = form.querySelector('input[type="email"]').value;
    const btn = form.querySelector('button[type="submit"]');
    btn.textContent = '✓ Subscribed!';
    btn.disabled = true;
    btn.style.background = '#22c55e';
    setTimeout(() => {
      btn.textContent = 'Subscribe';
      btn.disabled = false;
      btn.style.background = '';
      form.reset();
    }, 4000);
  });
}
