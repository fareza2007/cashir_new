// ============================================
// CASHIRQU - Application Logic
// ============================================

// --- Default Menu Data ---
const DEFAULT_MENU = [];

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyBRlpXDCFRzLLFh8D-RlMkwIj1-kO9MjcQ",
  authDomain: "kasir-warung-29a57.firebaseapp.com",
  projectId: "kasir-warung-29a57",
  storageBucket: "kasir-warung-29a57.firebasestorage.app",
  messagingSenderId: "474869518431",
  appId: "1:474869518431:web:bf88043be1f88f8c4a4bea"
};
let db = null;
let auth = null;
let unsubscribeSnapshot = null;

// --- EmailJS Config ---
const EMAILJS_SERVICE_ID  = 'service_z60uuh3';
const EMAILJS_TEMPLATE_ID = 'un0o4i4';
const EMAILJS_PUBLIC_KEY  = '32l231VSYp-GBDcsJ';

try {
  firebase.initializeApp(firebaseConfig);
  db   = firebase.firestore();
  auth = firebase.auth();
} catch (e) {
  console.error("Firebase init failed:", e);
  alert("Sistem database gagal dimuat. Pastikan Anda terhubung ke internet.");
}

// --- App State ---
const state = {
  menu: [],
  cart: [],
  transactions: [],
  expenses: [],
  activeCategory: 'Semua',
  activePage: 'kasir',
  dashboardPeriod: 'hari',
  nextMenuId: 100,
  nextTxnId: 1,
  
  // Setup & Role State
  shopName: 'cashirqu',
  shopLogo: null,
  role: null,
  token: null,
  isSetup: false,
  uid: null,
  userEmail: null,
  userPhotoURL: null,
  employeeCode: null,
};

// --- Helper Functions ---
function formatRupiah(num) {
  return 'Rp ' + num.toLocaleString('id-ID');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getCategories() {
  const cats = [...new Set(state.menu.map(m => m.category))];
  return ['Semua', ...cats];
}

// --- Data Storage ---
function saveData() {
  if (!state.token || !db) return;
  
  db.collection('shops').doc(state.token).set({
    shopName: state.shopName,
    menu: state.menu,
    transactions: state.transactions,
    expenses: state.expenses || [],
    nextMenuId: state.nextMenuId,
    nextTxnId: state.nextTxnId,
    employeeCode: state.employeeCode,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
  .catch(err => console.error("Firebase save error:", err));
}

function syncFromFirebase() {
  if (!state.token || !db) return;
  
  if (unsubscribeSnapshot) unsubscribeSnapshot();

  unsubscribeSnapshot = db.collection('shops').doc(state.token).onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      state.shopName     = data.shopName     || state.shopName;
      state.menu         = data.menu         || [];
      state.transactions = data.transactions || [];
      state.expenses     = data.expenses     || [];
      state.nextMenuId   = data.nextMenuId   || 100;
      state.nextTxnId    = data.nextTxnId    || 1;
      state.employeeCode = data.employeeCode || state.employeeCode;
      
      const shopTitle = document.getElementById('shop-title-display');
      if (shopTitle) shopTitle.textContent = state.shopName;
      
      if (typeof renderCategories === 'function') renderCategories();
      if (typeof renderMenuGrid   === 'function') renderMenuGrid();
      if (typeof renderHistory    === 'function') renderHistory();
      if (state.activePage === 'keuangan'    && typeof renderDashboard  === 'function') renderDashboard();
      if (state.activePage === 'kelola-menu' && typeof renderMenuManage === 'function') renderMenuManage();
    }
  }, (err) => console.error("Firebase sync error:", err));
}

