// ================================================================
// ==================== FIREBASE AUTH + FIRESTORE =================
// ================================================================

let firebaseReady = false;
let currentUser = null;
let db = null;
// _skipFirestoreSync declared in app.js as var (shared global)

// === Dev-mode isolation ===
// When the app is served from localhost, all per-user Firestore writes go to
// `users/{uid}_dev` instead of `users/{uid}`. This lets you log in with the
// same Google account locally without overwriting production data. Telegram
// admin notifications are also suppressed in dev.
const IS_DEV = (typeof location !== 'undefined') && (
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === '0.0.0.0' ||
  /\.local$/.test(location.hostname)
);
const DEV_UID_SUFFIX = '_dev';
function effectiveUid(rawUid) {
  return (IS_DEV && rawUid) ? rawUid + DEV_UID_SUFFIX : rawUid;
}
if (typeof window !== 'undefined') {
  window.IS_DEV = IS_DEV;
  window.effectiveUid = effectiveUid;
}

if (IS_DEV && typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('devBanner')) return;
    const b = document.createElement('div');
    b.id = 'devBanner';
    b.textContent = '🛠 DEV MODE — дані пишуться у users/{uid}' + DEV_UID_SUFFIX + ', Telegram-сповіщення вимкнено';
    b.style.cssText = 'position:sticky;top:0;z-index:9999;background:#facc15;color:#0f172a;font-size:12px;font-weight:600;padding:6px 12px;text-align:center;letter-spacing:0.2px';
    document.body.insertBefore(b, document.body.firstChild);
  });
}

function initFirebase() {
  if (typeof firebase === 'undefined' || !FIREBASE_CONFIG.apiKey) {
    console.warn('Firebase not available or not configured');
    return;
  }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    firebaseReady = true;

    // If the user just clicked a magic-link in their email, the URL contains
    // Firebase's sign-in params — finish the sign-in before/while the auth
    // state listener fires. (signInWithEmailLink itself triggers
    // onAuthStateChanged once it succeeds.)
    completeEmailLinkSignInOnBoot();

    firebase.auth().onAuthStateChanged(user => {
      currentUser = user;
      updateAuthUI();
      if (user) {
        // Reset load flags — a fresh session must re-load before destructive saves.
        portfolioLoaded = false;
        if (typeof dreamsLoaded !== 'undefined') dreamsLoaded = false;
        if (typeof savingsLoaded !== 'undefined') savingsLoaded = false;
        if (typeof purchasesLoaded !== 'undefined') purchasesLoaded = false;
        saveUserMeta(user);
        loadFromFirestore();
        loadPortfolioFromFirestore();
        if (typeof loadDreamsFromFirestore === 'function') loadDreamsFromFirestore();
        if (typeof loadSavingsFromFirestore === 'function') loadSavingsFromFirestore();
        if (typeof loadPurchasesFromFirestore === 'function') loadPurchasesFromFirestore();
        if (typeof loadMonthlyIncome === 'function') loadMonthlyIncome();
        if (typeof startSharedPurchasesListener === 'function') startSharedPurchasesListener();
        if (typeof processShareInviteOnBoot === 'function') processShareInviteOnBoot();
        loadProfileFromFirestore();
      } else {
        portfolioLoaded = false;
        if (typeof dreamsLoaded !== 'undefined') dreamsLoaded = false;
        if (typeof savingsLoaded !== 'undefined') savingsLoaded = false;
        if (typeof purchasesLoaded !== 'undefined') purchasesLoaded = false;
        if (typeof stopSharedPurchasesListener === 'function') stopSharedPurchasesListener();
      }
      checkMaintenance();
      // Load ОВДП bonds for calculator select (available to all, even without auth)
      if (typeof loadOvdpBonds === 'function') loadOvdpBonds();
    });
  } catch(e) {
    console.warn('Firebase init failed:', e);
  }
}

