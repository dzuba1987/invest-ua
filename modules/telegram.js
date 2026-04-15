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

// ---- User notification settings ----

function saveNotifySettings() {
  const days = document.getElementById('notifyDays').value;
  const emailOn = document.getElementById('notifyEmail').checked;
  const tgOn = document.getElementById('notifyTelegram').checked;
  const botOn = document.getElementById('useTelegramBot').checked;

  localStorage.setItem('notifyDays', days);
  localStorage.setItem('notifyEmail', emailOn);
  localStorage.setItem('notifyTelegram', tgOn);
  localStorage.setItem('useTelegramBot', botOn);

  document.getElementById('telegramLinkSection').style.display = tgOn ? 'block' : 'none';

  if (currentUser) {
    userProfile.notifyDays = parseInt(days);
    userProfile.notifyEmail = emailOn;
    userProfile.notifyTelegram = tgOn;
    userProfile.useTelegramBot = botOn;
    saveProfileToFirestore();
  }
}

function loadNotifySettings() {
  const days = userProfile.notifyDays || localStorage.getItem('notifyDays') || '3';
  const emailOn = userProfile.notifyEmail || localStorage.getItem('notifyEmail') === 'true';
  const tgOn = userProfile.notifyTelegram || localStorage.getItem('notifyTelegram') === 'true';
  const botOn = userProfile.useTelegramBot || localStorage.getItem('useTelegramBot') === 'true';
  const tgChatId = userProfile.telegramChatId || '';

  document.getElementById('notifyDays').value = days;
  document.getElementById('notifyEmail').checked = emailOn;
  document.getElementById('notifyTelegram').checked = tgOn;
  document.getElementById('useTelegramBot').checked = botOn;
  document.getElementById('telegramLinkSection').style.display = tgOn ? 'block' : 'none';

  document.getElementById('telegramChatId').value = tgChatId;

  const botName = typeof TELEGRAM_BOT_NAME !== 'undefined' ? TELEGRAM_BOT_NAME : 'my_invest_ua_bot';
  const link = document.getElementById('telegramBotLink');
  if (link && currentUser) {
    link.href = 'https://t.me/' + botName + '?start=' + currentUser.uid;
  }

  document.getElementById('btnTestTelegram').style.display = tgChatId ? 'block' : 'none';

  const statusEl = document.getElementById('telegramStatus');
  if (statusEl) {
    if (tgChatId) {
      statusEl.innerHTML = '<span style="color:#4ade80;font-size:12px">✓ Telegram підключено (Chat ID: ' + esc(tgChatId) + ')</span>';
    } else {
      statusEl.innerHTML = '';
    }
  }
}

function saveTelegramChatId() {
  const chatId = document.getElementById('telegramChatId').value.trim();
  if (!chatId) return;
  userProfile.telegramChatId = chatId;
  localStorage.setItem('telegramChatId', chatId);
  if (currentUser) saveProfileToFirestore();

  document.getElementById('btnTestTelegram').style.display = 'block';
  const statusEl = document.getElementById('telegramStatus');
  statusEl.innerHTML = '<span style="color:#4ade80;font-size:12px">✓ Telegram підключено (Chat ID: ' + esc(chatId) + ')</span>';
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