// --- Generate Employee Code: 8 digit angka ---
function generateEmployeeCode() {
  // Hasilkan angka 8 digit (10000000 - 99999999)
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

// --- Send Email via EmailJS ---
function sendEmployeeCodeEmail(toEmail, shopName, employeeCode) {
  if (!window.emailjs) return;
  emailjs.init(EMAILJS_PUBLIC_KEY);
  const templateParams = { to_email: toEmail, shop_name: shopName, employee_code: employeeCode };
  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
    .then(() => console.log('Email terkirim ke', toEmail))
    .catch(err => console.warn('EmailJS error:', err));
}


// ============================================================
// === SUBSCRIPTION / PAYWALL SYSTEM ===
// ============================================================

// Tampilkan pricing screen
function showPricingScreen() {
  document.getElementById('welcome-overlay').classList.add('hidden');
  document.getElementById('pricing-screen').classList.remove('hidden');
}

// Sembunyikan pricing screen
function hidePricingScreen() {
  document.getElementById('pricing-screen').classList.add('hidden');
}

// Cek subscription dari Firestore berdasarkan UID
async function checkAndShowSubscription() {
  // === ADMIN BYPASS ===
  const adminEmails = ['hakaikfareza@gmail.com', 'jagijaga367@gmail.com', 'rstccoffee@gmail.com'];
  if (adminEmails.includes(state.userEmail)) {
    enterApp();
    return;
  }
  // ====================
  try {
    const subDoc = await db.collection('subscriptions').doc(state.uid).get();
    if (subDoc.exists) {
      const sub = subDoc.data();
      const now = new Date();
      // Lifetime tidak punya expiresAt
      const isLifetime = sub.plan === 'lifetime';
      const isActive = sub.status === 'active' || sub.status === 'trial';
      const notExpired = isLifetime || !sub.expiresAt || sub.expiresAt.toDate() > now;
      if (isActive && notExpired) {
        hidePricingScreen();
        enterApp();
        return;
      }
    }
    // Belum subscribe atau expired → tampilkan pricing
    // Cek apakah free trial pernah digunakan
    const trialBtn = document.getElementById('btn-start-trial');
    const trialBanner = document.getElementById('trial-banner');
    if (subDoc.exists) {
      // Sudah pernah trial/expired → sembunyikan tombol trial
      if (trialBanner) trialBanner.style.display = 'none';
    }
    showPricingScreen();
  } catch (err) {
    console.warn('Subscription check error:', err);
    // Jika error, tetap tampilkan pricing
    showPricingScreen();
  }
}

// Mulai Free Trial 7 hari
async function startFreeTrial() {
  if (!state.uid) return;
  const btn = document.getElementById('btn-start-trial');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Memproses...'; }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 hari
  try {
    await db.collection('subscriptions').doc(state.uid).set({
      status:    'trial',
      plan:      'trial',
      email:     state.userEmail,
      startDate: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
      orderId:   'trial_' + state.uid,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    hidePricingScreen();
    enterApp();
  } catch (err) {
    console.error('Trial error:', err);
    if (btn) { btn.disabled = false; btn.textContent = 'Mulai Gratis'; }
    alert('Gagal memulai trial. Coba lagi.');
  }
}

// Buat transaksi Midtrans
async function createMidtransPayment(plan) {
  if (!state.uid || !state.userEmail) return;
  const planBtns = document.querySelectorAll('.btn-plan, .btn-trial');
  planBtns.forEach(b => b.disabled = true);
  const statusMsg = document.getElementById('pricing-status-msg');
  if (statusMsg) statusMsg.textContent = '⏳ Menyiapkan pembayaran...';

  const orderId = `cashirqu-${plan}-${state.uid.slice(0,8)}-${Date.now()}`;

  try {
    const resp = await fetch('/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.userEmail, plan, orderId, uid: state.uid }),
    });
    const data = await resp.json();
    if (!data.snapToken) throw new Error(data.error || 'Gagal membuat transaksi');

    if (statusMsg) statusMsg.textContent = '';
    planBtns.forEach(b => b.disabled = false);

    // Buka popup Midtrans Snap
    window.snap.pay(data.snapToken, {
      onSuccess: async (result) => {
        if (statusMsg) statusMsg.textContent = '✅ Pembayaran berhasil! Mengaktifkan akun...';
        await activateSubscription(plan, orderId);
      },
      onPending: (result) => {
        if (statusMsg) statusMsg.textContent = '⏳ Pembayaran pending. Selesaikan pembayaran Anda.';
      },
      onError: (result) => {
        if (statusMsg) statusMsg.textContent = '❌ Pembayaran gagal. Coba lagi.';
      },
      onClose: () => {
        if (statusMsg) statusMsg.textContent = 'Pembayaran dibatalkan.';
      },
    });
  } catch (err) {
    console.error('Payment error:', err);
    if (statusMsg) statusMsg.textContent = '❌ ' + (err.message || 'Terjadi kesalahan');
    planBtns.forEach(b => b.disabled = false);
  }
}

// Aktifkan subscription setelah pembayaran
async function activateSubscription(plan, orderId) {
  // Verifikasi dulu ke server
  try {
    const vResp = await fetch(`/api/verify-payment?orderId=${encodeURIComponent(orderId)}`);
    const vData = await vResp.json();
    if (!vData.isPaid) {
      document.getElementById('pricing-status-msg').textContent = '⚠️ Pembayaran belum terkonfirmasi. Tunggu sebentar.';
      return;
    }
  } catch(e) {
    console.warn('Verify error, continuing anyway:', e);
  }

  const now = new Date();
  let expiresAt = null;
  if (plan === 'monthly') expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (plan === 'yearly')  expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  // lifetime → expiresAt tetap null

  await db.collection('subscriptions').doc(state.uid).set({
    status:    'active',
    plan:      plan,
    email:     state.userEmail,
    startDate: firebase.firestore.FieldValue.serverTimestamp(),
    expiresAt: expiresAt ? firebase.firestore.Timestamp.fromDate(expiresAt) : null,
    orderId:   orderId,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  hidePricingScreen();
  enterApp();
}

// Logout dari halaman pricing
async function pricingLogout() {
  await auth.signOut();
  hidePricingScreen();
  document.getElementById('welcome-overlay').classList.remove('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  const btn = document.getElementById('btn-google-login');
  if (btn) { btn.disabled = false; btn.textContent = ''; }
}

// ============================================================

// === AUTH: LOGIN BOS DENGAN GOOGLE ===
async function loginWithGoogle() {
  const btn = document.getElementById('btn-google-login');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Menghubungkan...'; }
  
  try {
    let user = null;

    // Di dalam APK (Capacitor), gunakan Native Google Sign-In
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      const FirebaseAuthentication = window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication;
      if (!FirebaseAuthentication) {
        throw new Error('Native Google Sign-In tidak tersedia.');
      }
      // Tampilkan native Google account picker dialog
      const result = await FirebaseAuthentication.signInWithGoogle();
      // Gunakan idToken untuk login ke Firebase Web SDK
      const credential = firebase.auth.GoogleAuthProvider.credential(
        result.credential && result.credential.idToken
      );
      const webResult = await auth.signInWithCredential(credential);
      user = webResult.user;
    } else {
      // Di web browser biasa, gunakan popup
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await auth.signInWithPopup(provider);
      user = result.user;
    }


    
    // Cek apakah warung sudah ada di Firestore
    const shopDoc = await db.collection('shops').doc(user.uid).get();
    
    if (shopDoc.exists) {
      // === LOGIN ULANG: Langsung masuk ===
      const data = shopDoc.data();
      state.uid          = user.uid;
      state.userEmail    = user.email;
      state.userPhotoURL = user.photoURL;
      state.role         = 'Bos';
      state.token        = user.uid;
      state.shopName     = data.shopName;
      
      // Validasi: kode harus tepat 8 digit angka
      const isValidCode = data.employeeCode && /^\d{8}$/.test(data.employeeCode);
      if (!isValidCode) {
        // Kode lama tidak valid → buat kode baru 8 digit
        const newCode = generateEmployeeCode();
        state.employeeCode = newCode;
        db.collection('shops').doc(user.uid).update({ employeeCode: newCode });
      } else {
        state.employeeCode = data.employeeCode;
        state.shopLogo     = data.shopLogo || null;
      }
      


      // Cek subscription sebelum masuk app
      await checkAndShowSubscription();
    } else {
      // === PERTAMA KALI: Tampilkan form nama warung ===
      state.uid          = user.uid;
      state.userEmail    = user.email;
      state.userPhotoURL = user.photoURL;
      // Cek subscription meski belum buat warung (bisa trial dulu)
      // Setelah buat warung baru, akan enterApp() langsung
      showNewShopForm(user.displayName);
    }
  } catch (err) {
    console.error('Google Sign-In error:', err);
    if (btn) { btn.disabled = false; btn.innerHTML = '<img src="https://www.google.com/favicon.ico" style="width:18px;height:18px;"> Masuk dengan Google'; }
    if (err.code !== 'auth/popup-closed-by-user') {
      alert('Gagal login: ' + err.message);
    }
  }
}

function showNewShopForm(displayName) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('new-shop-screen').classList.remove('hidden');
  const nameInput = document.getElementById('new-shop-name');
  if (nameInput) nameInput.value = displayName ? displayName + ' Warung' : '';
  nameInput.focus();
}

// === LOGO WARUNG ===
// Kompres gambar menjadi base64 kecil (max 200x200)
function compressImageToBase64(file, maxSize = 200) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Preview logo di halaman pembuatan warung
async function previewShopLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const base64 = await compressImageToBase64(file);
  state.shopLogo = base64;
  const preview = document.getElementById('logo-upload-preview');
  const icon = document.getElementById('logo-upload-icon');
  const img = document.getElementById('logo-upload-img');
  if (icon) icon.style.display = 'none';
  if (img) { img.src = base64; img.style.display = 'block'; }
  if (preview) preview.style.border = '2px solid #3dbf8a';
}

// Trigger upload logo dari header (hanya Bos)
function triggerLogoUpload() {
  document.getElementById('header-logo-input').click();
}

// Ganti logo dari header
async function changeShopLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const base64 = await compressImageToBase64(file);
  state.shopLogo = base64;
  applyShopLogo();
  // Simpan ke Firestore
  if (state.uid) {
    db.collection('shops').doc(state.uid).update({ shopLogo: base64 })
      .catch(err => console.warn('Gagal simpan logo:', err));
  }
}

// Terapkan logo ke header
function applyShopLogo() {
  const defaultLogo = document.getElementById('shop-logo-default');
  const img         = document.getElementById('shop-logo-img');
  if (!img) return;
  if (state.shopLogo) {
    // Tampilkan logo custom, sembunyikan default
    if (defaultLogo) defaultLogo.style.display = 'none';
    img.src = state.shopLogo;
    img.style.display = 'block';
  } else {
    // Tampilkan logo default cashirqu
    if (defaultLogo) defaultLogo.style.display = 'block';
    img.style.display = 'none';
  }
}

async function createNewShop() {
  const shopName = document.getElementById('new-shop-name').value.trim();
  if (!shopName) { alert('Nama warung tidak boleh kosong!'); return; }
  
  const btn = document.getElementById('btn-create-shop');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan...'; }
  
  const employeeCode = generateEmployeeCode();
  state.role         = 'Bos';
  state.token        = state.uid;
  state.shopName     = shopName;
  state.employeeCode = employeeCode;
  
  // Simpan ke Firestore (termasuk logo jika ada)
  await db.collection('shops').doc(state.uid).set({
    shopName:      shopName,
    shopLogo:      state.shopLogo || null,
    employeeCode:  employeeCode,
    ownerEmail:    state.userEmail,
    menu:          [],
    transactions:  [],
    expenses:      [],
    nextMenuId:    100,
    nextTxnId:     1,
    createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
  });
  
  // Kirim kode ke Gmail Bos
  sendEmployeeCodeEmail(state.userEmail, shopName, employeeCode);
  
  enterApp();
}

// === AUTH: LOGIN KARYAWAN DENGAN KODE ===
async function loginAsKaryawan(autoCode = null) {
  // Jika dipanggil otomatis, lewati input DOM, jika tidak ambil dari input
  const code = autoCode && typeof autoCode === 'string' ? autoCode : document.getElementById('karyawan-code-input').value.trim();
  if (!code) { alert('Masukkan kode karyawan terlebih dahulu!'); return; }
  
  const btn = document.getElementById('btn-karyawan-login');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Memeriksa...'; }
  
  try {
    const snapshot = await db.collection('shops').where('employeeCode', '==', code).limit(1).get();
    
    if (!snapshot.empty) {
      const shopDoc = snapshot.docs[0];
      const data    = shopDoc.data();
      
      state.role         = 'Karyawan';
      state.token        = shopDoc.id;
      state.shopName     = data.shopName;
      state.employeeCode = data.employeeCode;
      state.uid          = null;
      
      // Simpan untuk auto login
      localStorage.setItem('kasir_karyawanCode', code);
      
      enterApp();
    } else {
      alert('Kode tidak ditemukan! Minta kode yang benar dari Bos Anda.');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Masuk'; }
    }
  } catch (err) {
    console.error('Karyawan login error:', err);
    alert('Gagal memeriksa kode. Periksa koneksi internet Anda.\nError: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = '✅ Masuk'; }
  }
}

// === MASUK KE APLIKASI ===
function enterApp() {
  document.getElementById('welcome-overlay').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  
  // Update header
  const shopTitle = document.getElementById('shop-title-display');
  if (shopTitle) shopTitle.textContent = state.shopName;
  
  // Update user badge
  const roleBadge  = document.getElementById('role-badge-text');
  const tokenBadge = document.getElementById('token-badge-text');
  const userAvatar = document.getElementById('user-avatar');
  
  if (roleBadge)  roleBadge.textContent  = state.role === 'Bos' ? '💼 Bos' : '🧑‍🍳 Karyawan';
  if (tokenBadge) tokenBadge.textContent = 'Kode: ' + (state.employeeCode || '-');
  if (userAvatar && state.userPhotoURL) {
    userAvatar.src   = state.userPhotoURL;
    userAvatar.style.display = 'block';
  }
  
  applyShopLogo();
  applyRoleRestrictions();
  syncFromFirebase();
  renderCategories();
  renderMenuGrid();
  renderCart();
}

// === COPY KODE KARYAWAN ===
function copyEmployeeToken() {
  if (!state.employeeCode) return;
  navigator.clipboard.writeText(state.employeeCode)
    .then(() => alert('Kode karyawan "' + state.employeeCode + '" berhasil disalin! Bagikan ke karyawan Anda.'))
    .catch(() => alert('Kode karyawan Anda: ' + state.employeeCode));
}

// (applyRoleRestrictions moved to bottom)

function logout() {
  if (!confirm('Yakin ingin keluar?')) return;
  auth.signOut().then(() => {
    localStorage.removeItem('kasir_karyawanCode');
    localStorage.removeItem('kasir_bosCode');
    location.reload();
  });
}

// --- Navigation ---
function switchPage(page) {
  if (state.role === 'Karyawan' && page === 'keuangan') {
    alert('Akses Ditolak! Bagian Keuangan hanya dapat diakses oleh Bos.');
    return;
  }
  state.activePage = page;
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.add('active');
  const activeNavTab = document.querySelector(`.nav-tab[data-page="${page}"]`);
  if (activeNavTab) activeNavTab.classList.add('active');

  // Sync mobile bottom nav
  document.querySelectorAll('.mbn-tab').forEach(t => t.classList.remove('active'));
  const activeMbnTab = document.querySelector(`.mbn-tab[data-page="${page}"]`);
  if (activeMbnTab) activeMbnTab.classList.add('active');

  if (page === 'keuangan') renderDashboard();
  if (page === 'riwayat') renderHistory();
  if (page === 'menu') renderMenuManage();
}

// --- Menu Rendering ---
function renderMenuGrid() {
  const grid = document.getElementById('menu-grid');
  const filtered = state.activeCategory === 'Semua'
    ? state.menu
    : state.menu.filter(m => m.category === state.activeCategory);

  if (state.menu.length === 0) {
    grid.innerHTML = `
      <div class="cart-empty" style="grid-column:1/-1;padding:60px 20px;">
        <span class="empty-icon" style="font-size:4rem;">🍽️</span>
        <p style="font-size:1rem;font-weight:600;margin-top:8px;">Belum ada menu</p>
        <p style="font-size:0.82rem;margin-top:6px;">Tambahkan menu warung Anda terlebih dahulu</p>
        <button class="btn btn-primary" onclick="switchPage('menu')" style="margin-top:16px;flex:0;padding:12px 24px;">
          ➕ Tambah Menu Sekarang
        </button>
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1;"><span class="empty-icon">📋</span><p>Tidak ada menu di kategori ini</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const cartItem = state.cart.find(c => c.menuId === item.id);
    let controlHtml = '';
    
    if (!cartItem) {
      controlHtml = `<button class="btn-add-inline" onclick="event.stopPropagation(); addToCart(${item.id})"><span style="color:var(--accent-primary)">+</span> Tambah</button>`;
    } else {
      controlHtml = `
        <div class="stepper-inline">
          <button class="stepper-btn" onclick="event.stopPropagation(); updateQty(${item.id}, -1)">➖</button>
          <span class="stepper-qty">${cartItem.qty}</span>
          <button class="stepper-btn" onclick="event.stopPropagation(); updateQty(${item.id}, 1)">➕</button>
        </div>
      `;
    }

    return `
    <div class="menu-item" id="menu-${item.id}" onclick="addToCart(${item.id})" style="cursor:pointer;">
      <div class="item-img-wrap">
        ${item.image ? `<img src="${item.image}" class="item-img">` : `<div class="item-placeholder">${item.emoji || '🍽️'}</div>`}
      </div>
      <div class="item-details" style="display:flex; flex-direction:column; justify-content:space-between; flex:1;">
        <div>
          <div class="item-name">${item.name}</div>
          <div class="item-price">${formatRupiah(item.price)}</div>
        </div>
        <div class="item-controls" id="controls-${item.id}">
          ${controlHtml}
        </div>
      </div>
    </div>
    `;
  }).join('');
}

function renderCategories() {
  const container = document.getElementById('category-filters');
  const cats = getCategories();

  container.innerHTML = cats.map(cat => `
    <button class="category-btn ${cat === state.activeCategory ? 'active' : ''}"
            onclick="filterCategory('${cat}')">${cat}</button>
  `).join('');
}

function filterCategory(cat) {
  state.activeCategory = cat;
  renderCategories();
  renderMenuGrid();
}

// --- Cart ---
function addToCart(menuId) {
  const item = state.menu.find(m => m.id === menuId);
  if (!item) return;

  const existing = state.cart.find(c => c.menuId === menuId);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ menuId, qty: 1 });
  }

  // Click animation
  const el = document.getElementById(`menu-${menuId}`);
  if (el) {
    el.classList.add('clicked');
    // Float +1
    const floater = document.createElement('span');
    floater.className = 'float-add';
    floater.textContent = '+1';
    el.appendChild(floater);
    setTimeout(() => { el.classList.remove('clicked'); floater.remove(); }, 600);
  }

  renderCart();
  
  // Re-render the controls for this specific item
  const controlsEl = document.getElementById(`controls-${menuId}`);
  if (controlsEl) {
    const cartItem = state.cart.find(c => c.menuId === menuId);
    if (cartItem) {
      controlsEl.innerHTML = `
        <div class="stepper-inline">
          <button class="stepper-btn" onclick="event.stopPropagation(); updateQty(${menuId}, -1)">➖</button>
          <span class="stepper-qty">${cartItem.qty}</span>
          <button class="stepper-btn" onclick="event.stopPropagation(); updateQty(${menuId}, 1)">➕</button>
        </div>
      `;
    }
  }
}

function updateQty(menuId, delta) {
  const item = state.cart.find(c => c.menuId === menuId);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter(c => c.menuId !== menuId);
  }
  
  // Update only the specific control and floating cart to avoid re-rendering entire grid
  renderCart();
  const controlsEl = document.getElementById(`controls-${menuId}`);
  if (controlsEl) {
    const cartItem = state.cart.find(c => c.menuId === menuId);
    if (!cartItem) {
      controlsEl.innerHTML = `<button class="btn-add-inline" onclick="event.stopPropagation(); addToCart(${menuId})"><span style="color:var(--accent-primary)">+</span> Tambah</button>`;
    } else {
      controlsEl.innerHTML = `
        <div class="stepper-inline">
          <button class="stepper-btn" onclick="event.stopPropagation(); updateQty(${menuId}, -1)">➖</button>
          <span class="stepper-qty">${cartItem.qty}</span>
          <button class="stepper-btn" onclick="event.stopPropagation(); updateQty(${menuId}, 1)">➕</button>
        </div>
      `;
    }
  }
}

function removeFromCart(menuId) {
  state.cart = state.cart.filter(c => c.menuId !== menuId);
  renderCart();
}

function clearCart() {
  state.cart = [];
  renderCart();
}

function getCartTotal() {
  return state.cart.reduce((sum, c) => {
    const item = state.menu.find(m => m.id === c.menuId);
    return sum + (item ? item.price * c.qty : 0);
  }, 0);
}

function getCartQty() {
  return state.cart.reduce((sum, c) => sum + c.qty, 0);
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  const floating = document.getElementById('floating-checkout');
  const fcQty = document.getElementById('fc-qty');
  const fcTotal = document.getElementById('fc-total');

  if (state.cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <span class="empty-icon">🛒</span>
        <p>Keranjang kosong</p>
        <p style="font-size:0.75rem;margin-top:4px;">Klik menu untuk menambahkan</p>
      </div>`;
    totalEl.textContent = formatRupiah(0);
    floating.classList.add('hidden');
    return;
  }

  container.innerHTML = state.cart.map(c => {
    const item = state.menu.find(m => m.id === c.menuId);
    if (!item) return '';
    const subtotal = item.price * c.qty;
    return `
      <div class="cart-item">
        <div class="ci-thumb">
          ${item.image ? `<img src="${item.image}">` : `<div class="ci-thumb-placeholder">${item.emoji || '🍽️'}</div>`}
        </div>
        <div class="ci-info">
          <div class="ci-name">${item.name}</div>
          <div class="ci-price">${formatRupiah(item.price)}</div>
        </div>
        <div class="ci-controls">
          <button onclick="updateQty(${item.id}, -1)">−</button>
          <span class="qty">${c.qty}</span>
          <button onclick="updateQty(${item.id}, 1)">+</button>
        </div>
        <div class="ci-subtotal">${formatRupiah(subtotal)}</div>
        <button class="ci-remove" onclick="removeFromCart(${item.id})">✕</button>
      </div>`;
  }).join('');

  const total = getCartTotal();
  const qty = getCartQty();

  totalEl.textContent = formatRupiah(total);
  
  if (state.activePage === 'kasir') {
    floating.classList.remove('hidden');
    fcQty.textContent = `${qty} Item`;
    fcTotal.textContent = formatRupiah(total);
  } else {
    floating.classList.add('hidden');
  }
}

// Ensure floating checkout hides when changing pages
const originalSwitchPage = switchPage;
switchPage = function(page) {
  originalSwitchPage(page);
  renderCart(); // Re-evaluate floating checkout visibility
};

// --- Transaction Flow ---
let pendingTxn = {};

function startPaymentProcess() {
  if (state.cart.length === 0) return;
  pendingTxn = {};

  const total = getCartTotal();
  const modal = document.getElementById('modal-overlay');

  // Build order item rows
  const itemRows = state.cart.map(c => {
    const item = state.menu.find(m => m.id === c.menuId);
    if (!item) return '';
    const subtotal = item.price * c.qty;
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid var(--border);">
        <div style="display:flex; align-items:center; gap: 10px; flex:1;">
          <div style="width:36px; height:36px; border-radius:8px; overflow:hidden; flex-shrink:0; background:var(--bg-secondary); display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
            ${item.image ? `<img src="${item.image}" style="width:100%;height:100%;object-fit:cover;">` : (item.emoji || '🍽️')}
          </div>
          <div>
            <div style="font-weight:600; font-size:0.9rem;">${item.name}</div>
            <div style="color:var(--text-muted); font-size:0.78rem;">${formatRupiah(item.price)} × ${c.qty}</div>
          </div>
        </div>
        <div style="font-weight:700; font-size:0.9rem; color:var(--accent-primary); flex-shrink:0; margin-left:12px;">${formatRupiah(subtotal)}</div>
      </div>`;
  }).join('');

  document.getElementById('modal-title').textContent = '🧾 Rincian Pesanan';
  document.getElementById('modal-body').innerHTML = `
    <div style="max-height: 55vh; overflow-y: auto; padding-right: 2px;">
      ${itemRows}
    </div>
    <div style="margin-top:14px; padding-top:12px; border-top: 2px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="color:var(--text-muted); font-size:0.85rem;">${getCartQty()} item</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:1rem; font-weight:600;">Total</span>
        <span style="font-size:1.35rem; font-weight:800; color:var(--accent-primary);">${formatRupiah(total)}</span>
      </div>
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="showPaymentMethodStep()" style="flex:1;">Lanjut Bayar ➔</button>
  `;
  modal.classList.remove('hidden');
}

function showPaymentMethodStep() {
  document.getElementById('modal-title').textContent = 'Pilih Metode Pembayaran';
  document.getElementById('modal-body').innerHTML = `
    <div style="text-align:center;margin-bottom:16px;font-size:0.9rem;color:var(--text-muted);">
      Total tagihan: <strong style="color:var(--accent-primary);font-size:1.2rem;">${formatRupiah(getCartTotal())}</strong>
    </div>
    <div class="selection-grid">
      <div class="selection-card" onclick="selectPayment('Tunai')">
        <span class="sc-icon">💵</span>
        <span class="sc-title">Tunai</span>
      </div>
      <div class="selection-card shopeepay" onclick="selectPayment('ShopeePay')">
        <span class="sc-icon">📱</span>
        <span class="sc-title">ShopeePay</span>
      </div>
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="startPaymentProcess()">← Kembali</button>
  `;
}

function selectPayment(method) {
  pendingTxn.paymentMethod = method;

  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = 'Pilih Jenis Pesanan';
  document.getElementById('modal-body').innerHTML = `
    <div class="selection-grid">
      <div class="selection-card" onclick="selectOrderType('Makan Disini')">
        <span class="sc-icon">🍽️</span>
        <span class="sc-title">Makan Disini</span>
      </div>
      <div class="selection-card" onclick="selectOrderType('Dibawa Pulang')">
        <span class="sc-icon">🛍️</span>
        <span class="sc-title">Dibawa Pulang</span>
      </div>
    </div>
  `;
}

function selectOrderType(type) {
  pendingTxn.orderType = type;
  
  if (pendingTxn.paymentMethod === 'Tunai') {
    showCashInputModal();
  } else {
    closeModal();
    finalizePayment();
  }
}

function showCashInputModal() {
  const total = getCartTotal();
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = 'Masukkan Uang Pembeli';
  
  // Calculate quick cash amounts
  let quickAmounts = [total]; // Uang Pas
  const baseAmounts = [20000, 50000, 100000];
  baseAmounts.forEach(amt => {
    if (amt > total) quickAmounts.push(amt);
  });
  // If we don't have 4, add next thousands
  let nextThousand = Math.ceil(total / 10000) * 10000;
  if (nextThousand > total && !quickAmounts.includes(nextThousand)) quickAmounts.push(nextThousand);
  
  document.getElementById('modal-body').innerHTML = `
    <div style="text-align:center;margin-bottom:16px;">
      Total Tagihan<br>
      <strong style="color:var(--accent-primary);font-size:1.4rem;">${formatRupiah(total)}</strong>
    </div>
    <div class="form-group">
      <input type="number" class="form-input" id="input-cash-amount" placeholder="Nominal Uang (Rp)" oninput="updateChangeDisplay()" style="font-size:1.2rem;text-align:center;padding:16px;">
    </div>
    <div class="quick-cash-grid">
      <button class="quick-cash-btn" onclick="setCashAmount(${quickAmounts[0]})">Uang Pas</button>
      ${quickAmounts.slice(1,4).map(amt => `<button class="quick-cash-btn" onclick="setCashAmount(${amt})">${formatRupiah(amt)}</button>`).join('')}
    </div>
    <div style="text-align:center;margin-top:20px;">
      <div class="change-display" id="change-display">Kembalian: Rp 0</div>
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="processCashPayment()">✅ Proses Pembayaran</button>
  `;
}

function setCashAmount(amount) {
  document.getElementById('input-cash-amount').value = amount;
  updateChangeDisplay();
}

function updateChangeDisplay() {
  const total = getCartTotal();
  const cash = parseInt(document.getElementById('input-cash-amount').value) || 0;
  const changeDisplay = document.getElementById('change-display');
  
  if (cash < total) {
    changeDisplay.textContent = 'Uang Kurang!';
    changeDisplay.style.color = 'var(--danger)';
  } else {
    changeDisplay.textContent = 'Kembalian: ' + formatRupiah(cash - total);
    changeDisplay.style.color = 'var(--success)';
  }
}

function processCashPayment() {
  const total = getCartTotal();
  const cash = parseInt(document.getElementById('input-cash-amount').value) || 0;
  
  if (cash < total) {
    alert('Uang pelanggan kurang dari total tagihan!');
    return;
  }
  
  pendingTxn.cash = cash;
  pendingTxn.change = cash - total;
  closeModal();
  finalizePayment();
}

function finalizePayment() {
  const txn = {
    id: state.nextTxnId++,
    date: new Date().toISOString(),
    paymentMethod: pendingTxn.paymentMethod,
    orderType: pendingTxn.orderType,
    cash: pendingTxn.cash || 0,
    change: pendingTxn.change || 0,
    items: state.cart.map(c => {
      const item = state.menu.find(m => m.id === c.menuId);
      return {
        name: item.name,
        emoji: item.emoji || '🍽️',
        price: item.price,
        qty: c.qty,
        subtotal: item.price * c.qty,
      };
    }),
    total: getCartTotal(),
  };

  state.transactions.push(txn);
  saveData();

  // Open receipt preview and print options
  openReceiptModal(txn);

  // Clear cart
  state.cart = [];
  renderCart();
}

function showSuccess(amount, changeAmount = 0) {
  const overlay = document.getElementById('success-overlay');
  document.getElementById('success-amount').innerHTML = `
    ${formatRupiah(amount)}
    ${changeAmount > 0 ? `<div style="font-size:1rem;color:var(--success);font-weight:600;margin-top:12px;">Kembalian: ${formatRupiah(changeAmount)}</div>` : ''}
  `;
  overlay.classList.remove('hidden');

  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 2500);
}

// --- History ---
function renderHistory() {
  const container = document.getElementById('history-list');
  const dateInput = document.getElementById('history-date');
  const selectedDate = dateInput.value || getTodayStr();

  const filteredTxn = state.transactions.filter(t =>
    t.date.split('T')[0] === selectedDate
  ).reverse();

  const filteredExp = (state.expenses || []).filter(e =>
    e.date === selectedDate
  );

  const dayTotal  = filteredTxn.reduce((s, t) => s + t.total, 0);
  const dayExpTotal = filteredExp.reduce((s, e) => s + e.amount, 0);

  // Summary
  document.getElementById('history-summary').innerHTML = `
    <span class="ds-label">📅 ${formatDate(selectedDate)} &nbsp;·&nbsp; <span class="ds-count">${filteredTxn.length} transaksi</span></span>
    <span class="ds-value">${formatRupiah(dayTotal)}</span>
  `;

  // Gabungkan transaksi + pengeluaran, sort by time
  const combinedItems = [
    ...filteredTxn.map(t => ({ type: 'txn', time: new Date(t.date), data: t })),
    ...filteredExp.map(e => ({ type: 'exp', time: new Date(e.timestamp), data: e })),
  ].sort((a, b) => b.time - a.time);

  if (combinedItems.length === 0) {
    container.innerHTML = `<div class="history-empty">📭 Belum ada transaksi atau pengeluaran pada tanggal ini</div>`;
    return;
  }

  container.innerHTML = combinedItems.map(item => {
    if (item.type === 'txn') {
      const t = item.data;
      return `
        <div class="history-item" onclick="showTxnDetail(${t.id})">
          <div class="hi-top">
            <span class="hi-id">#${t.id} <span style="color:var(--text-muted);font-weight:400;font-size:0.75rem;">· ${t.orderType || '-'}</span></span>
            <span class="hi-time">${formatTime(t.date)}</span>
          </div>
          <div class="hi-items">${t.items.map(i => `${i.emoji || '🍽️'} ${i.name} x${i.qty}`).join(', ')}</div>
          <div class="flex justify-between items-center mt-12">
            <span style="font-size:0.72rem;padding:2px 6px;background:var(--bg-card);border-radius:4px;color:${t.paymentMethod === 'ShopeePay' ? '#ee4d2d' : 'var(--success)'}">${t.paymentMethod === 'ShopeePay' ? '📱 ShopeePay' : '💵 Tunai'}</span>
            <span class="hi-total">${formatRupiah(t.total)}</span>
          </div>
        </div>`;
    } else {
      const e = item.data;
      return `
        <div class="history-item" style="border-left: 3px solid var(--danger, #ef4444);">
          <div class="hi-top">
            <span class="hi-id" style="color:var(--danger,#ef4444);">💸 Pengeluaran</span>
            <span class="hi-time">${formatTime(e.timestamp)}</span>
          </div>
          <div class="hi-items">${e.desc}</div>
          <div class="flex justify-between items-center mt-12">
            <span style="font-size:0.72rem;padding:2px 6px;background:rgba(239,68,68,0.1);border-radius:4px;color:var(--danger,#ef4444);">Pengeluaran</span>
            <span class="hi-total" style="color:var(--danger,#ef4444);">- ${formatRupiah(e.amount)}</span>
          </div>
        </div>`;
    }
  }).join('');

  // Tambahkan ringkasan pengeluaran hari ini di bawah jika ada
  if (filteredExp.length > 0) {
    container.innerHTML += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(239,68,68,0.08);border-radius:var(--radius-md);border:1px solid rgba(239,68,68,0.2);margin-top:4px;">
        <span style="font-size:0.82rem;color:var(--text-muted);">Total Pengeluaran Hari Ini</span>
        <span style="font-weight:700;color:var(--danger,#ef4444);">- ${formatRupiah(dayExpTotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(61,191,138,0.08);border-radius:var(--radius-md);border:1px solid rgba(61,191,138,0.2);">
        <span style="font-size:0.82rem;color:var(--text-muted);">Laba Bersih Hari Ini</span>
        <span style="font-weight:700;color:var(--accent-primary);">= ${formatRupiah(dayTotal - dayExpTotal)}</span>
      </div>`;
  }
}

function showTxnDetail(txnId) {
  const txn = state.transactions.find(t => t.id === txnId);
  if (!txn) return;

  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = `Transaksi #${txn.id}`;
  document.getElementById('modal-body').innerHTML = `
    <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
      <span>📅 ${formatDate(txn.date)} · ${formatTime(txn.date)}</span>
      <span style="padding:4px 8px;background:var(--bg-secondary);border-radius:6px;font-weight:600;">${txn.orderType || '-'}</span>
    </div>
    <div class="txn-detail-items">
      ${txn.items.map(i => `
        <div class="txn-detail-item">
          <div class="tdi-left">
            <span>${i.emoji || '🍽️'} ${i.name} × ${i.qty}</span>
          </div>
          <span>${formatRupiah(i.subtotal)}</span>
        </div>
      `).join('')}
    </div>
    <div class="txn-detail-total" style="border-top:none;padding-top:8px;margin-top:0;">
      <span style="font-size:0.8rem;color:var(--text-muted);font-weight:500;">Metode Bayar: ${txn.paymentMethod === 'ShopeePay' ? '<span style="color:#ee4d2d">ShopeePay</span>' : '<span style="color:var(--success)">Tunai</span>'}</span>
    </div>
    ${txn.paymentMethod === 'Tunai' ? `
    <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-muted);margin-top:4px;">
      <span>Uang Tunai:</span>
      <span>${formatRupiah(txn.cash)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--success);font-weight:600;margin-top:2px;">
      <span>Kembalian:</span>
      <span>${formatRupiah(txn.change)}</span>
    </div>
    ` : ''}
    <div class="txn-detail-total">
      <span>TOTAL</span>
      <span class="amount">${formatRupiah(txn.total)}</span>
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-danger" onclick="deleteTxn(${txn.id})">🗑 Hapus</button>
    <button class="btn btn-secondary" onclick="closeModal()">Tutup</button>
  `;
  modal.classList.remove('hidden');
}

function deleteTxn(txnId) {
  if (!confirm('Hapus transaksi ini?')) return;
  state.transactions = state.transactions.filter(t => t.id !== txnId);
  saveData();
  closeModal();
  renderHistory();
  if (state.activePage === 'keuangan') renderDashboard();
}

function showAddExpenseModal() {
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = 'Tambah Pengeluaran';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <input type="text" id="exp-desc" class="form-input" placeholder="Deskripsi Pengeluaran" required>
      <input type="number" id="exp-amount" class="form-input" placeholder="Jumlah (Rp)" required style="margin-top:10px;">
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="saveExpense()">Simpan</button>
  `;
  modal.classList.remove('hidden');
}

function saveExpense() {
  const desc = document.getElementById('exp-desc').value;
  const amount = parseInt(document.getElementById('exp-amount').value);
  if (!desc || !amount) return alert('Isi data dengan lengkap');
  
  const expense = {
    id: Date.now(),
    desc,
    amount,
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString()
  };
  
  state.expenses = state.expenses || [];
  state.expenses.push(expense);
  saveData();
  closeModal();
  if (state.activePage === 'keuangan') renderDashboard();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// --- Dashboard & Finances ---
function renderDashboard() {
  const period = state.dashboardPeriod;
  const now = new Date();
  
  let filteredTxns = [];
  let filteredExpenses = [];
  
  if (period === 'hari') {
    const today = new Date().toISOString().split('T')[0];
    filteredTxns = state.transactions.filter(t => t.date.split('T')[0] === today);
    filteredExpenses = (state.expenses || []).filter(e => e.date === today);
  } else if (period === 'minggu') {
    const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    filteredTxns = state.transactions.filter(t => new Date(t.date) >= lastWeek);
    filteredExpenses = (state.expenses || []).filter(e => new Date(e.timestamp) >= lastWeek);
  } else if (period === 'bulan') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filteredTxns = state.transactions.filter(t => new Date(t.date) >= startOfMonth);
    filteredExpenses = (state.expenses || []).filter(e => new Date(e.timestamp) >= startOfMonth);
  } else {
    filteredTxns = [...state.transactions];
    filteredExpenses = [...(state.expenses || [])];
  }

  // Calculate values
  const totalIncome = filteredTxns.reduce((sum, t) => sum + t.total, 0);
  const totalExpense = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalIncome - totalExpense;
  const avgTxn = filteredTxns.length ? Math.round(totalIncome / filteredTxns.length) : 0;
  
  let itemsSold = 0;
  filteredTxns.forEach(t => t.items.forEach(i => itemsSold += i.qty));

  // Render Income Cards directly to IDs
  const elIncome = document.getElementById('stat-income');
  const elExpense = document.getElementById('stat-expense');
  const elNetProfit = document.getElementById('stat-net-profit');
  const elTxn = document.getElementById('stat-txn');
  const elAvg = document.getElementById('stat-avg');
  const elItems = document.getElementById('stat-items');
  
  if (elIncome) elIncome.textContent = formatRupiah(totalIncome);
  if (elExpense) elExpense.textContent = '- ' + formatRupiah(totalExpense);
  if (elNetProfit) {
    elNetProfit.textContent = formatRupiah(netProfit);
    elNetProfit.style.color = netProfit < 0 ? 'var(--danger, #ef4444)' : '';
  }
  if (elTxn) elTxn.textContent = filteredTxns.length;
  if (elAvg) elAvg.textContent = formatRupiah(avgTxn);
  if (elItems) elItems.textContent = itemsSold;
  
  const subText = period === 'hari' ? 'Hari Ini' : (period === 'minggu' ? 'Minggu Ini' : (period === 'bulan' ? 'Bulan Ini' : 'Semua Waktu'));
  const elIncomeSub = document.getElementById('stat-income-sub');
  const elExpenseSub = document.getElementById('stat-expense-sub');
  const elNetProfitSub = document.getElementById('stat-net-profit-sub');
  const elTxnSub = document.getElementById('stat-txn-sub');
  if (elIncomeSub) elIncomeSub.textContent = subText;
  if (elExpenseSub) elExpenseSub.textContent = subText;
  if (elNetProfitSub) elNetProfitSub.textContent = subText;
  if (elTxnSub) elTxnSub.textContent = subText;

  // Render charts and list
  renderIncomeChart(filteredTxns, period);
  renderExpenseList(filteredExpenses);
  renderTopItemsChart(filteredTxns);
  renderTopItemsTable(filteredTxns);
}

// Chart instances
let incomeChartInstance = null;
let topItemsChartInstance = null;

function renderExpenseList(expenses) {
  let listEl = document.getElementById('expense-list-container');
  
  if (!listEl) {
    const chartsWrap = document.querySelector('.dashboard-charts');
    if (chartsWrap) {
      const containerHTML = `
        <div class="section-card" style="margin-top: 20px;">
          <div class="section-header">
            <h2 class="section-title"><span class="icon">💸</span> Daftar Pengeluaran</h2>
          </div>
          <div id="expense-list-container" style="display:flex; flex-direction:column; gap:10px;"></div>
        </div>
      `;
      chartsWrap.insertAdjacentHTML('afterend', containerHTML);
      listEl = document.getElementById('expense-list-container');
    }
  }
  
  if (!listEl) return;
  
  if (expenses.length === 0) {
    listEl.innerHTML = `<div class="cart-empty" style="padding: 20px;"><p>Belum ada pengeluaran.</p></div>`;
    return;
  }
  
  const sorted = [...expenses].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  listEl.innerHTML = sorted.map(e => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card-hover); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border);">
      <div>
        <div style="font-weight:600; font-size:1rem; margin-bottom:4px;">${e.desc}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${formatDate(e.date)} - ${formatTime(e.timestamp)}</div>
      </div>
      <div style="font-weight:700; color:var(--text-danger);">${formatRupiah(e.amount)}</div>
    </div>
  `).join('');
}

function renderIncomeChart(transactions, period) {
  const ctx = document.getElementById('income-chart')?.getContext('2d');
  if (!ctx) return;

  if (incomeChartInstance) incomeChartInstance.destroy();

  // Group by date
  const grouped = {};
  transactions.forEach(t => {
    const dateKey = t.date.split('T')[0];
    grouped[dateKey] = (grouped[dateKey] || 0) + t.total;
  });

  const dates = Object.keys(grouped).sort();
  
  let labels, data;
  if (period === 'hari') {
    const today = new Date();
    labels = [];
    data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
      data.push(grouped[key] || 0);
    }
  } else {
    labels = dates.map(d => {
      const dt = new Date(d);
      return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    });
    data = dates.map(d => grouped[d]);
  }

  if (data.length === 0) {
    labels = ['Tidak ada data'];
    data = [0];
  }

  incomeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Pemasukan',
        data,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'rgba(245, 158, 11, 0.6)';
          const gradient = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, 'rgba(245, 158, 11, 0.2)');
          gradient.addColorStop(1, 'rgba(251, 146, 60, 0.8)');
          return gradient;
        },
        borderRadius: 6
      }]
    },
    options: {
      plugins: {
        tooltip: {
          bodyColor: '#9a9ab0',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => formatRupiah(ctx.raw),
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#6b6b80', font: { size: 11, family: 'Inter' } },
          border: { display: false },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#6b6b80',
            font: { size: 11, family: 'Inter' },
            callback: (v) => {
              if (v >= 1000000) return (v / 1000000).toFixed(1) + 'jt';
              if (v >= 1000) return (v / 1000) + 'rb';
              return v;
            }
          },
          border: { display: false },
        }
      }
    }
  });
}