async function saveUserMeta(user) {
  if (!firebaseReady || !user) return;
  try {
    const docRef = db.collection('users').doc(effectiveUid(user.uid));
    const doc = await docRef.get();
    const isNewUser = !doc.exists;
    const adminEmails = (typeof ADMIN_EMAILS !== 'undefined' ? ADMIN_EMAILS : [])
      .map(e => (e || '').trim().toLowerCase());
    const userEmail = (user.email || '').trim().toLowerCase();
    const isMe = userEmail && adminEmails.includes(userEmail);
    const isAdminFlag = doc.exists && doc.data().meta && doc.data().meta.isAdmin;
    const skipNotify = isMe || isAdminFlag;

    const now = new Date();
    const isoNow = now.toISOString();

    // Cooldown for "login" Telegram notifications: onAuthStateChanged also fires
    // on session restore, token refresh, and tab focus — without throttling, the
    // admin's chat fills up with one alert every few minutes. 1h smooths token
    // refresh / tab focus into at most one notification per hour per user.
    const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;
    const lastNotifiedRaw = !isNewUser ? doc.data()?.meta?.lastLoginNotifiedAt : null;
    const lastNotifiedAt = lastNotifiedRaw ? Date.parse(lastNotifiedRaw) : 0;
    const cooldownPassed = (now.getTime() - lastNotifiedAt) >= NOTIFY_COOLDOWN_MS;
    const shouldNotifyLogin = !isNewUser && !skipNotify && cooldownPassed;

    if (isNewUser) {
      await docRef.set({
        meta: {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          lastLogin: isoNow,
          lastLoginNotifiedAt: isoNow,
          createdAt: isoNow,
          provider: user.providerData[0]?.providerId || 'unknown'
        }
      });
      if (!skipNotify) notifyTelegram('newUser', user);
    } else {
      const updates = {
        'meta.uid': user.uid,
        'meta.email': user.email || '',
        'meta.displayName': user.displayName || '',
        'meta.photoURL': user.photoURL || '',
        'meta.lastLogin': isoNow,
        'meta.provider': user.providerData[0]?.providerId || 'unknown'
      };
      if (shouldNotifyLogin) updates['meta.lastLoginNotifiedAt'] = isoNow;
      await docRef.update(updates);
      if (shouldNotifyLogin) notifyTelegram('login', user);
    }
  } catch(e) {
    console.warn('User meta save failed:', e);
  }
}

function updateAuthUI() {
  const info = document.getElementById('userInfo');
  const logoutBtn = document.getElementById('btnLogout');
  const profileBtn = document.getElementById('btnProfile');

  const saveBtn = document.getElementById('btnSaveRecord');
  const importBtn = document.getElementById('btnImportExcel');

  if (currentUser) {
    info.style.display = 'flex';
    logoutBtn.style.display = 'inline-block';
    if (profileBtn) profileBtn.style.display = 'inline-block';
    document.getElementById('userAvatar').src = currentUser.photoURL || '';
    document.getElementById('userName').textContent = userProfile.displayName || currentUser.displayName || currentUser.email;
    saveBtn.style.display = '';
    importBtn.style.display = '';
  } else {
    info.style.display = 'none';
    logoutBtn.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    importBtn.style.display = 'none';
  }
  // These live in app.js which is loaded after this script.
  // Firebase's onAuthStateChanged can fire before app.js finishes parsing
  // on the first auth bootstrap, so guard each call.
  if (typeof updatePortfolioUI === 'function') updatePortfolioUI();
  if (typeof updateProfileUI === 'function') updateProfileUI();
  if (typeof checkAnalyticsReady === 'function') checkAnalyticsReady();
  if (typeof updateCreditCalcVisibility === 'function') updateCreditCalcVisibility();
  if (typeof updateDreamsUI === 'function') updateDreamsUI();
  if (typeof updateSavingsUI === 'function') updateSavingsUI();
  if (typeof updatePurchasesUI === 'function') updatePurchasesUI();
  // Poll changelog so the tab badge is up-to-date before the user opens it.
  if (typeof loadChangelog === 'function') loadChangelog();
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

// ── Passwordless email-link sign-in ─────────────────────────
// Send a one-time sign-in link to the user's email. They click the link,
// the browser returns to investua.app, and completeEmailLinkSignInOnBoot()
// finishes the sign-in. No password, no Google account required.
async function emailLinkLogin(email) {
  if (!firebaseReady) {
    alert('Сервіс авторизації тимчасово недоступний.');
    return false;
  }
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed || !/.+@.+\..+/.test(trimmed)) {
    alert('Введіть коректний email');
    return false;
  }
  const actionCodeSettings = {
    url: window.location.origin + window.location.pathname,
    handleCodeInApp: true,
  };
  try {
    await firebase.auth().sendSignInLinkToEmail(trimmed, actionCodeSettings);
    // Firebase requires the original email to complete sign-in (defends
    // against link interception on a different device). Stash for the
    // common-case "click the link in the same browser".
    window.localStorage.setItem('emailForSignIn', trimmed);
    return true;
  } catch (err) {
    console.error('Email link send failed:', err);
    alert('Не вдалося надіслати посилання: ' + (err.message || err.code));
    return false;
  }
}

