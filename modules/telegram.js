// ================================================================
// ==================== TELEGRAM INTEGRATION ======================
// ================================================================

function apiFetch(path, data) {
  const apiBase = typeof NOTIFY_API_BASE !== 'undefined' ? NOTIFY_API_BASE : '';
  const apiKey = typeof NOTIFY_API_KEY !== 'undefined' ? NOTIFY_API_KEY : '';
  return fetch(apiBase + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(data)
  });
}

// ---- Admin notifications ----

async function getTelegramConfig() {
  if (!firebaseReady) return null;
  try {
    const doc = await db.collection('settings').doc('telegram').get();
    if (doc.exists) return doc.data();
  } catch(e) { /* ignore */ }
  return null;
}

async function notifyTelegram(event, user) {
  if (window.IS_DEV) { console.log('[DEV] skipped Telegram notify:', event); return; }
  const config = await getTelegramConfig();
  if (!config || !config.chatId) return;

  if (event === 'newUser' && config.notifyNewUser === false) return;
  if (event === 'login' && !config.notifyLogin) return;

  try {
    await apiFetch('/telegram/admin-notify', {
      event: event,
      name: user.displayName || 'Без імені',
      email: user.email || '—',
      admin_chat_id: config.chatId
    });
  } catch(e) {
    console.warn('Admin notify failed:', e);
  }
}

async function notifyTelegramFeedback(name, email, text) {
  if (window.IS_DEV) { console.log('[DEV] skipped feedback Telegram notify'); return; }
  const config = await getTelegramConfig();
  if (!config || !config.chatId || config.notifyFeedback === false) return;

  try {
    await apiFetch('/telegram/admin-notify', {
      event: 'feedback',
      name: name || 'Анонім',
      email: email || '—',
      text: text,
      admin_chat_id: config.chatId
    });
  } catch(e) {
    console.warn('Feedback notify failed:', e);
  }
}

// ---- User notification settings ----

function saveNotifySettings() {
  const days = document.getElementById('notifyDays').value;
  const emailOn = document.getElementById('notifyEmail').checked;
  const tgOn = document.getElementById('notifyTelegram').checked;
  const botOn = document.getElementById('useTelegramBot').checked;
  const purchasesEl = document.getElementById('notifyPurchases');
  const purchasesDaysEl = document.getElementById('notifyPurchasesDays');
  const purchasesOn = purchasesEl ? purchasesEl.checked : true;
  const purchasesDays = purchasesDaysEl ? purchasesDaysEl.value : '1';

  localStorage.setItem('notifyDays', days);
  localStorage.setItem('notifyEmail', emailOn);
  localStorage.setItem('notifyTelegram', tgOn);
  localStorage.setItem('useTelegramBot', botOn);
  localStorage.setItem('notifyPurchases', purchasesOn);
  localStorage.setItem('notifyPurchasesDays', purchasesDays);

  document.getElementById('telegramLinkSection').style.display = tgOn ? 'block' : 'none';

  if (currentUser) {
    userProfile.notifyDays = parseInt(days);
    userProfile.notifyEmail = emailOn;
    userProfile.notifyTelegram = tgOn;
    userProfile.useTelegramBot = botOn;
    userProfile.notifyPurchases = purchasesOn;
    userProfile.notifyPurchasesDays = parseInt(purchasesDays);
    saveProfileToFirestore();
  }
}

function loadNotifySettings() {
  const days = userProfile.notifyDays || localStorage.getItem('notifyDays') || '3';
  const emailOn = userProfile.notifyEmail || localStorage.getItem('notifyEmail') === 'true';
  const tgOn = userProfile.notifyTelegram || localStorage.getItem('notifyTelegram') === 'true';
  const botOn = userProfile.useTelegramBot || localStorage.getItem('useTelegramBot') === 'true';
  // Purchase reminders default ON: legacy profiles never had this field, but
  // we want them included once the bot job ships. localStorage 'false' opt-out
  // still wins when present.
  const purchasesStored = localStorage.getItem('notifyPurchases');
  const purchasesOn = (typeof userProfile.notifyPurchases === 'boolean')
    ? userProfile.notifyPurchases
    : (purchasesStored === null ? true : purchasesStored === 'true');
  const purchasesDays = userProfile.notifyPurchasesDays
    || localStorage.getItem('notifyPurchasesDays')
    || '1';

  document.getElementById('notifyDays').value = days;
  document.getElementById('notifyEmail').checked = emailOn;
  document.getElementById('notifyTelegram').checked = tgOn;
  document.getElementById('useTelegramBot').checked = botOn;
  const purchasesEl = document.getElementById('notifyPurchases');
  const purchasesDaysEl = document.getElementById('notifyPurchasesDays');
  if (purchasesEl) purchasesEl.checked = purchasesOn;
  if (purchasesDaysEl) purchasesDaysEl.value = String(purchasesDays);
  document.getElementById('telegramLinkSection').style.display = tgOn ? 'block' : 'none';

  const botName = typeof TELEGRAM_BOT_NAME !== 'undefined' ? TELEGRAM_BOT_NAME : 'my_invest_ua_bot';
  const link = document.getElementById('telegramBotLink');
  if (link && currentUser) {
    link.href = 'https://t.me/' + botName + '?start=' + currentUser.uid;
  }

  renderTelegramConnectionUI();
}