function renderTopItemsChart(transactions) {
  const canvasEl = document.getElementById('top-items-chart');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;
  if (topItemsChartInstance) topItemsChartInstance.destroy();

  // Count items
  const itemMap = {};
  transactions.forEach(t => {
    t.items.forEach(i => {
      if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, revenue: 0, emoji: i.emoji };
      itemMap[i.name].qty += i.qty;
      itemMap[i.name].revenue += i.subtotal;
    });
  });

  const sorted = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 6);

  if (sorted.length === 0) {
    ctx.canvas.parentElement.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:0.85rem;">Belum ada data</div>';
    return;
  }

  const colors = [
    'rgba(245, 158, 11, 0.8)',
    'rgba(251, 146, 60, 0.8)',
    'rgba(34, 197, 94, 0.8)',
    'rgba(59, 130, 246, 0.8)',
    'rgba(168, 85, 247, 0.8)',
    'rgba(239, 68, 68, 0.8)',
  ];

  topItemsChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sorted.map(([name, d]) => `${d.emoji} ${name}`),
      datasets: [{
        data: sorted.map(([, d]) => d.qty),
        backgroundColor: colors.slice(0, sorted.length),
        borderColor: '#22222e',
        borderWidth: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#9a9ab0',
            font: { size: 11, family: 'Inter' },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          backgroundColor: '#22222e',
          titleColor: '#f1f1f5',
          bodyColor: '#9a9ab0',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => ` ${ctx.parsed} item terjual`,
          }
        }
      }
    }
  });
}