// Triggered from index.html — wraps emailLinkLogin in a confirm flow.
async function showEmailLoginDialog() {
  const email = await uiPrompt('Введіть email — надішлемо посилання для входу:', {
    okText: 'Надіслати',
    cancelText: 'Скасувати',
    placeholder: 'your@email.com',
  });
  if (!email) return;
  const ok = await emailLinkLogin(email);
  if (ok) {
    await uiConfirm(
      '✉️ Посилання надіслано на ' + email.trim() + '.\n\nПерейдіть на пошту і натисніть кнопку входу. Можна закрити це вікно — після кліку ви автоматично увійдете.',
      { okText: 'OK', cancelText: '' }
    );
  }
}

// Resolve once Firebase has loaded any persisted auth state from IndexedDB.
// On the very first onAuthStateChanged fire we have a definitive answer
// ("logged in" or "anonymous"); before that, currentUser may still be null
// even though there's a real session about to come back.
function awaitFirebaseAuthReady() {
  return new Promise(resolve => {
    const unsub = firebase.auth().onAuthStateChanged(user => {
      unsub();
      resolve(user || null);
    });
  });
}

// Run on boot: if the current URL is a Firebase email-link, complete the
// sign-in. Firebase fires onAuthStateChanged after this resolves.
async function completeEmailLinkSignInOnBoot() {
  if (!firebaseReady) return;
  try {
    if (!firebase.auth().isSignInWithEmailLink(window.location.href)) return;
  } catch (_) { return; }

  let email = window.localStorage.getItem('emailForSignIn') || '';

  // Fallback chain when localStorage is empty (different browser / cleared
  // storage): use the email of the already-signed-in user. Common case: user
  // is logged in via Google in the same browser, then clicks a magic-link
  // they sent to themselves — no need to re-ask, the email is on file.
  if (!email) {
    const persistedUser = await awaitFirebaseAuthReady();
    if (persistedUser && persistedUser.email) {
      email = persistedUser.email;
    }
  }

  // Last resort — explicitly ask. Happens only when user opened the link
  // on a totally fresh device with no Firebase session whatsoever.
  if (!email) {
    email = await uiPrompt('Підтвердіть email, на який було надіслано посилання:', {
      okText: 'Увійти',
      placeholder: 'your@email.com',
    }) || '';
    if (!email) return;
  }
  try {
    await firebase.auth().signInWithEmailLink(email.trim().toLowerCase(), window.location.href);
    window.localStorage.removeItem('emailForSignIn');
    // Strip Firebase's magic-link query string so a reload doesn't retry.
    const cleanUrl = window.location.origin + window.location.pathname;
    history.replaceState(null, '', cleanUrl);
  } catch (err) {
    console.error('Email link sign-in failed:', err);
    alert('Не вдалося завершити вхід: ' + (err.message || err.code));
  }
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
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('records');
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
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('records');
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

// Once the initial Firestore load completes, this is set true.
// Saves done *before* the load are write-only (never delete remote docs),
// preventing data loss if the user edits before the load finishes.
let portfolioLoaded = false;

// Firestore rejects documents with `undefined` field values (even inside
// arrays), so strip/normalize them. Object keys with undefined are dropped;
// array elements that are undefined become null (to preserve indices).
function stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(v => v === undefined ? null : stripUndefined(v));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return obj;
}

async function savePortfolioToFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('portfolio');
    const localIds = new Set(portfolioItems.map(p => String(p.id)));
    const ops = [];

    if (portfolioLoaded) {
      const existing = await ref.get();
      existing.forEach(doc => {
        if (!localIds.has(doc.id)) ops.push(doc.ref.delete());
      });
    }
    portfolioItems.forEach(p => ops.push(ref.doc(String(p.id)).set(stripUndefined(p))));
    if (ops.length) await Promise.all(ops);
  } catch(e) {
    console.warn('Portfolio save failed:', e);
  }
}

