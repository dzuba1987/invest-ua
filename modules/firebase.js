// ================================================================
// ==================== FIREBASE AUTH + FIRESTORE =================
// ================================================================

let firebaseReady = false;
let currentUser = null;
let db = null;
// _skipFirestoreSync declared in app.js as var (shared global)

function initFirebase() {
  if (typeof firebase === 'undefined' || !FIREBASE_CONFIG.apiKey) {
    console.warn('Firebase not available or not configured');
    return;
  }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    firebaseReady = true;

    firebase.auth().onAuthStateChanged(user => {
      currentUser = user;
      updateAuthUI();
      if (user) {
        saveUserMeta(user);
        loadFromFirestore();
        loadPortfolioFromFirestore();
        if (typeof loadDreamsFromFirestore === 'function') loadDreamsFromFirestore();
        loadProfileFromFirestore();
      }
      checkMaintenance();
    });
  } catch(e) {
    console.warn('Firebase init failed:', e);
  }
}

async function saveUserMeta(user) {
  if (!firebaseReady || !user) return;
  try {
    const docRef = db.collection('users').doc(user.uid);
    const doc = await docRef.get();
    const isNewUser = !doc.exists;

    if (isNewUser) {
      await docRef.set({
        meta: {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          provider: user.providerData[0]?.providerId || 'unknown'
        }
      });
      notifyTelegram('newUser', user);
    } else {
      await docRef.update({
        'meta.uid': user.uid,
        'meta.email': user.email || '',
        'meta.displayName': user.displayName || '',
        'meta.photoURL': user.photoURL || '',
        'meta.lastLogin': new Date().toISOString(),
        'meta.provider': user.providerData[0]?.providerId || 'unknown'
      });
      notifyTelegram('login', user);
    }
  } catch(e) {
    console.warn('User meta save failed:', e);
  }
}

function updateAuthUI() {
  const info = document.getElementById('userInfo');
  const loginBtn = document.getElementById('btnLogin');
  const logoutBtn = document.getElementById('btnLogout');

  const saveBtn = document.getElementById('btnSaveRecord');
  const importBtn = document.getElementById('btnImportExcel');

  if (currentUser) {
    info.style.display = 'flex';
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
    document.getElementById('userAvatar').src = currentUser.photoURL || '';
    document.getElementById('userName').textContent = userProfile.displayName || currentUser.displayName || currentUser.email;
    saveBtn.style.display = '';
    importBtn.style.display = '';
  } else {
    info.style.display = 'none';
    loginBtn.style.display = 'flex';
    logoutBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    importBtn.style.display = 'none';
  }
  updatePortfolioUI();
  updateProfileUI();
  checkAnalyticsReady();
  if (typeof updateCreditCalcVisibility === 'function') updateCreditCalcVisibility();
  if (typeof updateDreamsUI === 'function') updateDreamsUI();
}

function googleLogin() {
  if (!firebaseReady) {
    alert('Сервіс авторизації тимчасово недоступний. Спробуйте пізніше.');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(err => {
    console.error('Login error:', err);
    alert('Помилка входу: ' + err.message);
  });
}

function googleLogout() {
  if (firebaseReady) {
    firebase.auth().signOut();
  }
  clearAll();
  savedRecords = [];
  portfolioItems = [];
  userProfile = {};
  pinVerified = false;
  sessionStorage.removeItem('pinVerifiedAt');
  origRenderSaved();
  saveToStorage();
  updateProfileUI();
  updatePortfolioUI();
}

// ---- Records CRUD ----

async function saveToFirestore() {
  if (!firebaseReady || !currentUser) return;
  if (savedRecords.length === 0) return;
  try {
    const ref = db.collection('users').doc(currentUser.uid).collection('records');
    const existing = await ref.get();
    const deletePromises = [];
    existing.forEach(doc => deletePromises.push(doc.ref.delete()));
    await Promise.all(deletePromises);

    const writePromises = savedRecords.map(r =>
      ref.doc(String(r.id)).set(r)
    );
    await Promise.all(writePromises);

    const status = document.getElementById('syncStatus');
    status.textContent = 'синхронізовано';
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 3000);
  } catch(e) {
    console.warn('Firestore save failed:', e);
  }
}

