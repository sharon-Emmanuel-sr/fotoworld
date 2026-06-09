
/* ══════════════════════════════════════════════════════════
   FOTO WORLD Admin — Cookie-Based Auth (no localStorage)
   All API calls use credentials:'include' so the httpOnly
   fw_admin_session cookie is sent automatically.
   No token is ever stored or read by JavaScript.
══════════════════════════════════════════════════════════ */
'use strict';

let currentSection = 'dashboard';
let _editBookingId = null;
let bPage = 1;

/* ── Utility: safe HTML escape ──────────────────────────── */
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ── Toast ──────────────────────────────────────────────── */
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = '', 4000);
}

/* ── API helper — always sends cookies ──────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    credentials: 'include',                // send httpOnly session cookie
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (res.status === 401) { showLogin(); return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ── Auth: Login ────────────────────────────────────────── */
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');

  if (!username || !password) { errEl.textContent = 'Please enter username and password.'; errEl.style.display = 'block'; return; }

  btn.textContent = 'Signing in…'; btn.disabled = true; errEl.style.display = 'none';

  try {
    const d = await fetch('/api/auth/admin-login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await d.json();
    if (!d.ok) throw new Error(body.error || 'Login failed');

    setAdminName(body.admin.username);
    showApp();
    initDashboard();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Sign In to Dashboard';
    btn.disabled = false;
  }
}

/* ── Auth: Logout ───────────────────────────────────────── */
async function doLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (_) {}
  showLogin();
}

/* ── Auth: Auto-restore session on page load ────────────── */
async function tryRestoreSession() {
  try {
    const d = await fetch('/api/auth/me', { credentials: 'include' });
    if (!d.ok) { showLogin(); return; }
    const body = await d.json();
    setAdminName(body.admin.username);
    showApp();
    initDashboard();
  } catch (_) {
    showLogin();
  }
}

function setAdminName(name) {
  document.getElementById('sidebar-username').textContent = name;
  document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();
}

function showLogin() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('page-loader').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('page-loader').style.display = 'none';
}

/* ── Navigation ─────────────────────────────────────────── */
const PAGE_LABELS = { dashboard:'Dashboard', bookings:'Bookings', contacts:'Enquiries', galleries:'Galleries', reviews:'Reviews', newsletter:'Newsletter' };

function nav(page, el) {
  if (el) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
  }
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + page).classList.add('active');
  document.getElementById('page-title').textContent = PAGE_LABELS[page] || page;
  currentSection = page;

  if (page === 'bookings')   loadBookings();
  if (page === 'contacts')   loadContacts();
  if (page === 'galleries')  loadGalleries();
  if (page === 'reviews')    loadReviews();
  if (page === 'newsletter') loadNewsletter();
}

function refreshCurrent() { nav(currentSection); }

/* ── Modal helpers ──────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-bg').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); })
);

/* ══ DASHBOARD ═══════════════════════════════════════════ */
async function initDashboard() {
  try {
    const [bk, ct, nl] = await Promise.all([
      api('/api/bookings?limit=5'),
      api('/api/contact?limit=5'),
      api('/api/newsletter?limit=1'),
    ]);
    if (!bk || !ct) return;

    // Stats
    document.getElementById('s-bookings').textContent    = bk.total;
    document.getElementById('s-pending').textContent     = bk.bookings.filter(b => b.status === 'pending').length;
    document.getElementById('s-enquiries').textContent   = ct.contacts.filter(c => c.status === 'new').length;
    document.getElementById('s-subscribers').textContent = nl?.total ?? '—';

    // Badges
    const [pb, nc] = await Promise.all([
      api('/api/bookings?status=pending&limit=1'),
      api('/api/contact?status=new&limit=1'),
    ]);
    document.getElementById('badge-bookings').textContent = pb?.total ?? 0;
    document.getElementById('badge-contacts').textContent = nc?.total ?? 0;

    // Recent bookings
    document.getElementById('dash-bookings').innerHTML = bk.bookings.length
      ? bk.bookings.map(b => `
        <tr>
          <td class="td-mono">${esc(b.ref_code)}</td>
          <td class="td-primary">${esc(b.name)}</td>
          <td>${esc(b.service)}</td>
          <td>${esc(b.date)} <span class="td-sub">${esc(b.time_slot)}</span></td>
          <td><span class="badge badge-${b.status}">${b.status}</span></td>
          <td><button class="btn btn-ghost btn-sm" onclick="viewBooking(${b.id})">View</button></td>
        </tr>`).join('')
      : `<tr><td colspan="6"><div class="empty"><div class="empty-icon">📅</div><p>No bookings yet</p></div></td></tr>`;

    // Recent contacts
    document.getElementById('dash-contacts').innerHTML = ct.contacts.length
      ? ct.contacts.map(c => `
        <tr>
          <td class="td-primary">${esc(c.name)}</td>
          <td>${esc(c.email)}</td>
          <td>${esc(c.service || '—')}</td>
          <td><span class="badge badge-${c.status}">${c.status}</span></td>
          <td class="td-sub">${esc(c.created_at?.slice(0,10) ?? '')}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="viewContact(${c.id})">View</button></td>
        </tr>`).join('')
      : `<tr><td colspan="6"><div class="empty"><div class="empty-icon">💬</div><p>No enquiries yet</p></div></td></tr>`;

  } catch (e) { console.error('Dashboard error:', e.message); }
}

