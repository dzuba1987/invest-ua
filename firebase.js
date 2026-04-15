// ================================================================
// ==================== FIREBASE AUTH + FIRESTORE =================
// ================================================================

let firebaseReady = false;
let currentUser = null;
let db = null;
let _skipFirestoreSync = false;

function initFirebase() {
  if (!FIREBASE_CONFIG.apiKey) {
    console.warn('Firebase not configured');
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
        loadProfileFromFirestore();
      }
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
}

function googleLogin() {
  if (!firebaseReady) {
    alert('Firebase не налаштований. Додай ключі у config.js. Деталі — у розділі «Довідка».');
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
        notifyTelegram: userProfile.notifyTelegram || false,
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