function renderTopItemsTable(transactions) {
  const container = document.getElementById('top-items-table');

  const itemMap = {};
  transactions.forEach(t => {
    t.items.forEach(i => {
      if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, revenue: 0, emoji: i.emoji };
      itemMap[i.name].qty += i.qty;
      itemMap[i.name].revenue += i.subtotal;
    });
  });

  const sorted = Object.entries(itemMap).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.85rem;">Belum ada data</div>';
    return;
  }

  container.innerHTML = `
    <table class="top-items-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Menu</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Pendapatan</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(([name, d], i) => `
          <tr>
            <td class="rank">${i + 1}</td>
            <td><div class="item-col">${d.emoji} ${name}</div></td>
            <td class="qty-col">${d.qty}</td>
            <td class="revenue-col">${formatRupiah(d.revenue)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function setPeriod(period) {
  state.dashboardPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => {
    if (btn.dataset.period === period) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderDashboard();
}

// --- Menu Management ---
function renderMenuManage() {
  const container = document.getElementById('menu-manage-list');
  const searchVal = document.getElementById('menu-search')?.value?.toLowerCase() || '';

  let filtered = state.menu;
  if (searchVal) {
    filtered = filtered.filter(m =>
      m.name.toLowerCase().includes(searchVal) ||
      m.category.toLowerCase().includes(searchVal)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="history-empty">🔍 Menu tidak ditemukan</div>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="menu-manage-item">
      <div class="mmi-thumb">
        ${item.image ? `<img src="${item.image}">` : `<div class="mmi-thumb-placeholder">${item.emoji || '🍽️'}</div>`}
      </div>
      <div class="mmi-info">
        <div class="mmi-name">${item.name}</div>
        <div class="mmi-meta">${item.category} · ${formatRupiah(item.price)}</div>
      </div>
      <div class="mmi-actions">
        <button class="btn btn-secondary btn-icon" onclick="editMenu(${item.id})" title="Edit">✏️</button>
        <button class="btn btn-danger btn-icon" onclick="deleteMenu(${item.id})" title="Hapus">🗑</button>
      </div>
    </div>
  `).join('');
}

// Emoji arrays removed, replaced with image upload logic

function showAddMenuModal() {
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = 'Tambah Menu Baru';

  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Nama Menu</label>
      <input type="text" class="form-input" id="input-name" placeholder="cth: Nasi Goreng Spesial">
    </div>
    <div class="form-group">
      <label class="form-label">Harga (Rp)</label>
      <input type="number" class="form-input" id="input-price" placeholder="cth: 15000">
    </div>
    <div class="form-group">
      <label class="form-label">Kategori</label>
      <select class="form-select" id="input-category">
        <option value="Makanan">🍛 Makanan</option>
        <option value="Minuman">🥤 Minuman</option>
        <option value="Snack">🍿 Snack</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Gambar Menu</label>
      <div class="img-upload-area" id="img-upload-area" onclick="document.getElementById('input-image-file').click()">
        <div class="upload-placeholder" id="upload-placeholder">
          <span class="upload-icon">📸</span>
          <p>Klik untuk upload gambar</p>
          <p class="upload-hint">Format: JPG, PNG (Max 2MB)</p>
        </div>
        <img src="" class="preview-img hidden" id="preview-img" style="display:none;">
        <button type="button" class="remove-img-btn hidden" id="remove-img-btn" onclick="removeImage(event)" style="display:none;">✕</button>
      </div>
      <input type="file" id="input-image-file" accept="image/*" onchange="handleImageUpload(event)">
      <input type="hidden" id="input-image-base64" value="">
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="saveNewMenu()">💾 Simpan</button>
  `;
  modal.classList.remove('hidden');

  // Select first emoji by default
  document.querySelector('.emoji-option')?.classList.add('selected');
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      // Create canvas to resize image
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 400;
      const MAX_HEIGHT = 400;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to JPEG format
      const base64 = canvas.toDataURL('image/jpeg', 0.7);

      document.getElementById('input-image-base64').value = base64;
      
      // Show preview
      document.getElementById('upload-placeholder').style.display = 'none';
      const preview = document.getElementById('preview-img');
      preview.src = base64;
      preview.style.display = 'block';
      
      const removeBtn = document.getElementById('remove-img-btn');
      removeBtn.style.display = 'flex';
      document.getElementById('img-upload-area').classList.add('has-image');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function removeImage(e) {
  e.stopPropagation();
  document.getElementById('input-image-file').value = '';
  document.getElementById('input-image-base64').value = '';
  
  document.getElementById('upload-placeholder').style.display = 'block';
  document.getElementById('preview-img').style.display = 'none';
  document.getElementById('remove-img-btn').style.display = 'none';
  document.getElementById('img-upload-area').classList.remove('has-image');
}

function saveNewMenu() {
  const name = document.getElementById('input-name').value.trim();
  const price = parseInt(document.getElementById('input-price').value);
  const category = document.getElementById('input-category').value;
  const imageBase64 = document.getElementById('input-image-base64').value;

  if (!name) { alert('Nama menu harus diisi!'); return; }
  if (!price || price <= 0) { alert('Harga harus lebih dari 0!'); return; }

  state.menu.push({
    id: state.nextMenuId++,
    name,
    price,
    emoji: imageBase64 ? null : '🍽️', // Fallback
    image: imageBase64,
    category,
  });

  saveData();
  closeModal();
  renderMenuManage();
  renderCategories();
  renderMenuGrid();
}

function editMenu(menuId) {
  const item = state.menu.find(m => m.id === menuId);
  if (!item) return;

  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = 'Edit Menu';

  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Nama Menu</label>
      <input type="text" class="form-input" id="input-name" value="${item.name}">
    </div>
    <div class="form-group">
      <label class="form-label">Harga (Rp)</label>
      <input type="number" class="form-input" id="input-price" value="${item.price}">
    </div>
    <div class="form-group">
      <label class="form-label">Kategori</label>
      <select class="form-select" id="input-category">
        <option value="Makanan" ${item.category === 'Makanan' ? 'selected' : ''}>🍛 Makanan</option>
        <option value="Minuman" ${item.category === 'Minuman' ? 'selected' : ''}>🥤 Minuman</option>
        <option value="Snack" ${item.category === 'Snack' ? 'selected' : ''}>🍿 Snack</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Gambar Menu</label>
      <div class="img-upload-area ${item.image ? 'has-image' : ''}" id="img-upload-area" onclick="document.getElementById('input-image-file').click()">
        <div class="upload-placeholder" id="upload-placeholder" style="display: ${item.image ? 'none' : 'block'};">
          <span class="upload-icon">📸</span>
          <p>Klik untuk upload gambar</p>
          <p class="upload-hint">Format: JPG, PNG (Max 2MB)</p>
        </div>
        <img src="${item.image || ''}" class="preview-img" id="preview-img" style="display: ${item.image ? 'block' : 'none'};">
        <button type="button" class="remove-img-btn" id="remove-img-btn" onclick="removeImage(event)" style="display: ${item.image ? 'flex' : 'none'};">✕</button>
      </div>
      <input type="file" id="input-image-file" accept="image/*" onchange="handleImageUpload(event)">
      <input type="hidden" id="input-image-base64" value="${item.image || ''}">
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="updateMenu(${menuId})">💾 Simpan</button>
  `;
  modal.classList.remove('hidden');
}

function updateMenu(menuId) {
  const item = state.menu.find(m => m.id === menuId);
  if (!item) return;

  const name = document.getElementById('input-name').value.trim();
  const price = parseInt(document.getElementById('input-price').value);
  const category = document.getElementById('input-category').value;
  const imageBase64 = document.getElementById('input-image-base64').value;

  if (!name) { alert('Nama menu harus diisi!'); return; }
  if (!price || price <= 0) { alert('Harga harus lebih dari 0!'); return; }

  item.name = name;
  item.price = price;
  item.category = category;
  item.image = imageBase64;
  item.emoji = imageBase64 ? null : '🍽️';

  saveData();
  closeModal();
  renderMenuManage();
  renderCategories();
  renderMenuGrid();
}

function deleteMenu(menuId) {
  const item = state.menu.find(m => m.id === menuId);
  if (!item) return;
  if (!confirm(`Hapus menu "${item.name}"?`)) return;

  state.menu = state.menu.filter(m => m.id !== menuId);
  saveData();
  renderMenuManage();
  renderCategories();
  renderMenuGrid();
}

// --- Export to Excel ---
function exportToExcel() {
  const today = getTodayStr();

  // Filter hanya transaksi hari ini
  const todayTxns = state.transactions.filter(t => t.date.split('T')[0] === today);
  // Filter hanya pengeluaran hari ini
  const todayExps = (state.expenses || []).filter(e => e.date === today);

  if (todayTxns.length === 0 && todayExps.length === 0) {
    alert('Belum ada transaksi atau pengeluaran hari ini untuk di-export!');
    return;
  }

  const wb = XLSX.utils.book_new();

  // ===== Sheet 1: Detail Transaksi (hari ini) =====
  if (todayTxns.length > 0) {
    const rows = [];
    todayTxns.forEach(txn => {
      txn.items.forEach(item => {
        rows.push({
          'No Transaksi':   txn.id,
          'Waktu':          formatTime(txn.date),
          'Metode Bayar':   txn.paymentMethod || 'Tunai',
          'Jenis Pesanan':  txn.orderType || '-',
          'Menu':           item.name,
          'Harga':          item.price,
          'Jumlah':         item.qty,
          'Subtotal':       item.subtotal,
          'Total Transaksi':txn.total,
        });
      });
    });

    const ws1 = XLSX.utils.json_to_sheet(rows);
    ws1['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 15 },
      { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Detail Transaksi');
  }

  // ===== Sheet 2: Pengeluaran (hari ini) =====
  if (todayExps.length > 0) {
    const expRows = todayExps.map(e => ({
      'Waktu':        formatTime(e.timestamp),
      'Keterangan':   e.desc,
      'Jumlah':       e.amount,
    }));
    const ws2 = XLSX.utils.json_to_sheet(expRows);
    ws2['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Pengeluaran');
  }

  // ===== Sheet 3: Ringkasan Hari Ini =====
  const totalPemasukan  = todayTxns.reduce((s, t) => s + t.total, 0);
  const totalPengeluaran = todayExps.reduce((s, e) => s + e.amount, 0);
  const summaryRows = [
    { 'Keterangan': 'Tanggal',           'Nilai': formatDate(today) },
    { 'Keterangan': 'Jumlah Transaksi',  'Nilai': todayTxns.length },
    { 'Keterangan': 'Total Pemasukan',   'Nilai': totalPemasukan },
    { 'Keterangan': 'Total Pengeluaran', 'Nilai': totalPengeluaran },
    { 'Keterangan': 'Laba Bersih',       'Nilai': totalPemasukan - totalPengeluaran },
  ];
  const ws3 = XLSX.utils.json_to_sheet(summaryRows);
  ws3['!cols'] = [{ wch: 20 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Ringkasan');

  const fileName = `Laporan_${today}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// --- Setup & Role Management Functions ---

let selectedRole = 'Bos';

function selectSetupRole(role) {
  selectedRole = role;
  document.getElementById('role-bos').classList.toggle('active', role === 'Bos');
  document.getElementById('role-karyawan').classList.toggle('active', role === 'Karyawan');
  
  if (role === 'Bos') {
    document.getElementById('setup-shop-name-group').style.display = 'block';
    document.getElementById('setup-token-bos-group').style.display = 'block';
    document.getElementById('setup-token-karyawan-group').style.display = 'none';
  } else {
    document.getElementById('setup-shop-name-group').style.display = 'none';
    document.getElementById('setup-token-bos-group').style.display = 'none';
    document.getElementById('setup-token-karyawan-group').style.display = 'block';
  }
}

function generateRandomToken() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randToken = '';
  for (let i = 0; i < 6; i++) {
    randToken += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  document.getElementById('setup-token-bos').value = randToken;
}

async function saveSetup() {
  const shopNameInput = document.getElementById('setup-shop-name').value.trim();
  
  if (selectedRole === 'Bos') {
    if (!shopNameInput) {
      alert('Nama Warung / Toko tidak boleh kosong!');
      return;
    }
    const tokenInput = document.getElementById('setup-token-bos').value.trim();
    if (!tokenInput) {
      alert('Token Karyawan tidak boleh kosong!');
      return;
    }
    state.shopName = shopNameInput;
    state.role = 'Bos';
    state.token = tokenInput;
    
    try {
      // Cek apakah token sudah ada (Bos sedang login ulang)
      const doc = await db.collection('shops').doc(tokenInput).get();
      if (doc.exists) {
        const data = doc.data();
        state.shopName = data.shopName; // Gunakan nama dari database
        state.isSetup = true;
        saveData(); // Save locally
        syncFromFirebase();
        finishSetup();
      } else {
        // Bos membuat warung baru
        state.shopName = shopNameInput;
        state.isSetup = true;
        saveData(); // Save locally and create in Firebase
        syncFromFirebase();
        finishSetup();
      }
    } catch (error) {
      console.error("Error checking token for Bos:", error);
      alert('Gagal menghubungi server. Error: ' + error.message);
    }
  } else {
    const enteredToken = document.getElementById('setup-token-karyawan').value.trim();
    if (!enteredToken) {
      alert('Harap masukkan Kode Karyawan!');
      return;
    }
    
    // Validasi token dari Firebase
    try {
      const doc = await db.collection('shops').doc(enteredToken).get();
      if (doc.exists) {
        const data = doc.data();
        state.shopName = data.shopName;
        state.role = 'Karyawan';
        state.token = enteredToken;
        state.isSetup = true;
        
        saveData(); // Save locally
        syncFromFirebase(); // Start real-time sync
        finishSetup();
      } else {
        alert('Kode Karyawan tidak ditemukan! Pastikan Bos sudah mengatur warung dan internet terhubung.');
      }
    } catch (error) {
      console.error("Error checking token:", error);
      alert('Gagal mengecek kode karyawan. Error: ' + error.message);
    }
  }
}

function finishSetup() {
  document.getElementById('welcome-overlay').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('shop-title-display').textContent = state.shopName;
  
  if (state.role === 'Karyawan') {
    switchPage('kasir');
  }
  
  applyRoleRestrictions();
  
  alert('Setup berhasil! Peran Anda: ' + (state.role === 'Bos' ? '💼 Bos (Pemilik)' : '🧑‍🍳 Karyawan'));
}

function resetSetup() {
  if (confirm('Ganti peran? Data menu dan transaksi tetap tersimpan.')) {
    // Hanya reset peran, BUKAN data menu/transaksi
    state.isSetup = false;
    localStorage.setItem('kasir_isSetup', 'false');
    // Jangan hapus kasir_role agar token bos tetap tersimpan
    
    document.getElementById('welcome-overlay').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    
    // Pre-fill dengan data yang sudah ada
    document.getElementById('setup-shop-name').value = state.shopName;
    selectSetupRole('Bos');
    document.getElementById('setup-token-bos').value = state.token;
    document.getElementById('setup-token-karyawan').value = '';
  }
}

function applyRoleRestrictions() {
  const navKeuangan = document.getElementById('nav-keuangan');
  const mbnKeuangan = document.getElementById('mbn-keuangan');
  
  const editShopBtn = document.getElementById('edit-shop-name-btn');
  const userBadge = document.getElementById('header-user-badge');
  const roleText = document.getElementById('role-badge-text');
  const tokenText = document.getElementById('token-badge-text');
  
  if (state.role === 'Bos') {
    if (navKeuangan) navKeuangan.style.display = 'flex';
    if (mbnKeuangan) mbnKeuangan.style.display = 'flex';
    if (editShopBtn) editShopBtn.style.display = 'inline-flex';
    
    if (userBadge) userBadge.style.display = 'flex';
    if (roleText) roleText.textContent = '💼 Bos';
    if (tokenText) {
      tokenText.style.display = 'inline-block';
      tokenText.textContent = `Kode Kasir: ${state.employeeCode || '-'} 🔑`;
    }
  } else {
    if (navKeuangan) navKeuangan.style.display = 'none';
    if (mbnKeuangan) mbnKeuangan.style.display = 'none';
    if (editShopBtn) editShopBtn.style.display = 'none';
    
    if (state.activePage === 'keuangan') {
      switchPage('kasir');
    }
    
    if (userBadge) userBadge.style.display = 'flex';
    if (roleText) roleText.textContent = '🧑‍🍳 Karyawan';
    if (tokenText) tokenText.style.display = 'none';
  }
}

function editShopName() {
  if (state.role !== 'Bos') return;
  const newName = prompt('Masukkan nama warung baru:', state.shopName);
  if (newName !== null) {
    const trimmed = newName.trim();
    if (trimmed) {
      state.shopName = trimmed;
      document.getElementById('shop-title-display').textContent = trimmed;
      saveData();
    } else {
      alert('Nama warung tidak boleh kosong!');
    }
  }
}

// --- Bluetooth Printer & Receipt Formatting ---
let printerDevice = null;
let printerCharacteristic = null;
let printerMacAddress = null; // for Android bluetoothSerial
let currentTxnForReceipt = null;

function closeBtPicker() {
  document.getElementById('bt-picker-overlay').classList.add('hidden');
}

function connectToMac(mac, name) {
  closeBtPicker();
  updatePrinterStatus("Connecting...");
  window.bluetoothSerial.connect(
    mac,
    function() {
      printerMacAddress = mac;
      updatePrinterStatus("Connected");
      alert('Berhasil terhubung ke printer: ' + name);
    },
    function(error) {
      printerMacAddress = null;
      updatePrinterStatus("Disconnected");
      alert('Gagal terhubung ke printer: ' + error);
    }
  );
}

async function connectBluetoothPrinter() {
  if (window.bluetoothSerial) {
    // Android App Mode (Bluetooth Classic SPP)
    updatePrinterStatus("Mencari...");
    window.bluetoothSerial.list(
      function(devices) {
        if (devices.length === 0) {
          alert('Tidak ada perangkat Bluetooth yang dipasangkan. Buka pengaturan Bluetooth HP Anda dan pairing dengan printer terlebih dahulu.');
          updatePrinterStatus("Disconnected");
          return;
        }
        
        const listEl = document.getElementById('bt-device-list');
        listEl.innerHTML = '';
        devices.forEach(device => {
          const btn = document.createElement('button');
          btn.className = 'btn btn-secondary';
          btn.style.textAlign = 'left';
          btn.innerHTML = `<strong>${device.name || 'Unknown Device'}</strong><br><small>${device.address}</small>`;
          btn.onclick = () => connectToMac(device.address, device.name || device.address);
          listEl.appendChild(btn);
        });
        
        document.getElementById('bt-picker-overlay').classList.remove('hidden');
        updatePrinterStatus("Disconnected"); // Reset while picking
      },
      function(error) {
        alert('Gagal mengambil daftar Bluetooth: ' + error);
        updatePrinterStatus("Disconnected");
      }
    );
  } else {
    // Browser Mode (BLE)
    try {
      if (!navigator.bluetooth) {
        alert("Browser Anda tidak mendukung Web Bluetooth. Gunakan Google Chrome, Microsoft Edge, atau Opera.");
        return;
      }
      
      updatePrinterStatus("Connecting...");
      
      printerDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Bluetooth printing standard service
          '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile (SPP)
          'e7e1a12c-a09c-11e5-8994-feff819cdc9f'  // Raw printing service
        ]
      });
      
      const server = await printerDevice.gatt.connect();
      
      let service;
      try {
        service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        try {
          service = await server.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
        } catch (err) {
          const services = await server.getPrimaryServices();
          if (services.length > 0) {
            service = services[0];
          } else {
            throw new Error("Layanan Bluetooth Printer tidak ditemukan.");
          }
        }
      }
      
      const characteristics = await service.getCharacteristics();
      printerCharacteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
      
      if (!printerCharacteristic) {
        throw new Error("Karakteristik menulis data printer tidak ditemukan.");
      }
      
      updatePrinterStatus("Connected");
      alert("Printer Bluetooth berhasil terhubung!");
      
      printerDevice.addEventListener('gattserverdisconnected', onPrinterDisconnected);
    } catch (error) {
      console.error(error);
      updatePrinterStatus("Disconnected");
      alert("Gagal menyambungkan printer: " + error.message);
    }
  }
}

function onPrinterDisconnected() {
  printerDevice = null;
  printerCharacteristic = null;
  printerMacAddress = null;
  updatePrinterStatus("Disconnected");
  alert("Koneksi printer Bluetooth terputus!");
}

function updatePrinterStatus(status) {
  const btn = document.getElementById('btn-connect-printer');
  if (!btn) return;
  if (status === "Connected") {
    btn.innerHTML = "🖨️ Terhubung";
    btn.className = "btn btn-success";
  } else if (status === "Connecting...") {
    btn.innerHTML = "⏳ Menghubungkan...";
    btn.className = "btn btn-secondary";
  } else {
    btn.innerHTML = "🖨️ Hubungkan Printer";
    btn.className = "btn btn-secondary";
  }
}

async function sendPrinterData(dataBytes) {
  if (window.bluetoothSerial && printerMacAddress) {
    // Send via Capacitor Bluetooth Serial
    return new Promise((resolve, reject) => {
      // bluetoothSerial.write expects ArrayBuffer or Uint8Array
      window.bluetoothSerial.write(
        dataBytes.buffer,
        function() { resolve(); },
        function(error) { reject(new Error("Gagal mengirim data ke printer: " + error)); }
      );
    });
  } else if (printerCharacteristic) {
    // Send via Web BLE
    const CHUNK_SIZE = 20;
    for (let i = 0; i < dataBytes.length; i += CHUNK_SIZE) {
      const chunk = dataBytes.slice(i, i + CHUNK_SIZE);
      await printerCharacteristic.writeValue(chunk);
      await new Promise(resolve => setTimeout(resolve, 20)); // delay 20ms
    }
  } else {
    throw new Error("Printer tidak terhubung!");
  }
}

function formatReceiptESC(txn) {
  const ESC = 0x1B;
  const GS = 0x1D;
  
  const initPrinter = [ESC, 0x40];
  const centerAlign = [ESC, 0x61, 0x01];
  const leftAlign = [ESC, 0x61, 0x00];
  const boldOn = [ESC, 0x45, 0x01];
  const boldOff = [ESC, 0x45, 0x00];
  const doubleHeight = [GS, 0x21, 0x01];
  const normalSize = [GS, 0x21, 0x00];
  
  let commands = [];
  const encoder = new TextEncoder();
  
  function addText(text) {
    commands.push(...encoder.encode(text));
  }
  
  function addCommand(cmdBytes) {
    commands.push(...cmdBytes);
  }

  addCommand(initPrinter);
  
  // Header
  addCommand(centerAlign);
  addCommand(boldOn);
  addCommand(doubleHeight);
  addText(state.shopName.toUpperCase() + "\n");
  addCommand(normalSize);
  addCommand(boldOff);
  addText("--------------------------------\n");
  
  // Metadata
  addCommand(leftAlign);
  addText(`No: #${txn.id}\n`);
  addText(`Tgl: ${formatDate(txn.date)} ${formatTime(txn.date)}\n`);
  addText(`Kasir: ${state.role === 'Bos' ? 'Bos' : 'Karyawan'}\n`);
  addText(`Tipe: ${txn.orderType || 'Makan Disini'}\n`);
  addText("--------------------------------\n");
  
  // Items
  txn.items.forEach(item => {
    addText(`${item.emoji || ''} ${item.name}\n`);
    const qtyPriceStr = `  ${item.qty} x ${item.price.toLocaleString('id-ID')}`;
    const subtotalStr = (item.price * item.qty).toLocaleString('id-ID');
    const spacesCount = 32 - qtyPriceStr.length - subtotalStr.length;
    const spaces = ' '.repeat(spacesCount > 0 ? spacesCount : 1);
    addText(`${qtyPriceStr}${spaces}${subtotalStr}\n`);
  });
  
  addText("--------------------------------\n");
  
  // Total
  const totalLabel = "TOTAL:";
  const totalVal = txn.total.toLocaleString('id-ID');
  const tSpaces = ' '.repeat(32 - totalLabel.length - totalVal.length);
  addCommand(boldOn);
  addText(`${totalLabel}${tSpaces}${totalVal}\n`);
  addCommand(boldOff);
  
  // Payment Details
  if (txn.paymentMethod === 'Tunai') {
    const cashLabel = "Bayar Tunai:";
    const cashVal = txn.cash.toLocaleString('id-ID');
    const cSpaces = ' '.repeat(32 - cashLabel.length - cashVal.length);
    addText(`${cashLabel}${cSpaces}${cashVal}\n`);
    
    const changeLabel = "Kembalian:";
    const changeVal = txn.change.toLocaleString('id-ID');
    const chSpaces = ' '.repeat(32 - changeLabel.length - changeVal.length);
    addText(`${changeLabel}${chSpaces}${changeVal}\n`);
  } else {
    const payLabel = "Bayar:";
    const payVal = txn.paymentMethod;
    const pSpaces = ' '.repeat(32 - payLabel.length - payVal.length);
    addText(`${payLabel}${pSpaces}${payVal}\n`);
  }
  
  addText("--------------------------------\n");
  
  addCommand(centerAlign);
  addText("Terima Kasih\n");
  addText("Silakan Datang Kembali\n\n\n\n\n");
  
  // Cut paper command
  addCommand([GS, 0x56, 0x42, 0x00]);
  
  return new Uint8Array(commands);
}

async function printReceiptBluetooth(txn) {
  if (!printerCharacteristic && !printerMacAddress) {
    alert("Printer Bluetooth tidak terhubung! Hubungkan printer terlebih dahulu menggunakan tombol di header.");
    return;
  }
  
  try {
    const bytes = formatReceiptESC(txn);
    await sendPrinterData(bytes);
    alert("Struk berhasil dicetak!");
  } catch (error) {
    console.error(error);
    alert("Gagal mencetak struk: " + error.message);
  }
}

function printReceiptBrowser(txn) {
  // Create temporary container for print
  const printContainer = document.createElement('div');
  printContainer.id = 'temporary-print-receipt';
  printContainer.innerHTML = generateReceiptHTML(txn);
  
  document.body.appendChild(printContainer);
  document.body.classList.add('printing-receipt');
  
  window.print();
  
  document.body.classList.remove('printing-receipt');
  printContainer.remove();
}

function generateReceiptHTML(txn) {
  let html = `
    <div class="receipt-preview-center" style="font-weight: bold; font-size: 1.1rem; text-transform: uppercase;">
      ${state.shopName}
    </div>
    <div class="receipt-preview-center" style="font-size: 0.75rem;">
      Aplikasi Kasir Warung Sederhana
    </div>
    <div class="receipt-preview-divider"></div>
    
    <div>No Transaksi: #${txn.id}</div>
    <div>Tanggal: ${formatDate(txn.date)} ${formatTime(txn.date)}</div>
    <div>Kasir: ${state.role === 'Bos' ? 'Bos' : 'Karyawan'}</div>
    <div>Tipe: ${txn.orderType || 'Makan Disini'}</div>
    
    <div class="receipt-preview-divider"></div>
  `;
  
  txn.items.forEach(item => {
    const subtotal = item.price * item.qty;
    html += `
      <div style="font-weight: 600;">${item.emoji || ''} ${item.name}</div>
      <div class="receipt-preview-line">
        <span>  ${item.qty} x Rp ${item.price.toLocaleString('id-ID')}</span>
        <span>Rp ${subtotal.toLocaleString('id-ID')}</span>
      </div>
    `;
  });
  
  html += `
    <div class="receipt-preview-divider"></div>
    <div class="receipt-preview-line" style="font-weight: bold; font-size: 1rem;">
      <span>TOTAL</span>
      <span>Rp ${txn.total.toLocaleString('id-ID')}</span>
    </div>
  `;
  
  if (txn.paymentMethod === 'Tunai') {
    html += `
      <div class="receipt-preview-line">
        <span>Tunai</span>
        <span>Rp ${txn.cash.toLocaleString('id-ID')}</span>
      </div>
      <div class="receipt-preview-line">
        <span>Kembalian</span>
        <span>Rp ${txn.change.toLocaleString('id-ID')}</span>
      </div>
    `;
  } else {
    html += `
      <div class="receipt-preview-line">
        <span>Metode Bayar</span>
        <span>${txn.paymentMethod}</span>
      </div>
    `;
  }
  
  html += `
    <div class="receipt-preview-divider"></div>
    <div class="receipt-preview-center" style="margin-top: 10px; font-style: italic;">
      Terima Kasih<br>Silakan Datang Kembali
    </div>
  `;
  
  return html;
}

function openReceiptModal(txn) {
  currentTxnForReceipt = txn;
  
  const contentEl = document.getElementById('receipt-preview-content');
  if (contentEl) {
    contentEl.innerHTML = generateReceiptHTML(txn);
  }
  
  const modal = document.getElementById('receipt-modal-overlay');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeReceiptModal() {
  const modal = document.getElementById('receipt-modal-overlay');
  if (modal) {
    modal.classList.add('hidden');
  }
  currentTxnForReceipt = null;
}

function printReceiptFromModal(type) {
  if (!currentTxnForReceipt) return;
  if (type === 'bluetooth') {
    printReceiptBluetooth(currentTxnForReceipt);
  } else {
    printReceiptBrowser(currentTxnForReceipt);
  }
}

// --- Date display ---
function updateDateDisplay() {
  const el = document.getElementById('current-date');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
}

// --- Expenses Logic ---
function showExpenseModal() {
  document.getElementById('expense-modal-overlay').classList.remove('hidden');
  document.getElementById('expense-desc').value = '';
  document.getElementById('expense-amount').value = '';
}

function closeExpenseModal() {
  document.getElementById('expense-modal-overlay').classList.add('hidden');
}

function saveExpense() {
  const desc = document.getElementById('expense-desc').value.trim();
  const amountStr = document.getElementById('expense-amount').value.trim();
  const amount = parseInt(amountStr, 10);
  
  if (!desc) { alert('Masukkan keterangan pengeluaran!'); return; }
  if (!amount || isNaN(amount) || amount <= 0) { alert('Nominal tidak valid!'); return; }
  
  const now = new Date();
  const expense = {
    id: Date.now(),
    desc: desc,
    amount: amount,
    date: getTodayStr(),
    timestamp: now.toISOString(),
  };
  
  state.expenses.push(expense);
  saveData();
  
  closeExpenseModal();
  alert('Pengeluaran berhasil dicatat!');
}

// --- Initialize ---
function init() {
  document.getElementById('welcome-overlay').classList.add('hidden');
  document.getElementById('app-container').classList.add('hidden');

  function hideSplash() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 380);
  }

  const savedKaryawanCode = localStorage.getItem('kasir_karyawanCode');
  
  // Cek auto login
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      // Auto login via Google
      try {
        const shopDoc = await db.collection('shops').doc(user.uid).get();
        if (shopDoc.exists) {
          const data = shopDoc.data();
          state.uid          = user.uid;
          state.userEmail    = user.email;
          state.userPhotoURL = user.photoURL;
          state.role         = 'Bos';
          state.token        = user.uid;
          state.shopName     = data.shopName;
          state.employeeCode = data.employeeCode || '';
          state.shopLogo     = data.shopLogo || null;
          hideSplash();
          await checkAndShowSubscription();
        } else {
          hideSplash();
          showNewShopForm(user.displayName);
        }
      } catch (err) {
        console.error('Auto login error:', err);
        hideSplash();
        document.getElementById('welcome-overlay').classList.remove('hidden');
      }
    } else if (savedKaryawanCode) {
      loginAsKaryawan(savedKaryawanCode);
    } else {
      hideSplash();
      document.getElementById('welcome-overlay').classList.remove('hidden');
    }
  });

  if (window.capacitor) {
    const webLogin = document.getElementById('bos-web-login');
    const apkLogin = document.getElementById('bos-apk-login');
    if (webLogin) webLogin.style.display = 'none';
    if (apkLogin) apkLogin.style.display = 'block';
  }

  updateDateDisplay();

  const dateInput = document.getElementById('history-date');
  if (dateInput) dateInput.value = getTodayStr();

  document.getElementById('history-date')?.addEventListener('change', renderHistory);
  document.getElementById('menu-search')?.addEventListener('input', renderMenuManage);

  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  document.getElementById('success-overlay')?.addEventListener('click', () => {
    document.getElementById('success-overlay').classList.add('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  
  document.getElementById('karyawan-code-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginAsKaryawan();
  });
}

document.addEventListener('DOMContentLoaded', init);

// --- Closing Kasir ---
function showClosingModal() {
  const dateInput = document.getElementById('history-date');
  const selectedDate = dateInput ? (dateInput.value || getTodayStr()) : getTodayStr();

  const filteredTxn = state.transactions.filter(t => t.date.split('T')[0] === selectedDate);
  const filteredExp = (state.expenses || []).filter(e => e.date === selectedDate);

  const totalPemasukan = filteredTxn.reduce((s, t) => s + t.total, 0);
  const tunaiTxns = filteredTxn.filter(t => t.paymentMethod === 'Tunai' || !t.paymentMethod);
  const totalTunai = tunaiTxns.reduce((s, t) => s + t.total, 0);
  
  const nonTunaiTxns = filteredTxn.filter(t => t.paymentMethod !== 'Tunai' && t.paymentMethod);
  const totalNonTunai = nonTunaiTxns.reduce((s, t) => s + t.total, 0);

  const totalPengeluaran = filteredExp.reduce((s, e) => s + e.amount, 0);
  
  const uangDiLaci = totalTunai - totalPengeluaran;

  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = '💼 Rekap Shift (Closing)';
  document.getElementById('modal-body').innerHTML = `
    <div style="background:var(--bg-secondary); padding:16px; border-radius:12px; margin-bottom:16px;">
      <h3 style="margin-bottom:12px; font-size:1rem; border-bottom:1px solid var(--border); padding-bottom:8px;">Pemasukan</h3>
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; color:var(--text-secondary);">
        <span>💳 Non-Tunai</span>
        <span>${formatRupiah(totalNonTunai)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span>💵 Tunai</span>
        <span style="font-weight:600;">${formatRupiah(totalTunai)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; color:var(--danger);">
        <span>➖ Pengeluaran (Kasbon dll)</span>
        <span>${formatRupiah(totalPengeluaran)}</span>
      </div>
    </div>
    
    <div style="background:var(--accent-primary); color:white; padding:16px; border-radius:12px; text-align:center;">
      <div style="font-size:0.9rem; opacity:0.9; margin-bottom:4px;">Uang Fisik yang harus ada di laci/kasir:</div>
      <div style="font-size:1.6rem; font-weight:800;">${formatRupiah(uangDiLaci)}</div>
      <div style="font-size:0.75rem; opacity:0.8; margin-top:4px;">(Pemasukan Tunai - Pengeluaran)</div>
    </div>
    <div style="margin-top:16px; font-size:0.85rem; color:var(--text-muted); text-align:center;">
      Gunakan data ini untuk mencocokkan uang di laci dengan sistem sebelum tutup toko.
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-primary" onclick="closeModal()" style="width:100%;">Tutup & Selesai</button>
  `;
  modal.classList.remove('hidden');
}