async function loadFromFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(currentUser.uid).collection('records');
    const snapshot = await ref.get();

    if (!snapshot.empty) {
      const cloudRecords = [];
      snapshot.forEach(doc => cloudRecords.push(doc.data()));
      savedRecords = cloudRecords;
      _skipFirestoreSync = true;
      renderSaved();
      _skipFirestoreSync = false;
    } else if (savedRecords.length > 0) {
      await saveToFirestore();
    }

    const status = document.getElementById('syncStatus');
    status.textContent = 'синхронізовано';
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 3000);
  } catch(e) {
    console.warn('Firestore load failed:', e);
  }
}

// ---- Portfolio CRUD ----

async function savePortfolioToFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(currentUser.uid).collection('portfolio');
    const existing = await ref.get();
    const deletePromises = [];
    existing.forEach(doc => deletePromises.push(doc.ref.delete()));
    await Promise.all(deletePromises);

    const writePromises = portfolioItems.map(p =>
      ref.doc(String(p.id)).set(p)
    );
    await Promise.all(writePromises);
  } catch(e) {
    console.warn('Portfolio save failed:', e);
  }
}

async function loadPortfolioFromFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(currentUser.uid).collection('portfolio');
    const snapshot = await ref.get();
    if (!snapshot.empty) {
      portfolioItems = [];
      snapshot.forEach(doc => portfolioItems.push(doc.data()));
      renderPortfolio();
    }
  } catch(e) {
    console.warn('Portfolio load failed:', e);
  }
}

// ---- Profile CRUD ----

let userProfile = {};

function updateProfileUI() {
  const auth = document.getElementById('profileAuth');
  const content = document.getElementById('profileContent');
  if (currentUser) {
    auth.style.display = 'none';
    content.style.display = 'block';
    document.getElementById('profileDisplayName').value = userProfile.displayName || currentUser.displayName || '';
    document.getElementById('profileContactEmail').value = userProfile.contactEmail || '';
    document.getElementById('profilePhone').value = userProfile.phone || '';
    updatePinStatus();
    loadNotifySettings();
  } else {
    auth.style.display = 'block';
    content.style.display = 'none';
  }
}

function setAppLanguage(lang) {
  _currentLang = lang;
  document.getElementById('langBtnUk').classList.toggle('active', lang === 'uk');
  document.getElementById('langBtnEn').classList.toggle('active', lang === 'en');
  document.documentElement.lang = lang;
  userProfile.language = lang;
  localStorage.setItem('appLang', lang);
  applyTranslations();
  if (currentUser) saveProfileToFirestore();
}

async function saveProfile() {
  userProfile.displayName = document.getElementById('profileDisplayName').value.trim();
  userProfile.contactEmail = document.getElementById('profileContactEmail').value.trim();
  userProfile.phone = document.getElementById('profilePhone').value.trim();
  await saveProfileToFirestore();

  document.getElementById('userName').textContent = userProfile.displayName || currentUser.displayName || currentUser.email;

  const msg = document.getElementById('profileSuccess');
  msg.textContent = '✓ Збережено!';
  msg.style.display = 'block';
  msg.style.animation = 'none';
  msg.offsetHeight;
  msg.style.animation = 'fadeOut 3s forwards';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

async function saveProfileToFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({
      profile: {
        displayName: userProfile.displayName || '',
        phone: userProfile.phone || '',
        contactEmail: userProfile.contactEmail || '',
        language: userProfile.language || 'uk',
        pin: userProfile.pin || null,
        dashboardCurrencies: dashboardCurrencies,
        notifyDays: userProfile.notifyDays || 3,
        notifyEmail: userProfile.notifyEmail || false,
        notifyTelegram: userProfile.notifyTelegram || false,
        useTelegramBot: userProfile.useTelegramBot || false,
        telegramChatId: userProfile.telegramChatId || null,
        updatedAt: new Date().toISOString()
      }
    }, { merge: true });
  } catch(e) {
    console.warn('Profile save failed:', e);
  }
}