/* ══ BOOKINGS ════════════════════════════════════════════ */
async function loadBookings() {
  const search = document.getElementById('bk-search').value;
  const status = document.getElementById('bk-status').value;
  const date   = document.getElementById('bk-date').value;
  try {
    const d = await api(`/api/bookings?page=${bPage}&limit=15&search=${encodeURIComponent(search)}&status=${status}&date=${date}`);
    if (!d) return;

    document.getElementById('bk-tbody').innerHTML = d.bookings.length
      ? d.bookings.map(b => `
        <tr>
          <td class="td-mono">${esc(b.ref_code)}</td>
          <td>
            <div class="td-primary">${esc(b.name)}</div>
            <div class="td-sub">${esc(b.email)}</div>
          </td>
          <td>${esc(b.service)}</td>
          <td>
            <div>${esc(b.date)}</div>
            <div class="td-sub">${esc(b.time_slot)}</div>
          </td>
          <td style="color:var(--gold)">₹${(b.amount||0).toLocaleString('en-IN')}</td>
          <td><span class="badge badge-${b.status}">${b.status}</span></td>
          <td style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="viewBooking(${b.id})">View</button>
            <button class="btn btn-primary btn-sm" onclick="editBooking(${b.id},'${esc(b.status)}',${b.amount||0},'${esc(b.notes||'')}')">Edit</button>
            <a href="https://wa.me/${b.phone?.replace(/\D/g,'')}" target="_blank" class="btn btn-green btn-sm">WA</a>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="7"><div class="empty"><div class="empty-icon">📅</div><p>No bookings found</p></div></td></tr>`;

    const total = d.total, pages = Math.max(1, Math.ceil(total / 15));
    document.getElementById('bk-pag').innerHTML =
      `<button class="page-btn" onclick="bPage=Math.max(1,bPage-1);loadBookings()" ${bPage===1?'disabled':''}>← Prev</button>` +
      `<span class="page-info">Page ${bPage} / ${pages} · ${total} total</span>` +
      `<button class="page-btn" onclick="bPage=Math.min(${pages},bPage+1);loadBookings()" ${bPage>=pages?'disabled':''}>Next →</button>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function viewBooking(id) {
  try {
    const d = await api('/api/bookings/' + id);
    if (!d) return;
    const b = d.booking;
    document.getElementById('modal-booking-body').innerHTML = `
      <div class="detail-row"><div class="detail-label">Ref Code</div><div class="detail-value td-mono">${esc(b.ref_code)}</div></div>
      <div class="detail-row"><div class="detail-label">Service</div><div class="detail-value">${esc(b.service)}</div></div>
      <div class="detail-row"><div class="detail-label">Date & Time</div><div class="detail-value">${esc(b.date)} at ${esc(b.time_slot)}</div></div>
      <div class="detail-row"><div class="detail-label">Client</div><div class="detail-value td-primary">${esc(b.name)}</div></div>
      <div class="detail-row"><div class="detail-label">Phone</div><div class="detail-value"><a href="tel:${esc(b.phone)}" style="color:var(--gold)">${esc(b.phone)}</a></div></div>
      <div class="detail-row"><div class="detail-label">Email</div><div class="detail-value"><a href="mailto:${esc(b.email)}" style="color:var(--gold)">${esc(b.email)}</a></div></div>
      <div class="detail-row"><div class="detail-label">Occasion</div><div class="detail-value">${esc(b.occasion||'—')}</div></div>
      <div class="detail-row"><div class="detail-label">Notes</div><div class="detail-value" style="white-space:pre-wrap">${esc(b.notes||'—')}</div></div>
      <div class="detail-row"><div class="detail-label">Amount</div><div class="detail-value" style="color:var(--gold);font-weight:700">₹${(b.amount||0).toLocaleString('en-IN')}</div></div>
      <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value"><span class="badge badge-${b.status}">${b.status}</span></div></div>
      <div class="detail-row"><div class="detail-label">Booked On</div><div class="detail-value td-sub">${esc(b.created_at)}</div></div>
      <div class="action-row">
        <a href="https://wa.me/${(b.phone||'').replace(/\D/g,'')}" target="_blank" class="btn btn-green btn-sm">💬 WhatsApp</a>
        <a href="mailto:${esc(b.email)}" class="btn btn-ghost btn-sm">📧 Email</a>
        <button class="btn btn-primary btn-sm" onclick="closeModal('modal-booking');editBooking(${b.id},'${esc(b.status)}',${b.amount||0},'${esc(b.notes||'')}')">✏️ Edit</button>
      </div>`;
    openModal('modal-booking');
  } catch (e) { toast(e.message, 'error'); }
}

function editBooking(id, status, amount, notes) {
  _editBookingId = id;
  document.getElementById('ub-status').value = status;
  document.getElementById('ub-amount').value = amount;
  document.getElementById('ub-notes').value  = notes;
  openModal('modal-update-booking');
}

async function submitUpdateBooking() {
  if (!_editBookingId) return;
  try {
    await api('/api/bookings/' + _editBookingId, {
      method: 'PATCH',
      body: JSON.stringify({
        status: document.getElementById('ub-status').value,
        amount: parseFloat(document.getElementById('ub-amount').value) || 0,
        notes:  document.getElementById('ub-notes').value,
      }),
    });
    toast('Booking updated!', 'success');
    closeModal('modal-update-booking');
    loadBookings();
    initDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

/* ══ CONTACTS ════════════════════════════════════════════ */
async function loadContacts() {
  const status = document.getElementById('ct-status').value;
  try {
    const d = await api(`/api/contact?status=${status}&limit=100`);
    if (!d) return;
    document.getElementById('ct-tbody').innerHTML = d.contacts.length
      ? d.contacts.map(c => `
        <tr>
          <td class="td-primary">${esc(c.name)}</td>
          <td><a href="mailto:${esc(c.email)}" style="color:var(--gold)">${esc(c.email)}</a></td>
          <td>${esc(c.phone||'—')}</td>
          <td>${esc(c.service||'—')}</td>
          <td><span class="badge badge-${c.status}">${c.status}</span></td>
          <td class="td-sub">${esc(c.created_at?.slice(0,10)??'')}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="viewContact(${c.id})">View</button>
            ${c.phone ? `<a href="https://wa.me/${c.phone.replace(/\D/g,'')}" target="_blank" class="btn btn-green btn-sm">WA</a>` : ''}
          </td>
        </tr>`).join('')
      : `<tr><td colspan="7"><div class="empty"><div class="empty-icon">💬</div><p>No enquiries found</p></div></td></tr>`;
  } catch (e) { toast(e.message, 'error'); }
}

// Store contacts by id for modal
const _contacts = {};
async function viewContact(id) {
  try {
    // Fetch all and find by id (no dedicated endpoint, use list)
    const d = await api(`/api/contact?limit=200`);
    if (!d) return;
    const c = d.contacts.find(x => x.id === id);
    if (!c) { toast('Contact not found', 'error'); return; }

    document.getElementById('modal-contact-body').innerHTML = `
      <div class="detail-row"><div class="detail-label">Name</div><div class="detail-value td-primary">${esc(c.name)}</div></div>
      <div class="detail-row"><div class="detail-label">Email</div><div class="detail-value"><a href="mailto:${esc(c.email)}" style="color:var(--gold)">${esc(c.email)}</a></div></div>
      <div class="detail-row"><div class="detail-label">Phone</div><div class="detail-value"><a href="tel:${esc(c.phone)}" style="color:var(--gold)">${esc(c.phone||'—')}</a></div></div>
      <div class="detail-row"><div class="detail-label">Service</div><div class="detail-value">${esc(c.service||'—')}</div></div>
      <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value"><span class="badge badge-${c.status}">${c.status}</span></div></div>
      <div class="detail-row"><div class="detail-label">Received</div><div class="detail-value td-sub">${esc(c.created_at)}</div></div>
      <div class="detail-row"><div class="detail-label">Message</div><div class="detail-value"></div></div>
      <div class="msg-box">${esc(c.message)}</div>
      <div class="action-row">
        <a href="mailto:${esc(c.email)}?subject=Re: Your enquiry at FOTO WORLD" class="btn btn-primary btn-sm">📧 Reply via Email</a>
        ${c.phone ? `<a href="https://wa.me/${c.phone.replace(/\D/g,'')}" target="_blank" class="btn btn-green btn-sm">💬 WhatsApp</a>` : ''}
        <select class="filter-select" style="font-size:11px;padding:4px 10px" onchange="updateContactStatus(${c.id},this.value)">
          <option value="">Change status…</option>
          <option value="new"${c.status==='new'?' selected':''}>New</option>
          <option value="read"${c.status==='read'?' selected':''}>Read</option>
          <option value="replied"${c.status==='replied'?' selected':''}>Replied</option>
          <option value="archived"${c.status==='archived'?' selected':''}>Archived</option>
        </select>
      </div>`;
    openModal('modal-contact');
    if (c.status === 'new') updateContactStatus(c.id, 'read');
  } catch (e) { toast(e.message, 'error'); }
}

async function updateContactStatus(id, status) {
  if (!status) return;
  try {
    await api('/api/contact/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
    toast('Status → ' + status, 'info');
    loadContacts();
    initDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

/* ══ GALLERIES ═══════════════════════════════════════════ */
async function loadGalleries() {
  try {
    const d = await api('/api/galleries');
    if (!d) return;
    document.getElementById('gl-tbody').innerHTML = d.galleries.length
      ? d.galleries.map(g => {
          const expired = g.expires_at && new Date(g.expires_at) < new Date();
          return `
          <tr>
            <td class="td-mono">${esc(g.code)}</td>
            <td class="td-primary">${esc(g.client_name)}</td>
            <td>${esc(g.session_name)}</td>
            <td>${esc(g.session_date)}</td>
            <td style="color:var(--gold)">${g.photo_count}</td>
            <td class="td-sub" style="color:${expired?'var(--red)':'var(--text3)'}">${g.expires_at||'Never'}</td>
            <td><span class="badge ${expired?'badge-expired':'badge-active'}">${expired?'Expired':'Active'}</span></td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-danger btn-sm" onclick="deleteGallery(${g.id},'${esc(g.code)}')">Delete</button>
            </td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="8"><div class="empty"><div class="empty-icon">🖼️</div><p>No galleries yet. Create one to get started.</p></div></td></tr>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function createGallery() {
  const body = {
    code:         document.getElementById('gc-code').value.trim().toUpperCase(),
    password:     document.getElementById('gc-pass').value.trim(),
    client_name:  document.getElementById('gc-client').value.trim(),
    session_name: document.getElementById('gc-session').value.trim(),
    session_date: document.getElementById('gc-date').value,
    expires_at:   document.getElementById('gc-expires').value || undefined,
  };
  if (!body.code || !body.password || !body.client_name || !body.session_name || !body.session_date) {
    toast('Please fill all required fields', 'error'); return;
  }
  try {
    await api('/api/galleries', { method: 'POST', body: JSON.stringify(body) });
    toast(`Gallery ${body.code} created! Password: ${body.password}`, 'success');
    closeModal('modal-new-gallery');
    ['gc-code','gc-pass','gc-client','gc-session','gc-date','gc-expires'].forEach(id => document.getElementById(id).value = '');
    loadGalleries();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteGallery(id, code) {
  if (!confirm(`Delete gallery "${code}" and ALL its photos?\n\nThis cannot be undone.`)) return;
  try {
    await api('/api/galleries/' + id, { method: 'DELETE' });
    toast('Gallery deleted', 'success');
    loadGalleries();
  } catch (e) { toast(e.message, 'error'); }
}

/* ══ REVIEWS ═════════════════════════════════════════════ */
async function loadReviews() {
  const filter = document.getElementById('rv-filter').value;
  try {
    const d = await api('/api/reviews/all');
    if (!d) return;
    let reviews = d.reviews;
    if (filter === 'pending')  reviews = reviews.filter(r => !r.approved);
    if (filter === 'approved') reviews = reviews.filter(r =>  r.approved);

    document.getElementById('rv-tbody').innerHTML = reviews.length
      ? reviews.map(r => `
        <tr>
          <td class="td-primary">${esc(r.name)}</td>
          <td>${esc(r.service)}</td>
          <td><span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></td>
          <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--text3)">${esc(r.review_text)}</td>
          <td>
            <button class="btn btn-sm ${r.verified?'btn-green':'btn-ghost'}" onclick="toggleReview(${r.id},'verified',${r.verified?0:1})">
              ${r.verified ? '✓ Verified' : 'Verify'}
            </button>
          </td>
          <td>
            <button class="btn btn-sm ${r.approved?'btn-green':'btn-ghost'}" onclick="toggleReview(${r.id},'approved',${r.approved?0:1})">
              ${r.approved ? '✓ Live' : 'Approve'}
            </button>
          </td>
          <td class="td-sub">${esc(r.created_at?.slice(0,10)??'')}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteReview(${r.id})">Delete</button>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="8"><div class="empty"><div class="empty-icon">⭐</div><p>No reviews found</p></div></td></tr>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleReview(id, field, val) {
  try {
    await api('/api/reviews/' + id, { method: 'PATCH', body: JSON.stringify({ [field]: val }) });
    toast(`Review ${field} updated`, 'success');
    loadReviews();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteReview(id) {
  if (!confirm('Delete this review? This cannot be undone.')) return;
  try {
    await api('/api/reviews/' + id, { method: 'DELETE' });
    toast('Review deleted', 'success');
    loadReviews();
  } catch (e) { toast(e.message, 'error'); }
}

/* ══ NEWSLETTER ══════════════════════════════════════════ */
async function loadNewsletter() {
  try {
    const d = await api('/api/newsletter?limit=500');
    if (!d) return;
    document.getElementById('nl-count').textContent = `${d.total} active subscribers`;
    document.getElementById('nl-tbody').innerHTML = d.subscribers.length
      ? d.subscribers.map((s, i) => `
        <tr>
          <td class="td-sub">${i + 1}</td>
          <td class="td-primary">${esc(s.email)}</td>
          <td class="td-sub">${esc(s.created_at?.slice(0,10)??'')}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="unsubscribe(${s.id},'${esc(s.email)}')">Remove</button>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="4"><div class="empty"><div class="empty-icon">📧</div><p>No subscribers yet</p></div></td></tr>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function unsubscribe(id, email) {
  if (!confirm(`Remove ${email} from newsletter?`)) return;
  try {
    await api('/api/newsletter/' + id, { method: 'DELETE' });
    toast('Subscriber removed', 'success');
    loadNewsletter();
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Enter key on login ─────────────────────────────────── */
document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-password').focus(); });

/* ── Bootstrap ──────────────────────────────────────────── */
// Show loader briefly, then try to restore session from cookie
window.addEventListener('load', () => {
  setTimeout(() => tryRestoreSession(), 400);
});