function renderTelegramConnectionUI() {
  const tgChatId = userProfile.telegramChatId || '';
  const manualInput = document.getElementById('telegramChatId');
  if (manualInput) manualInput.value = tgChatId;

  const connected = document.getElementById('tgConnectedBlock');
  const connect = document.getElementById('tgConnectBlock');
  const statusEl = document.getElementById('telegramStatus');

  if (tgChatId) {
    if (connected) connected.style.display = '';
    if (connect) connect.style.display = 'none';
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#4ade80;font-size:12px">✓ Telegram підключено (Chat ID: ' + esc(tgChatId) + ')</span>';
    }
  } else {
    if (connected) connected.style.display = 'none';
    if (connect) connect.style.display = '';
    if (statusEl) statusEl.innerHTML = '';
  }
}

// ---- One-click Telegram connect ----

let tgListenerUnsubscribe = null;
let tgConnectTimeoutId = null;

function onTelegramConnectClick() {
  if (!currentUser || !firebaseReady) return;
  startTelegramConnectListener();
}

function startTelegramConnectListener() {
  stopTelegramConnectListener();

  const waitingBlock = document.getElementById('tgWaitingBlock');
  if (waitingBlock) waitingBlock.style.display = '';

  // Listen for profile changes in Firestore; bot writes profile.telegramChatId on /start
  try {
    tgListenerUnsubscribe = db.collection('users').doc(effectiveUid(currentUser.uid)).onSnapshot(doc => {
      const data = doc.data();
      const chatId = data && data.profile && data.profile.telegramChatId;
      if (chatId) {
        onTelegramConnected(chatId);
      }
    }, err => {
      console.warn('Telegram link listener failed:', err);
    });
  } catch(e) {
    console.warn('Telegram link listener setup failed:', e);
  }

  // Fail-safe timeout: stop waiting after 5 minutes
  tgConnectTimeoutId = setTimeout(() => {
    stopTelegramConnectListener();
    if (waitingBlock) waitingBlock.style.display = 'none';
    const statusEl = document.getElementById('telegramStatus');
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#f59e0b;font-size:12px">⚠ Не вдалося підтвердити підключення. Спробуйте ще раз або введіть Chat ID вручну.</span>';
    }
  }, 5 * 60 * 1000);
}

function stopTelegramConnectListener() {
  if (tgListenerUnsubscribe) { try { tgListenerUnsubscribe(); } catch(_) {} tgListenerUnsubscribe = null; }
  if (tgConnectTimeoutId) { clearTimeout(tgConnectTimeoutId); tgConnectTimeoutId = null; }
}

function cancelTelegramConnect() {
  stopTelegramConnectListener();
  const waitingBlock = document.getElementById('tgWaitingBlock');
  if (waitingBlock) waitingBlock.style.display = 'none';
}

function onTelegramConnected(chatId) {
  stopTelegramConnectListener();
  userProfile.telegramChatId = chatId;
  localStorage.setItem('telegramChatId', chatId);
  const waitingBlock = document.getElementById('tgWaitingBlock');
  if (waitingBlock) waitingBlock.style.display = 'none';
  renderTelegramConnectionUI();
}

async function disconnectTelegram() {
  if (!confirm('Відключити Telegram-сповіщення? Ви зможете підключитись знову будь-коли.')) return;
  userProfile.telegramChatId = '';
  localStorage.removeItem('telegramChatId');
  if (currentUser && firebaseReady) {
    try {
      await db.collection('users').doc(effectiveUid(currentUser.uid)).set(
        { profile: { telegramChatId: '' } },
        { merge: true }
      );
    } catch(e) { console.warn('Telegram disconnect save failed:', e); }
  }
  renderTelegramConnectionUI();
}

function saveTelegramChatId() {
  const chatId = document.getElementById('telegramChatId').value.trim();
  if (!chatId) return;
  userProfile.telegramChatId = chatId;
  localStorage.setItem('telegramChatId', chatId);
  if (currentUser) saveProfileToFirestore();
  renderTelegramConnectionUI();
}

async function sendTestTelegram() {
  const chatId = userProfile.telegramChatId || document.getElementById('telegramChatId').value.trim();
  const resultEl = document.getElementById('telegramTestResult');

  if (!chatId) {
    resultEl.textContent = 'Спочатку введіть Chat ID';
    resultEl.style.color = '#f87171';
    resultEl.style.display = 'block';
    return;
  }

  const userName = userProfile.displayName || (currentUser ? currentUser.displayName : '') || 'Інвестор';

  try {
    resultEl.textContent = 'Надсилаю...';
    resultEl.style.color = '#94a3b8';
    resultEl.style.display = 'block';

    const res = await apiFetch('/telegram/test', { chat_id: chatId, name: userName });
    const data = await res.json();

    if (data.ok) {
      resultEl.textContent = '✓ Повідомлення надіслано!';
      resultEl.style.color = '#4ade80';
    } else {
      resultEl.textContent = 'Помилка: ' + (data.description || 'невідома');
      resultEl.style.color = '#f87171';
    }
  } catch(e) {
    resultEl.textContent = 'Помилка мережі: ' + e.message;
    resultEl.style.color = '#f87171';
  }

  resultEl.style.animation = 'none';
  resultEl.offsetHeight;
  resultEl.style.animation = 'fadeOut 5s forwards';
  setTimeout(() => { resultEl.style.display = 'none'; }, 5000);
}