async function loadPortfolioFromFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('portfolio');
    const snapshot = await ref.get();
    const remote = [];
    snapshot.forEach(doc => remote.push(doc.data()));
    const remoteIds = new Set(remote.map(p => String(p.id)));
    const localOnly = portfolioItems.filter(p => !remoteIds.has(String(p.id)));
    portfolioItems = [...remote, ...localOnly];
    portfolioLoaded = true;
    renderPortfolio();
    if (localOnly.length) savePortfolioToFirestore();
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
    // Preserve unsaved edits — only overwrite fields if form is clean
    const preserveEdits = typeof FormDrafts !== 'undefined' && FormDrafts.isDirty('profile');
    if (!preserveEdits) {
      document.getElementById('profileDisplayName').value = userProfile.displayName || currentUser.displayName || '';
      // Pre-fill from the Google-provided account — saves the user from
      // re-typing what we already know. Phone is rarely populated by Google
      // sign-in (Firebase only exposes it for PhoneAuthProvider), but if it
      // happens to be there we use it.
      document.getElementById('profileContactEmail').value = userProfile.contactEmail || currentUser.email || '';
      document.getElementById('profilePhone').value = userProfile.phone || currentUser.phoneNumber || '';
      if (typeof FormDrafts !== 'undefined') FormDrafts.setBaseline('profile');
    }
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

// ================ THEME (dark / light / auto) ================
function resolveEffectiveTheme(theme) {
  if (theme === 'auto') {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  if (theme === 'light') return 'light';
  return 'dark';
}

function applyThemeDom(theme) {
  const effective = resolveEffectiveTheme(theme);
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-theme-effective', effective);
  // Update mobile browser chrome color per theme
  const metaTc = document.querySelector('meta[name="theme-color"]');
  if (metaTc) {
    const tc = effective === 'light' ? '#ffffff' : '#1e293b';
    metaTc.setAttribute('content', tc);
  }
  // Update active button states (if UI is present)
  const btnDark = document.getElementById('themeBtnDark');
  const btnLight = document.getElementById('themeBtnLight');
  const btnAuto = document.getElementById('themeBtnAuto');
  if (btnDark) btnDark.classList.toggle('active', theme === 'dark');
  if (btnLight) btnLight.classList.toggle('active', theme === 'light');
  if (btnAuto) btnAuto.classList.toggle('active', theme === 'auto');
  // Notify listeners (charts redraw, etc.)
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme, effective } }));
}

function setAppTheme(theme, opts) {
  theme = (theme === 'light' || theme === 'auto') ? theme : 'dark';
  applyThemeDom(theme);
  if (!userProfile) userProfile = {};
  userProfile.theme = theme;
  localStorage.setItem('appTheme', theme);
  if (currentUser && !(opts && opts.skipSync)) saveProfileToFirestore();
}

// Listen to system theme changes (affects only "auto" mode)
(function initThemeAutoListener(){
  if (!window.matchMedia) return;
  const mql = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => {
    const current = localStorage.getItem('appTheme') || 'dark';
    if (current === 'auto') applyThemeDom('auto');
  };
  if (mql.addEventListener) mql.addEventListener('change', handler);
  else if (mql.addListener) mql.addListener(handler); // Safari < 14
})();

