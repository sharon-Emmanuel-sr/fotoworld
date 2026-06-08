/* ============================================================
   FOTO WORLD — Contact Form API Integration
   Adds to contact.html: submits form to /api/contact
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Sending…';
    btn.disabled = true;

    const name    = document.getElementById('contact-name')?.value.trim();
    const email   = document.getElementById('contact-email')?.value.trim();
    const phone   = document.getElementById('contact-phone')?.value.trim() || '';
    const service = document.getElementById('contact-service')?.value || '';
    const message = document.getElementById('contact-message')?.value.trim();

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, service, message })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');

      // Show success
      const success = document.getElementById('contact-success');
      if (success) {
        form.style.display = 'none';
        success.style.display = 'block';
      } else {
        alert('Message sent! We will respond within 24 hours.');
        form.reset();
      }
    } catch (err) {
      alert('Error: ' + err.message + '\nPlease try WhatsApp or call us directly.');
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  // Newsletter forms
  document.querySelectorAll('.newsletter-form, #newsletter-form').forEach(nForm => {
    nForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = nForm.querySelector('input[type="email"]');
      const btn = nForm.querySelector('button[type="submit"]');
      if (!emailInput || !btn) return;

      const email = emailInput.value.trim();
      try {
        const res = await fetch('/api/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        btn.textContent = '✓ ' + (data.message || 'Subscribed!');
        btn.disabled = true;
        btn.style.background = '#22c55e';
        emailInput.value = '';
        setTimeout(() => {
          btn.textContent = 'Subscribe Free';
          btn.disabled = false;
          btn.style.background = '';
        }, 5000);
      } catch {
        btn.textContent = 'Try Again';
        btn.disabled = false;
      }
    });
  });

  // Review form
  const reviewForm = document.getElementById('review-form');
  if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = reviewForm.querySelector('button[type="submit"]');
      btn.textContent = 'Submitting…'; btn.disabled = true;
      try {
        const res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:        reviewForm.querySelector('[name=name]')?.value,
            service:     reviewForm.querySelector('[name=service]')?.value,
            rating:      reviewForm.querySelector('[name=rating]')?.value,
            review_text: reviewForm.querySelector('[name=review_text]')?.value,
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert(data.message);
        reviewForm.reset();
      } catch(err) {
        alert('Error: ' + err.message);
      } finally { btn.textContent = 'Submit Review'; btn.disabled = false; }
    });
  }
});
