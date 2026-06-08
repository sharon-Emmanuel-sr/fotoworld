/* ============================================================
   FOTO WORLD — Seed Script (sql.js version)
   Run: node server/seed.js
   ============================================================ */
'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDB, get, run } = require('./database');

async function seed() {
  await initDB();
  console.log('\n🌱  Seeding FOTO WORLD database...\n');

  // ── Admin ──────────────────────────────────────────────────
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'FotoWorld@2024';

  const existing = get('SELECT id FROM admins WHERE username = ?', [adminUser]);
  if (existing) {
    console.log('ℹ️   Admin already exists — skipping');
  } else {
    run('INSERT INTO admins (username, password) VALUES (?, ?)',
      [adminUser, bcrypt.hashSync(adminPass, 12)]);
    console.log(`✅  Admin created: ${adminUser} / ${adminPass}`);
  }

  // ── Demo Gallery ───────────────────────────────────────────
  const demoCode = 'DEMO2024';
  const existingGallery = get('SELECT id FROM galleries WHERE code = ?', [demoCode]);
  if (existingGallery) {
    console.log('ℹ️   Demo gallery already exists — skipping');
  } else {
    run(
      'INSERT INTO galleries (code,password,client_name,session_name,session_date) VALUES (?,?,?,?,?)',
      [demoCode, bcrypt.hashSync('foto2024', 10), 'Priya & Karthik', 'Priya & Karthik Wedding', '2024-05-12']
    );
    console.log('✅  Demo gallery created: code=DEMO2024 / password=foto2024');
  }

  // ── Sample Bookings ────────────────────────────────────────
  const bookingCount = (get('SELECT COUNT(*) as cnt FROM bookings') || {}).cnt || 0;
  if (bookingCount === 0) {
    const bookings = [
      ['FW-2024-A1B2','Wedding Photography','2024-11-15','10:00 AM','Keerthana & Sakthi','+919876500001','keerthana@example.com','completed',45000],
      ['FW-2024-C3D4','Portrait Session',   '2024-12-01','2:00 PM', 'Ramya Chandrasekhar','+919876500002','ramya@example.com',   'confirmed',5000],
      ['FW-2025-E5F6','Baby Photography',   '2025-01-10','11:00 AM','Lakshmi & Suresh',  '+919876500003','lakshmi@example.com', 'pending',  7000],
      ['FW-2025-G7H8','Cinematography',     '2025-02-14','9:00 AM', 'Anand Natarajan',   '+919876500004','anand@example.com',   'confirmed',35000],
      ['FW-2025-I9J0','Pre-Wedding Shoot',  '2025-03-05','4:00 PM', 'Priya Rajan',       '+919876500005','priya@example.com',   'pending',  9000],
    ];
    bookings.forEach(b => run(
      'INSERT INTO bookings (ref_code,service,date,time_slot,name,phone,email,status,amount) VALUES (?,?,?,?,?,?,?,?,?)', b
    ));
    console.log(`✅  ${bookings.length} sample bookings inserted`);
  }

  // ── Sample Reviews ─────────────────────────────────────────
  const reviewCount = (get('SELECT COUNT(*) as cnt FROM reviews') || {}).cnt || 0;
  if (reviewCount === 0) {
    const reviews = [
      ['Keerthana & Sakthi','Wedding Photography',5,'The most beautiful wedding album we have ever seen. Every frame is a piece of art. FOTO WORLD captured emotions we did not even know we were feeling. Truly world-class.',1],
      ['Ramya Chandrasekhar','Portrait Session',5,'Deepa and the team made me feel so comfortable from the very first minute. The portraits came out absolutely stunning — professional, elegant, and so natural.',1],
      ['Anand Natarajan','Cinematography',5,'Our wedding film is pure cinema. Every time we watch it we relive the magic of that day. The editing, music selection, colour grading — breathtaking.',1],
      ['Lakshmi & Suresh','Baby Photography',5,'They captured our newborn with such gentleness and creativity. The props, lighting, patience with our baby — everything was perfect. Thank you FOTO WORLD!',1],
      ['Priya Rajan','Portrait Session',4,'Amazing quality prints and very professional service. The studio is stunning. Minor delay in delivery but the final photos were absolutely worth the wait.',1],
      ['Dharshan Kumar','Event Photography',5,'Covered our company annual day event. The team was professional, unobtrusive and delivered 400+ stunning photos within 3 days. Highly recommend!',1],
    ];
    reviews.forEach(r => run(
      'INSERT INTO reviews (name,service,rating,review_text,verified,approved) VALUES (?,?,?,?,?,1)', r
    ));
    console.log(`✅  ${reviews.length} sample reviews inserted`);
  }

  // ── Sample Contacts ────────────────────────────────────────
  const contactCount = (get('SELECT COUNT(*) as cnt FROM contacts') || {}).cnt || 0;
  if (contactCount === 0) {
    run('INSERT INTO contacts (name,email,phone,service,message,status) VALUES (?,?,?,?,?,?)',
      ['Meena Selvam','meena@example.com','+919876600001','Wedding Photography',
       'Hi, I am planning my wedding for March 2025. Can you share your wedding photography packages?','new']);
    run('INSERT INTO contacts (name,email,phone,service,message,status) VALUES (?,?,?,?,?,?)',
      ['Ravi Shankar','ravi@example.com','+919876600002','Printing',
       'I need large format canvas prints for my office. What sizes and prices do you offer?','read']);
    console.log('✅  2 sample contacts inserted');
  }

  console.log('\n🎉  Database seeded successfully!\n');
  console.log('   Admin:        admin / FotoWorld@2024');
  console.log('   Gallery code: DEMO2024 / foto2024');
  console.log('   Server:       http://localhost:3000');
  console.log('   Admin panel:  http://localhost:3000/admin\n');
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