async function saveProfile() {
  userProfile.displayName = document.getElementById('profileDisplayName').value.trim();
  userProfile.contactEmail = document.getElementById('profileContactEmail').value.trim();
  userProfile.phone = document.getElementById('profilePhone').value.trim();
  await saveProfileToFirestore();

  if (typeof FormDrafts !== 'undefined') FormDrafts.clear('profile');

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
    await db.collection('users').doc(effectiveUid(currentUser.uid)).set({
      profile: {
        displayName: userProfile.displayName || '',
        phone: userProfile.phone || '',
        contactEmail: userProfile.contactEmail || '',
        language: userProfile.language || 'uk',
        theme: userProfile.theme || 'dark',
        pin: userProfile.pin || null,
        dashboardCurrencies: dashboardCurrencies,
        notifyDays: userProfile.notifyDays || 3,
        notifyEmail: userProfile.notifyEmail || false,
        notifyTelegram: userProfile.notifyTelegram || false,
        useTelegramBot: userProfile.useTelegramBot || false,
        notifyPurchases: (typeof userProfile.notifyPurchases === 'boolean') ? userProfile.notifyPurchases : true,
        notifyPurchasesDays: userProfile.notifyPurchasesDays || 1,
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
    const doc = await db.collection('users').doc(effectiveUid(currentUser.uid)).get();
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
        if (userProfile.theme) {
          // sync-free — не писати назад у Firestore одразу після завантаження
          setAppTheme(userProfile.theme, { skipSync: true });
        }
        if (userProfile.dashboardCurrencies && userProfile.dashboardCurrencies.length) {
          dashboardCurrencies = userProfile.dashboardCurrencies;
          localStorage.setItem('dashboardCurrencies', JSON.stringify(dashboardCurrencies));
        }
        updateProfileUI();
        checkPinOnLogin();
      }
    }
    // Admin flag lives on the REAL user doc, not the dev sandbox — always read
    // from users/{uid} so the Admin link works on localhost too.
    try {
      const realDoc = IS_DEV
        ? await db.collection('users').doc(currentUser.uid).get()
        : doc;
      const realMeta = realDoc && realDoc.exists ? realDoc.data().meta : null;
      const adminLink = document.getElementById('adminLink');
      if (adminLink) adminLink.style.display = (realMeta && realMeta.isAdmin) ? '' : 'none';
      // Expose tester flag globally so UI can show opt-out checkboxes per record.
      window._isTester = !!(realMeta && realMeta.isTester);
      document.body.classList.toggle('role-tester', window._isTester);
      if (typeof renderPortfolio === 'function') renderPortfolio();
      if (typeof renderDreams === 'function') renderDreams();
      if (typeof renderSavings === 'function') renderSavings();
      if (typeof renderPurchases === 'function') renderPurchases();
    } catch(e) { /* non-fatal */ }
  } catch(e) {
    console.warn('Profile load failed:', e);
  }
}

// ---- Online heartbeat (every 2 min) ----
function startHeartbeat() {
  function beat() {
    if (firebaseReady && currentUser) {
      db.collection('users').doc(effectiveUid(currentUser.uid)).update({
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
    const up = (typeof userProfile === 'object' && userProfile) ? userProfile : {};
    const fbName = up.displayName || (currentUser && currentUser.displayName) || 'Анонім';
    const fbEmail = up.contactEmail || (currentUser && currentUser.email) || '';
    await db.collection('feedback').add({
      uid: currentUser ? currentUser.uid : null,
      name: fbName,
      email: fbEmail,
      text: text,
      createdAt: new Date().toISOString()
    });

    if (typeof notifyTelegramFeedback === 'function') {
      Promise.resolve()
        .then(() => notifyTelegramFeedback(fbName, fbEmail, text))
        .catch(err => console.warn('Telegram feedback notify failed:', err));
    }

    document.getElementById('feedbackText').value = '';
    resultEl.textContent = '✓ Дякуємо за відгук!';
    resultEl.style.color = '#4ade80';
    resultEl.style.display = 'block';
    resultEl.style.animation = 'none';
    resultEl.offsetHeight;
    resultEl.style.animation = 'fadeOut 5s forwards';
    setTimeout(() => { resultEl.style.display = 'none'; }, 5000);
  } catch(e) {
    console.error('sendFeedback error:', e);
    resultEl.textContent = 'Помилка: ' + (e && e.message ? e.message : 'unknown');
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

  if (!await uiConfirm('Ви впевнені? Це видалить ВСІ ваші дані з цього пристрою та хмари. Цю дію не можна скасувати.', { danger: true, okText: 'Продовжити' })) return;
  if (!await uiConfirm('Останнє підтвердження. Видалити всі дані назавжди?', { danger: true, okText: 'Видалити назавжди' })) return;

  try {
    // Delete from Firestore
    if (firebaseReady && currentUser) {
      const uid = effectiveUid(currentUser.uid);

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
        const userDoc = await db.collection('users').doc(effectiveUid(currentUser.uid)).get();
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

// Theme: apply saved (or default dark) and highlight active button.
// data-theme-effective уже встановлено inline-скриптом у <head> до FOUC,
// але кнопки потребують активного стану після рендеру DOM.
const savedTheme = localStorage.getItem('appTheme') || 'dark';
applyThemeDom(savedTheme);

initFirebase();
startHeartbeat();

// Tab visibility control is temporarily disabled — all tabs are shown to everyone.
async function applyTabVisibility() {
  const analyticsBtn = document.querySelector('.main-tab[onclick*="analytics"]');
  const dreamsBtn = document.querySelector('.main-tab[onclick*="dreams"]');
  if (analyticsBtn) analyticsBtn.style.display = '';
  if (dreamsBtn) dreamsBtn.style.display = '';
}
applyTabVisibility();