async function loadProfileFromFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
      const meta = doc.data().meta;
      if (meta && meta.disabled) {
        alert('Ваш акаунт заблоковано. Зверніться до адміністратора.');
        firebase.auth().signOut();
        return;
      }
      if (doc.data().profile) {
        userProfile = doc.data().profile;
        if (userProfile.language) {
          localStorage.setItem('appLang', userProfile.language);
          setAppLanguage(userProfile.language);
        }
        if (userProfile.dashboardCurrencies && userProfile.dashboardCurrencies.length) {
          dashboardCurrencies = userProfile.dashboardCurrencies;
          localStorage.setItem('dashboardCurrencies', JSON.stringify(dashboardCurrencies));
        }
        updateProfileUI();
        checkPinOnLogin();
      }
      const adminLink = document.getElementById('adminLink');
      if (adminLink) adminLink.style.display = (meta && meta.isAdmin) ? '' : 'none';
    }
  } catch(e) {
    console.warn('Profile load failed:', e);
  }
}

// ---- Online heartbeat (every 2 min) ----
function startHeartbeat() {
  function beat() {
    if (firebaseReady && currentUser) {
      db.collection('users').doc(currentUser.uid).update({
        'meta.lastSeen': new Date().toISOString()
      }).catch(() => {});
    }
  }
  beat();
  setInterval(beat, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
}

// ---- Feedback ----
async function sendFeedback() {
  const text = document.getElementById('feedbackText').value.trim();
  const resultEl = document.getElementById('feedbackResult');

  if (!text) {
    resultEl.textContent = 'Введіть повідомлення';
    resultEl.style.color = '#f87171';
    resultEl.style.display = 'block';
    return;
  }

  try {
    await db.collection('feedback').add({
      uid: currentUser ? currentUser.uid : null,
      name: userProfile.displayName || (currentUser ? currentUser.displayName : 'Анонім'),
      email: userProfile.contactEmail || (currentUser ? currentUser.email : ''),
      text: text,
      createdAt: new Date().toISOString()
    });

    document.getElementById('feedbackText').value = '';
    resultEl.textContent = '✓ Дякуємо за відгук!';
    resultEl.style.color = '#4ade80';
    resultEl.style.display = 'block';
    resultEl.style.animation = 'none';
    resultEl.offsetHeight;
    resultEl.style.animation = 'fadeOut 5s forwards';
    setTimeout(() => { resultEl.style.display = 'none'; }, 5000);
  } catch(e) {
    resultEl.textContent = 'Помилка: ' + e.message;
    resultEl.style.color = '#f87171';
    resultEl.style.display = 'block';
  }
}

// ---- Export all user data ----
function exportAllUserData() {
  const resultEl = document.getElementById('dataActionResult');
  const data = {
    exportDate: new Date().toISOString(),
    profile: userProfile,
    portfolio: portfolioItems,
    savedRecords: savedRecords,
    settings: {
      language: localStorage.getItem('appLang'),
      dashboardCurrencies: dashboardCurrencies,
      notifyDays: localStorage.getItem('notifyDays'),
      notifyTelegram: localStorage.getItem('notifyTelegram'),
      telegramChatId: userProfile.telegramChatId || '',
    }
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'invest-ua-data-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);

  resultEl.textContent = '✓ Дані експортовано!';
  resultEl.style.color = '#4ade80';
  resultEl.style.display = 'block';
  setTimeout(() => { resultEl.style.display = 'none'; }, 3000);
}

// ---- Delete all user data ----
async function deleteAllUserData() {
  const resultEl = document.getElementById('dataActionResult');

  if (!confirm('Ви впевнені? Це видалить ВСІ ваші дані з цього пристрою та хмари. Цю дію не можна скасувати.')) return;
  if (!confirm('Останнє підтвердження. Видалити всі дані назавжди?')) return;

  try {
    // Delete from Firestore
    if (firebaseReady && currentUser) {
      const uid = currentUser.uid;

      // Delete portfolio subcollection
      const portfolio = await db.collection('users').doc(uid).collection('portfolio').get();
      const pDel = [];
      portfolio.forEach(doc => pDel.push(doc.ref.delete()));
      await Promise.all(pDel);

      // Delete records subcollection
      const records = await db.collection('users').doc(uid).collection('records').get();
      const rDel = [];
      records.forEach(doc => rDel.push(doc.ref.delete()));
      await Promise.all(rDel);

      // Delete user document
      await db.collection('users').doc(uid).delete();
    }

    // Clear local storage
    localStorage.clear();
    sessionStorage.clear();

    // Clear IndexedDB
    if (typeof indexedDB !== 'undefined') {
      const dbs = await indexedDB.databases();
      dbs.forEach(d => indexedDB.deleteDatabase(d.name));
    }

    // Clear state
    savedRecords = [];
    portfolioItems = [];
    userProfile = {};

    // Sign out
    if (firebaseReady) {
      await firebase.auth().signOut();
    }

    resultEl.textContent = '✓ Усі дані видалено. Сторінка перезавантажиться...';
    resultEl.style.color = '#4ade80';
    resultEl.style.display = 'block';
    setTimeout(() => { location.reload(); }, 2000);
  } catch(e) {
    resultEl.textContent = 'Помилка: ' + e.message;
    resultEl.style.color = '#f87171';
    resultEl.style.display = 'block';
  }
}

// ---- Maintenance mode check ----
async function checkMaintenance() {
  if (!firebaseReady || !db) return;
  try {
    const doc = await db.collection('settings').doc('maintenance').get();
    if (doc.exists && doc.data().enabled) {
      // Admins can bypass
      if (currentUser) {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists && userDoc.data().meta && userDoc.data().meta.isAdmin) return;
      }
      const msg = doc.data().message || 'Сайт на обслуговуванні. Скоро повернемось!';
      const overlay = document.createElement('div');
      overlay.id = 'maintenanceOverlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#0f172a;display:flex;align-items:center;justify-content:center;z-index:99999;flex-direction:column;padding:20px;text-align:center';
      overlay.innerHTML = `
        <div style="font-size:60px;margin-bottom:20px">🔧</div>
        <h2 style="color:#f1f5f9;font-size:22px;margin-bottom:12px">Технічне обслуговування</h2>
        <p style="color:#94a3b8;font-size:15px;max-width:400px;line-height:1.6">${esc(msg)}</p>
        <p style="color:#475569;font-size:12px;margin-top:24px">Invest UA</p>
      `;
      document.body.appendChild(overlay);
    }
  } catch(e) { /* ignore */ }
}

// ---- Init on load ----
const savedLang = localStorage.getItem('appLang');
if (savedLang) setAppLanguage(savedLang);

initFirebase();
startHeartbeat();

// Check tab visibility: per-user profile overrides global settings
async function applyTabVisibility() {
  if (!firebaseReady || !db) return;
  try {
    // Global settings
    const globalDoc = await db.collection('settings').doc('tabs').get();
    const global = globalDoc.exists ? globalDoc.data() : {};

    // Per-user settings (from profile)
    let userTabs = {};
    if (currentUser) {
      userTabs = {
        analytics: userProfile.tabAnalytics,
        dreams: userProfile.tabDreams
      };
    }

    // User setting takes priority, fallback to global
    const showAnalytics = userTabs.analytics !== undefined ? userTabs.analytics : !!global.analytics;
    const showDreams = userTabs.dreams !== undefined ? userTabs.dreams : !!global.dreams;

    const analyticsBtn = document.querySelector('.main-tab[onclick*="analytics"]');
    const dreamsBtn = document.querySelector('.main-tab[onclick*="dreams"]');
    if (analyticsBtn) analyticsBtn.style.display = showAnalytics ? '' : 'none';
    if (dreamsBtn) dreamsBtn.style.display = showDreams ? '' : 'none';

    if (!showAnalytics) document.getElementById('panel-analytics').classList.remove('active');
    if (!showDreams) document.getElementById('panel-dreams').classList.remove('active');
  } catch(e) {
    console.warn('Tab visibility check failed:', e.message);
    // Show all tabs as fallback
    const analyticsBtn = document.querySelector('.main-tab[onclick*="analytics"]');
    const dreamsBtn = document.querySelector('.main-tab[onclick*="dreams"]');
    if (analyticsBtn) analyticsBtn.style.display = '';
    if (dreamsBtn) dreamsBtn.style.display = '';
  }
}
applyTabVisibility();
