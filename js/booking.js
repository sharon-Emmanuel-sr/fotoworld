/* ============================================
   FOTO WORLD — Booking System JavaScript
   ============================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initCalendar();
  initBookingFlow();
});

// ── BOOKING STATE ──
const booking = {
  service: null,
  serviceLabel: null,
  servicePrice: null,
  date: null,
  dateLabel: null,
  time: null,
  step: 1,
};

// ── STEP NAVIGATION ──
window.goToStep = function(step) {
  if (step === 2 && !booking.service) {
    showToast('Please select a service to continue.', 'error');
    return;
  }
  if (step === 3 && !booking.date) {
    showToast('Please select a date and time to continue.', 'error');
    return;
  }
  if (step === 4) {
    // Validate form
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    const email = document.getElementById('customer-email').value.trim();
    if (!name || !phone || !email) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    // Populate confirm panel
    document.getElementById('conf-service').textContent = booking.serviceLabel || '—';
    document.getElementById('conf-date').textContent = booking.dateLabel || '—';
    document.getElementById('conf-time').textContent = booking.time || '—';
    document.getElementById('conf-name').textContent = name;
    document.getElementById('conf-phone').textContent = phone;
    document.getElementById('conf-email').textContent = email;
  }

  // Update panels
  document.querySelectorAll('.booking-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-step' + step).classList.add('active');

  // Update progress
  document.querySelectorAll('.booking-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < step) s.classList.add('done');
    if (i + 1 === step) s.classList.add('active');
  });

  document.querySelectorAll('.step-connector').forEach((c, i) => {
    c.classList.toggle('done', i + 1 < step);
  });

  booking.step = step;
  window.scrollTo({ top: 200, behavior: 'smooth' });
};

// ── SERVICE SELECTION ──
window.selectServiceCard = function(el, label, price) {
  document.querySelectorAll('.card-service').forEach(c => {
    c.style.borderColor = 'transparent';
    c.style.boxShadow = '';
  });
  el.style.borderColor = 'var(--primary-gold)';
  el.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.15)';

  booking.service = el.closest('label').querySelector('input').value;
  booking.serviceLabel = label;
  booking.servicePrice = price;

  document.getElementById('sum-service').textContent = label;
  document.getElementById('sum-price').textContent = price;
};

// ── CALENDAR ──
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const booked = [3, 7, 14, 21]; // Simulated booked days

let currentMonth, currentYear;

function initCalendar() {
  const now = new Date();
  currentMonth = now.getMonth();
  currentYear = now.getFullYear();
  renderCalendar();

  document.getElementById('cal-prev').addEventListener('click', () => {
    const now2 = new Date();
    if (currentYear === now2.getFullYear() && currentMonth === now2.getMonth()) return;
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });

  document.getElementById('cal-next').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const label = document.getElementById('cal-month-label');
  label.textContent = `${months[currentMonth]} ${currentYear}`;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();

  let html = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // Empty leading cells
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(currentYear, currentMonth, d);
    const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
    const isBooked = booked.includes(d);
    const isSelected = booking.dateLabel === `${d} ${months[currentMonth]} ${currentYear}`;

    let cls = 'cal-day';
    if (isPast || isBooked) cls += ' disabled';
    else if (isSelected) cls += ' selected';
    else if (isToday) cls += ' today';

    const clickAttr = (!isPast && !isBooked)
      ? `onclick="selectDate(${d}, '${months[currentMonth]}', ${currentYear})"` : '';

    html += `<div class="${cls}" ${clickAttr}>${d}</div>`;
  }

  grid.innerHTML = html;
}

window.selectDate = function(day, month, year) {
  booking.dateLabel = `${day} ${month} ${year}`;
  booking.date = new Date(year, months.indexOf(month), day);
  document.getElementById('sum-date').textContent = booking.dateLabel;
  document.getElementById('selected-date-label').textContent = `${day} ${month} ${year}`;

  // Show time slots
  document.getElementById('time-slots-section').style.display = 'block';
  renderCalendar(); // Re-render to highlight selected
  document.getElementById('btn-step2-next').disabled = !booking.time;

  // Fetch real booked slots from API
  const yyyy = year;
  const mm = String(months.indexOf(month) + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  fetch(`/api/bookings/slots?date=${dateStr}`)
    .then(r => r.json())
    .then(d => {
      bookedSlotsFromAPI = d.booked_slots || [];
      renderTimeSlots();
    })
    .catch(() => renderTimeSlots());
};

let bookedSlotsFromAPI = [];

const allSlots = ['9:00 AM','10:00 AM','11:00 AM','12:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM'];
const bookedSlots = ['10:00 AM', '3:00 PM', '5:00 PM'];

function renderTimeSlots() {
  const grid = document.getElementById('time-slots-grid');
  const occupied = bookedSlotsFromAPI.length > 0 ? bookedSlotsFromAPI : bookedSlots;
  grid.innerHTML = allSlots.map(slot => {
    const isBooked = occupied.includes(slot);
    const isSelected = booking.time === slot;
    let cls = 'time-slot';
    if (isBooked) cls += ' booked';
    else if (isSelected) cls += ' selected';
    const clickAttr = !isBooked ? `onclick="selectTimeSlot('${slot}', this)"` : '';
    return `<div class="${cls}" ${clickAttr}>${slot}${isBooked ? ' <small style="font-size:10px;opacity:0.6">Booked</small>' : ''}</div>`;
  }).join('');
}

window.selectTimeSlot = function(slot, el) {
  document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  booking.time = slot;
  document.getElementById('sum-time').textContent = slot;
  document.getElementById('btn-step2-next').disabled = false;
};

// ── BOOKING FLOW ──
function initBookingFlow() {
  // Handle URL params (e.g., ?service=wedding from services page)
  const params = new URLSearchParams(window.location.search);
  const svc = params.get('service');
  if (svc) {
    const el = document.getElementById(`svc-${svc}`);
    if (el) {
      const card = el.nextElementSibling;
      if (card) {
        const titleEl = card.querySelector('.service-title');
        const priceEl = card.querySelector('.service-price');
        if (titleEl && priceEl) selectServiceCard(card, titleEl.textContent, priceEl.textContent);
      }
    }
  }
}

// ── CONFIRM & SAVE TO DB + WHATSAPP ──
window.confirmBooking = async function() {
  const btn = document.getElementById('confirm-booking-btn');
  const name    = document.getElementById('customer-name').value.trim();
  const phone   = document.getElementById('customer-phone').value.trim();
  const email   = document.getElementById('customer-email').value.trim();
  const occasion = document.getElementById('occasion').value.trim();
  const notes   = document.getElementById('special-requests').value.trim();

  btn.textContent = 'Saving…';
  btn.disabled = true;

  const d = booking.date;
  const dateStr = d
    ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    : '';

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service:   booking.serviceLabel,
        date:      dateStr,
        time_slot: booking.time,
        name, phone, email, occasion, notes,
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Booking failed');

    const msg = encodeURIComponent(
      `🌟 *New Booking — FOTO WORLD*\n\n` +
      `🔖 *Ref:* ${data.booking.ref_code}\n` +
      `📸 *Service:* ${booking.serviceLabel || '—'}\n` +
      `📅 *Date:* ${booking.dateLabel || '—'}\n` +
      `🕐 *Time:* ${booking.time || '—'}\n\n` +
      `👤 *Name:* ${name}\n` +
      `📱 *Phone:* ${phone}\n` +
      `📧 *Email:* ${email}\n` +
      (occasion ? `🎉 *Occasion:* ${occasion}\n` : '') +
      (notes ? `📝 *Notes:* ${notes}\n` : '')
    );
    window.open(`https://wa.me/919876543210?text=${msg}`, '_blank');

    document.getElementById('booking-review-card').style.display = 'none';
    document.querySelector('#panel-step4 > div:last-child').style.display = 'none';
    document.getElementById('booking-success').style.display = 'block';
    document.querySelectorAll('.booking-step').forEach(s => s.classList.add('done'));

  } catch(err) {
    showToast(err.message || 'Booking failed. Please try again.', 'error');
    btn.textContent = 'Confirm via WhatsApp';
    btn.disabled = false;
  }
};

// ── TOAST ──
function showToast(msg, type = 'info') {
  let toast = document.getElementById('fw-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'fw-toast';
    toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#1a1a1a;color:white;padding:0.75rem 1.5rem;border-radius:9999px;font-size:0.875rem;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.4);transition:all 0.3s';
    document.body.appendChild(toast);
  }
  if (type === 'error') toast.style.borderLeft = '3px solid #ef4444';
  else toast.style.borderLeft = '3px solid #C9A84C';
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}
