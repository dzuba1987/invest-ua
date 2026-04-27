// ============ SHARED GLOBALS (used across app.js, firebase.js, telegram.js) ============
var _skipFirestoreSync = false;

// ============ THEME ↔ CHART.JS ============
// Оновлює кольори гридів/легенди існуючих графіків при зміні теми.
function updateChartJsColors() {
  if (typeof Chart === 'undefined') return;
  var isLight = document.documentElement.getAttribute('data-theme-effective') === 'light';
  var gridColor = isLight ? '#e2e8f0' : '#1e293b';
  var tickColor = isLight ? '#475569' : '#64748b';
  var legendColor = isLight ? '#334155' : '#94a3b8';

  Chart.defaults.color = legendColor;
  if (Chart.defaults.scale) {
    Chart.defaults.scale.grid = Chart.defaults.scale.grid || {};
    Chart.defaults.scale.grid.color = gridColor;
    Chart.defaults.scale.ticks = Chart.defaults.scale.ticks || {};
    Chart.defaults.scale.ticks.color = tickColor;
  }

  var instances = Chart.instances || {};
  Object.keys(instances).forEach(function(key) {
    var chart = instances[key];
    try {
      if (chart.options && chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
        chart.options.plugins.legend.labels.color = legendColor;
      }
      if (chart.options && chart.options.scales) {
        Object.keys(chart.options.scales).forEach(function(sk) {
          var scale = chart.options.scales[sk];
          if (!scale) return;
          if (scale.ticks) scale.ticks.color = tickColor;
          if (scale.grid) scale.grid.color = gridColor;
        });
      }
      chart.update('none');
    } catch(e) { /* noop */ }
  });
}

window.addEventListener('themechange', updateChartJsColors);
// При початковому завантаженні (Chart може завантажитись пізніше)
document.addEventListener('DOMContentLoaded', function() {
  if (typeof Chart !== 'undefined') updateChartJsColors();
  // Load built-in changelog early so the updates badge is ready before auth.
  if (typeof loadChangelog === 'function') loadChangelog();
});

// ============ GLOBAL SEARCH ============
// Single entry point with debounce; indexes portfolio, dream, savings,
// calc history, currencies and navigation shortcuts. Each source caps its
// own contribution so a single query can't flood the dropdown.
let _globalSearchDebounceTimer = null;
function onGlobalSearch() {
  const q = document.getElementById('globalSearchInput').value.toLowerCase().trim();
  const clearBtn = document.getElementById('globalSearchClear');
  clearBtn.style.display = q ? 'block' : 'none';
  if (_globalSearchDebounceTimer) clearTimeout(_globalSearchDebounceTimer);
  _globalSearchDebounceTimer = setTimeout(_runGlobalSearch, 120);
}

function _runGlobalSearch() {
  const q = document.getElementById('globalSearchInput').value.toLowerCase().trim();
  const resultsEl = document.getElementById('globalSearchResults');
  if (!q || q.length < 2) { resultsEl.style.display = 'none'; return; }

  const matches = (text) => (text || '').toLowerCase().includes(q);
  const results = [];
  const SECTION_LIMIT = 6; // cap each source

  // Portfolio
  if (typeof portfolioItems !== 'undefined') {
    const hit = portfolioItems.filter(p => matches(p.name) || matches(p.bank) || matches(p.notes)).slice(0, SECTION_LIMIT);
    hit.forEach(p => results.push({
      icon: '💼', title: p.name,
      sub: formatShort(p.invested) + ' грн' + (p.dateEnd ? ' · ' + p.dateEnd : ''),
      badge: 'Портфель', badgeClass: 'search-badge-portfolio',
      action: () => { goToTab('portfolio'); openInvestmentDetail(String(p.id)); clearGlobalSearch(); }
    }));
  }

  // Dreams
  if (typeof dreamItems !== 'undefined') {
    const hit = dreamItems.filter(d => matches(d.name) || matches(d.notes)).slice(0, SECTION_LIMIT);
    hit.forEach(d => {
      const cc = (d.currency || 'UAH').toUpperCase();
      const sym = cc === 'USD' ? '$' : cc === 'EUR' ? '€' : '';
      const amountStr = cc === 'UAH' ? formatShort(d.saved || 0) + ' з ' + formatShort(d.target || 0) + ' грн'
        : sym + formatShort(d.saved || 0) + ' з ' + sym + formatShort(d.target || 0);
      results.push({
        icon: d.icon || '🎯', title: d.name,
        sub: amountStr,
        badge: 'Мрія', badgeClass: 'search-badge-dream',
        action: () => { goToTab('dreams'); if (typeof openDreamDetail === 'function') openDreamDetail(String(d.id)); clearGlobalSearch(); }
      });
    });
  }

  // Savings
  if (typeof savingItems !== 'undefined') {
    const hit = savingItems.filter(s => matches(s.name) || matches(s.notes)).slice(0, SECTION_LIMIT);
    const dreamsById = {};
    (typeof dreamItems !== 'undefined' ? dreamItems : []).forEach(d => { dreamsById[String(d.id)] = d; });
    hit.forEach(s => {
      const cc = (s.currency || 'UAH').toUpperCase();
      const sym = cc === 'USD' ? '$' : cc === 'EUR' ? '€' : '';
      const amountStr = cc === 'UAH' ? formatShort(s.amount || 0) + ' грн' : sym + formatShort(s.amount || 0);
      const link = s.dreamId && dreamsById[String(s.dreamId)] ? ' · ' + (dreamsById[String(s.dreamId)].icon || '🎯') + ' ' + dreamsById[String(s.dreamId)].name : ' · вільні';
      results.push({
        icon: '💰', title: s.name,
        sub: amountStr + link,
        badge: 'Заощадж.', badgeClass: 'search-badge-saving',
        action: () => { goToTab('savings'); clearGlobalSearch(); }
      });
    });
  }

  // Purchases (private + shared)
  const allPurchases = [
    ...(typeof purchaseItems !== 'undefined' ? purchaseItems : []),
    ...(typeof sharedPurchaseItems !== 'undefined' ? sharedPurchaseItems : [])
  ];
  if (allPurchases.length) {
    const hit = allPurchases.filter(p => matches(p.name) || matches(p.notes) || matches(p.link)).slice(0, SECTION_LIMIT);
    hit.forEach(p => {
      const cc = (p.currency || 'UAH').toUpperCase();
      const sym = cc === 'USD' ? '$' : cc === 'EUR' ? '€' : '';
      const amountStr = cc === 'UAH' ? formatShort(p.amount || 0) + ' грн' : sym + formatShort(p.amount || 0);
      const monthStr = (p.plannedDate || p.plannedMonth) ? ' · ' + formatPurchaseWhen(p) : '';
      const boughtStr = p.bought ? ' · ✓ здійснено' : '';
      const isShared = typeof sharedPurchaseItems !== 'undefined' && sharedPurchaseItems.some(x => String(x.id) === String(p.id));
      const sharedStr = isShared ? ' · 👥 спільна' : '';
      const pid = String(p.id);
      results.push({
        icon: p.icon || '🛒', title: p.name,
        sub: amountStr + monthStr + boughtStr + sharedStr,
        badge: 'Витрата', badgeClass: 'search-badge-purchase',
        action: () => { goToTab('purchases'); clearGlobalSearch(); setTimeout(() => { if (typeof openPurchaseDetail === 'function') openPurchaseDetail(pid); }, 60); }
      });
    });
  }

  // Calculation history
  if (typeof savedRecords !== 'undefined') {
    const hit = savedRecords.filter(r => matches(r.name)).slice(0, SECTION_LIMIT);
    hit.forEach(r => results.push({
      icon: '📊', title: r.name,
      sub: formatShort(r.invested) + ' → ' + formatShort(r.received) + ' грн · ' + r.annualRate.toFixed(1) + '%',
      badge: 'Історія', badgeClass: 'search-badge-history',
      action: () => { goToTab('calc'); loadRecordToForm(r); clearGlobalSearch(); }
    }));
  }

  // Currencies (NBU rates)
  if (cachedRatesArray) {
    const hit = cachedRatesArray.filter(r => matches(r.cc) || matches(r.txt)).slice(0, 5);
    hit.forEach(r => results.push({
      icon: '💱', title: r.cc + ' — ' + r.txt,
      sub: r.rate.toFixed(4) + ' грн',
      badge: 'Валюта', badgeClass: 'search-badge-currency',
      action: () => { goToTab('currencies'); clearGlobalSearch(); }
    }));
  }

  // Navigation shortcuts
  const navItems = [
    { keywords: ['портфель', 'portfolio', 'вклад', 'інвест', 'овдп', 'депозит'], title: 'Портфель', icon: '💼', tab: 'portfolio' },
    { keywords: ['калькулятор', 'calculator', 'розрах', 'кредит'], title: 'Калькулятор', icon: '🧮', tab: 'calc' },
    { keywords: ['аналітик', 'analytics', 'рейтинг', 'комбін'], title: 'Аналітика', icon: '📈', tab: 'analytics' },
    { keywords: ['валют', 'курс', 'dollar', 'євро', 'usd', 'eur', 'currency', 'нбу'], title: 'Валюти', icon: '💱', tab: 'currencies' },
    { keywords: ['мрі', 'dream', 'ціль', 'goal'], title: 'Мрії', icon: '🎯', tab: 'dreams' },
    { keywords: ['заощадж', 'saving', 'готівк', 'cash', 'сейф'], title: 'Заощадження', icon: '💰', tab: 'savings' },
    { keywords: ['профіль', 'profile', 'налашт', 'settings', 'telegram', 'мова', 'тема'], title: 'Профіль', icon: '⚙️', tab: 'profile' },
  ];
  navItems.forEach(nav => {
    if (nav.keywords.some(k => k.includes(q) || q.includes(k))) {
      results.push({
        icon: nav.icon, title: nav.title, sub: 'Перейти до розділу',
        badge: 'Розділ', badgeClass: 'search-badge-nav',
        action: () => { goToTab(nav.tab); clearGlobalSearch(); }
      });
    }
  });

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="search-no-results">Нічого не знайдено</div>';
  } else {
    resultsEl.innerHTML = sanitize(results.map((r, i) =>
      `<div class="search-result-item" onclick="globalSearchResults[${i}]()">
        <span class="search-result-icon">${r.icon}</span>
        <div class="search-result-text">
          <div class="search-result-title">${esc(r.title)}</div>
          <div class="search-result-sub">${esc(r.sub)}</div>
        </div>
        <span class="search-result-badge ${r.badgeClass}">${r.badge}</span>
      </div>`
    ).join(''));
    window.globalSearchResults = results.map(r => r.action);
  }
  resultsEl.style.display = 'block';
}

function clearGlobalSearch() {
  document.getElementById('globalSearchInput').value = '';
  document.getElementById('globalSearchResults').style.display = 'none';
  document.getElementById('globalSearchClear').style.display = 'none';
}

function goToTab(tab) {
  const btn = document.querySelector(`.main-tab[onclick*="'${tab}'"]`);
  if (btn) switchMainTab(tab, btn);
}

// Close search results on click outside
document.addEventListener('click', e => {
  if (!e.target.closest('#globalSearch')) {
    document.getElementById('globalSearchResults').style.display = 'none';
  }
});

// ============ SECURITY HELPERS ============
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Sanitize HTML for innerHTML (DOMPurify as second layer, allows onclick for UI)
function sanitize(html) {
  if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html, { ADD_ATTR: ['onclick', 'style', 'data-cc', 'data-name', 'data-hint', 'title'] });
  return html;
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin + '_invest_ua_salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ TAB SWITCHING ============
async function switchMainTab(tab, btn) {
  // Guard: block leaving a tab while a form has unsaved edits
  if (typeof FormDrafts !== 'undefined') {
    const currentActive = document.querySelector('.main-tab.active');
    const currentTab = currentActive ? currentActive.textContent.trim().toLowerCase() : '';
    // Check only forms visible on the tab we are leaving
    const visible = dirtyFormsOnActiveTab();
    for (const id of visible) {
      if (!await FormDrafts.confirmDiscard(id, 'У формі є незбережені зміни. Перейти на іншу вкладку без збереження?', { okText: 'Перейти', cancelText: 'Залишитись' })) {
        return;
      }
      // Discard confirmed — close the form so stale edit state (e.g. _editingDreamId)
      // cannot accidentally overwrite the original record on the next save.
      if (id === 'dream.form' && typeof toggleDreamForm === 'function') toggleDreamForm(false);
      if (id === 'portfolio.form' && typeof togglePortfolioForm === 'function') togglePortfolioForm(false);
      if (id === 'saving.form' && typeof toggleSavingsForm === 'function') toggleSavingsForm(false);
      if (id === 'purchase.form' && typeof togglePurchaseForm === 'function') togglePurchaseForm(false);
    }
  }
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  if (btn && btn.classList && btn.classList.contains('main-tab')) btn.classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
  // Sync the header "Профіль" button with active state when we're on the profile tab.
  const profileBtn = document.getElementById('btnProfile');
  if (profileBtn) profileBtn.classList.toggle('active', tab === 'profile');
  // On narrow screens the tab strip scrolls horizontally — bring the active
  // tab into view so the user always sees which section they're on.
  const activeBtn = btn && btn.classList && btn.classList.contains('main-tab')
    ? btn
    : document.querySelector('.main-tab.active');
  if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
    try { activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch(_) {}
  }
  localStorage.setItem('activeTab', tab);
  if (tab === 'analytics') checkAnalyticsReady();
  if (tab === 'portfolio') updatePortfolioUI();
  if (tab === 'currencies') loadCurrenciesPage();
  if (tab === 'dreams') updateDreamsUI();
  if (tab === 'savings') updateSavingsUI();
  if (tab === 'purchases') updatePurchasesUI();
  if (tab === 'updates') updateUpdatesUI();
  if (tab === 'profile') { updateProfileUI(); renderDashboardCurrencySettings(); }
}

// Returns draft IDs whose DOM form is currently visible (on the active tab and not hidden).
function dirtyFormsOnActiveTab() {
  if (typeof FormDrafts === 'undefined') return [];
  const activePanel = document.querySelector('.tab-panel.active');
  if (!activePanel) return [];
  const out = [];
  const check = (draftId, anchorId, requireVisible) => {
    const el = document.getElementById(anchorId);
    if (!el || !activePanel.contains(el)) return;
    if (requireVisible && el.offsetParent === null) return;
    if (FormDrafts.isDirty(draftId)) out.push(draftId);
  };
  check('portfolio.form', 'portfolioFormCard', true);
  check('dream.form', 'dreamFormCard', true);
  check('saving.form', 'savingsFormCard', true);
  check('purchase.form', 'purchaseFormCard', true);
  check('profile', 'profileContent', false);
  check('calc', 'invested', false);
  check('credit', 'creditAmount', true);
  return out;
}


// ============ STATE ============
let activeField = null;
let savedRecords = [];

// ============ HELPERS ============
function formatNum(n) {
  if (n == null || isNaN(n)) return '0,00';
  return Number(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatShort(n) {
  if (n == null || isNaN(n)) return '0,00';
  return Number(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseNum(str) {
  if (!str) return NaN;
  return parseFloat(str.replace(/[\s\u00a0]/g, '').replace(',', '.'));
}
function getVal(id) {
  const v = document.getElementById(id).value.trim();
  return v ? parseNum(v) : NaN;
}
function setAutoVal(id, value) {
  if (id === activeField) return;
  const el = document.getElementById(id);
  const formatted = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  el.value = formatted;
  el.classList.add('auto-filled');
  if (id === 'invested') document.getElementById('aBudget').value = Math.round(value);
}
function clearAutoVal(id) {
  if (id === activeField) return;
  const el = document.getElementById(id);
  if (el.classList.contains('auto-filled')) {
    el.value = '';
    el.classList.remove('auto-filled');
  }
}
function isManual(id) {
  return document.getElementById(id).value.trim() !== '' && !document.getElementById(id).classList.contains('auto-filled');
}
function showRow(id, show) {
  document.getElementById(id).style.display = show ? 'flex' : 'none';
}
function getDays() {
  const ds = document.getElementById('dateStart').value;
  const de = document.getElementById('dateEnd').value;
  if (!ds || !de) return NaN;
  return Math.round((new Date(de) - new Date(ds)) / (1000*60*60*24));
}
function formatTerm(diffDays) {
  if (diffDays < 60) return diffDays + ' дн.';
  const m = Math.floor(diffDays / 30.44);
  const d = Math.round(diffDays - m * 30.44);
  return m + ' міс.' + (d > 0 ? ' ' + d + ' дн.' : '');
}
function formatInput(el) {
  let pos = el.selectionStart;
  let raw = el.value.replace(/[\s\u00a0]/g, '').replace(/[^0-9.,]/g, '');
  let parts = raw.split(/[.,]/);
  let intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  let result = parts.length > 1 ? intPart + ',' + parts[1] : intPart;
  let diff = result.length - el.value.length;
  el.value = result;
  el.setSelectionRange(pos + diff, pos + diff);
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('uk-UA');
}

// ============ DEFAULT DATES ============
const today = new Date();
document.getElementById('dateStart').value = today.toISOString().split('T')[0];
const futureDate = new Date(today);
futureDate.setMonth(futureDate.getMonth() + 3);
document.getElementById('dateEnd').value = futureDate.toISOString().split('T')[0];

// ============ REACTIVE INPUTS ============
const numFields = ['bondPrice', 'bondCount', 'invested', 'received', 'annualRateInput', 'diffAmount', 'bonusPercent'];

numFields.forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('focus', () => { activeField = id; });
  el.addEventListener('blur', () => { if (activeField === id) activeField = null; });
  el.addEventListener('input', () => {
    el.classList.remove('auto-filled');
    formatInput(el);
    update(id);
  });
});

document.getElementById('bondName').addEventListener('input', () => calculate());

['dateStart', 'dateEnd'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => update(id));
  document.getElementById(id).addEventListener('change', () => update(id));
});

// ============ AUTO-FORMAT MONEY FIELDS ============
['pBondPrice', 'pBondCount', 'pInvested', 'pRate', 'pTax', 'pIndex',
 'pCompoundRate', 'pCompoundIndex',
 'dreamTarget', 'dreamSaved', 'dreamMonthly', 'dreamExpenses',
 'savingAmount', 'purchaseAmount', 'budgetAmountInput',
 'creditAmount', 'creditRate', 'creditDown'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => formatInput(el));
});

// ============ PORTFOLIO BOND FIELDS REACTIVE ============
// Only one direction: price × count → invested (with Diia commission factor).
// Price is not back-computed from invested/count to avoid overwriting a value
// the user entered manually. When an ОВДП bond is selected via the picker,
// we also auto-fill "receive at maturity" from bond metadata × count.
//
// When "receive at maturity" is filled, compute the implied effective annual
// yield and show it next to the user-entered rate, so the difference is visible.
// We do NOT overwrite pRate — that stays whatever the user entered (or what the
// picker pre-filled from the bond's nominal-based YTM).
// Update the "Сума вкладення" currency hint label based on selected cash currency.
function onPCashCurrencyChange() {
  const isCash = document.getElementById('pType').value === 'cash';
  const label = document.getElementById('pInvestedCurLabel');
  if (!label) return;
  if (!isCash) { label.textContent = '(грн)'; return; }
  const cc = (document.getElementById('pCashCurrency').value || 'UAH').toUpperCase();
  label.textContent = cc === 'UAH' ? '(грн)' : (cc === 'USD' ? '($)' : cc === 'EUR' ? '(€)' : '(' + cc + ')');
}

// Portfolio cash currency helpers.
function portfolioCurOf(p) { return (p && p.currency) || 'UAH'; }
function portfolioToUah(amount, cc) {
  if (!cc || cc === 'UAH') return amount;
  if (typeof cachedRates === 'undefined' || !cachedRates || !cachedRates[cc]) return amount;
  return amount * cachedRates[cc];
}
function fmtPortfolioAmount(amount, cc) {
  if (!cc || cc === 'UAH') return formatNum(amount) + ' грн';
  const sym = cc === 'USD' ? '$' : cc === 'EUR' ? '€' : cc + ' ';
  const uah = portfolioToUah(amount, cc);
  const uahPart = uah !== amount && typeof cachedRates !== 'undefined' && cachedRates && cachedRates[cc]
    ? ' <span style="color:#64748b;font-size:12px;font-weight:400">≈ ' + formatNum(uah) + ' грн</span>'
    : '';
  return sym + formatNum(amount) + uahPart;
}

// Real annual yield implied by a portfolio item's receivedAtMaturity.
// Returns null when it can't be computed (no receivedAtMaturity / dates / invested).
function computeRealRate(item) {
  if (!item || !item.receivedAtMaturity || !item.invested || !item.dateStart || !item.dateEnd) return null;
  const days = Math.round((new Date(item.dateEnd) - new Date(item.dateStart)) / 86400000);
  if (days <= 0) return null;
  return (item.receivedAtMaturity - item.invested) / item.invested * (365 / days) * 100;
}

function _updateRealRateDisplay() {
  const display = document.getElementById('pRealRateDisplay');
  if (!display) return;
  const received = parseNum(document.getElementById('pReceivedAtMaturity').value);
  const invested = parseNum(document.getElementById('pInvested').value);
  const dateStartVal = document.getElementById('pDateStart').value;
  const dateEndVal = document.getElementById('pDateEnd').value;
  if (isNaN(received) || received <= 0 || isNaN(invested) || invested <= 0 || !dateStartVal || !dateEndVal) {
    display.style.display = 'none';
    display.textContent = '';
    return;
  }
  const days = Math.round((new Date(dateEndVal) - new Date(dateStartVal)) / 86400000);
  if (days <= 0) { display.style.display = 'none'; return; }
  const realRate = (received - invested) / invested * (365 / days) * 100;
  const enteredRate = parseNum(document.getElementById('pRate').value);
  const diff = !isNaN(enteredRate) ? enteredRate - realRate : 0;
  const diffPart = !isNaN(enteredRate) && Math.abs(diff) > 0.05
    ? ` <span style="color:#f59e0b">(введено ${enteredRate.toFixed(2)}% — різниця ${diff > 0 ? '+' : ''}${diff.toFixed(2)}%)</span>`
    : '';
  display.innerHTML = `Реальна ставка: <strong style="color:#4ade80">${realRate.toFixed(2)}%</strong>${diffPart}`;
  display.style.display = '';
}
['pReceivedAtMaturity', 'pInvested', 'pDateStart', 'pDateEnd', 'pRate'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', _updateRealRateDisplay);
    el.addEventListener('change', _updateRealRateDisplay);
  }
});
['pBondPrice', 'pBondCount'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const price = parseNum(document.getElementById('pBondPrice').value);
    const count = parseNum(document.getElementById('pBondCount').value);
    const priceEl = document.getElementById('pBondPrice');
    const bond = priceEl && priceEl._ovdpBond;
    const dateStartVal = document.getElementById('pDateStart')?.value || '';
    const hasCommission = !!bond && typeof applyDiiaCommission === 'function' && applyDiiaCommission(dateStartVal);

    if (!isNaN(price) && !isNaN(count) && price > 0 && count > 0) {
      const totalCost = hasCommission ? price * count * (1 + DIIA_COMMISSION_RATE) : price * count;
      document.getElementById('pInvested').value = formatNum(totalCost);
    }

    // Auto-fill "receive at maturity" for ОВДП picker-selected bonds.
    if (bond && !isNaN(count) && count > 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const remaining = (bond.couponDates || []).filter(d => d > todayStr).length;
      const perBond = 1000 + remaining * (bond.couponAmount || 0);
      document.getElementById('pReceivedAtMaturity').value = formatNum(perBond * count);
      _updateRealRateDisplay();
    }
  });
});

// ============ COMPOUND FIELDS REACTIVE ============
['compoundRate', 'compoundIndex', 'compoundTax'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => calculate());
});
document.getElementById('compoundYears').addEventListener('change', () => calculate());

// ============ SYNC BUDGET WITH INVESTED ============
document.getElementById('invested').addEventListener('change', () => {
  const v = getVal('invested');
  if (!isNaN(v) && v > 0) document.getElementById('aBudget').value = Math.round(v);
});

// ============ REACTIVE UPDATE ============
function update(changedField) {
  if (changedField === 'bondPrice' || changedField === 'bondCount') {
    const price = getVal('bondPrice');
    const count = getVal('bondCount');
    if (!isNaN(price) && !isNaN(count) && price > 0 && count > 0) {
      // Для ОВДП через Дію додаємо комісію 0.20% (з 15.04.2026)
      const priceEl = document.getElementById('bondPrice');
      const isOvdp = priceEl && priceEl._ovdpBond;
      const dateStartVal = document.getElementById('dateStart') ? document.getElementById('dateStart').value : '';
      const hasCommission = isOvdp && typeof applyDiiaCommission === 'function' && applyDiiaCommission(dateStartVal);
      const totalCost = hasCommission ? price * count * (1 + DIIA_COMMISSION_RATE) : price * count;
      setAutoVal('invested', totalCost);
    } else { clearAutoVal('invested'); }
  }

  if (['annualRateInput', 'invested', 'bondPrice', 'bondCount', 'dateStart', 'dateEnd'].includes(changedField)) {
    const rate = getVal('annualRateInput');
    const invested = getVal('invested');
    const days = getDays();
    if (!isNaN(rate) && !isNaN(invested) && !isNaN(days) && rate > 0 && invested > 0 && days > 0) {
      const recv = invested * (1 + (rate / 100) * (days / 365.25));
      setAutoVal('received', recv);
      setAutoVal('diffAmount', recv - invested);
    } else if (changedField === 'annualRateInput') {
      clearAutoVal('received');
      clearAutoVal('diffAmount');
    }
  }

  if (changedField === 'diffAmount') {
    const invested = getVal('invested');
    const diff = getVal('diffAmount');
    if (!isNaN(invested) && !isNaN(diff) && invested > 0) {
      setAutoVal('received', invested + diff);
    } else { clearAutoVal('received'); }
  }

  if (changedField === 'received' || (changedField === 'invested' && !isManual('diffAmount'))) {
    const invested = getVal('invested');
    const received = getVal('received');
    if (!isNaN(invested) && !isNaN(received) && invested > 0 && received > 0) {
      setAutoVal('diffAmount', received - invested);
    } else { clearAutoVal('diffAmount'); }
  }

  calculate();
}

let _calcPrevType = null;
function toggleCalcTypeFields() {
  const type = document.getElementById('calcType').value;
  const isOvdp = type === 'ovdp';
  const isDeposit = type === 'deposit';
  const isInsurance = type === 'insurance';

  // When user actually switches type, prior inputs and results no longer apply
  // (e.g. ОВДП auto-fills price/qty/dates from a selected bond — meaningless
  // on a deposit). Clear before the rest of the toggle so calculate() at the
  // end runs on a blank slate.
  if (_calcPrevType !== null && _calcPrevType !== type) {
    _resetCalcForm();
  }
  _calcPrevType = type;

  const compoundToggle = document.querySelector('.compound-toggle');
  const cb = document.getElementById('compoundCheck');

  if (compoundToggle) compoundToggle.style.display = isDeposit ? '' : 'none';

  if (isInsurance && !cb.checked) {
    cb.checked = true;
    toggleCompoundOptions();
  } else if (!isDeposit && !isInsurance && cb.checked) {
    cb.checked = false;
    toggleCompoundOptions();
  }

  document.getElementById('fieldBondName').style.display = '';
  document.getElementById('fieldBondPrice').style.display = isOvdp ? '' : 'none';
  document.getElementById('fieldBondCount').style.display = isOvdp ? '' : 'none';
  document.getElementById('fieldReceived').style.display = isInsurance ? 'none' : '';
  document.getElementById('fieldDiff').style.display = isInsurance ? 'none' : '';

  const lblBondName = document.getElementById('labelBondName');
  const inpBondName = document.getElementById('bondName');
  if (lblBondName) {
    lblBondName.textContent = isOvdp
      ? (t('calc.bondName') || 'Назва облігації')
      : (t('calc.recordName') || 'Назва');
  }
  if (inpBondName) {
    const placeholders = {
      ovdp: 'Військові ОВДП серія 123/456',
      deposit: 'Депозит у ПриватБанку',
      insurance: 'Поліс TAS',
      other: 'Назва інвестиції'
    };
    inpBondName.placeholder = placeholders[type] || 'Назва';
  }

  const ovdpSection = document.getElementById('ovdpSection');
  if (ovdpSection) {
    const bondsReady = typeof ovdpBonds !== 'undefined' && ovdpBonds.length > 0;
    ovdpSection.style.display = (isOvdp && bondsReady) ? '' : 'none';
  }

  calculate();
}

function toggleCompoundOptions() {
  const isCompound = document.getElementById('compoundCheck').checked;
  document.getElementById('compoundTermField').style.display = isCompound ? '' : 'none';
  document.getElementById('compoundRateField').style.display = isCompound ? '' : 'none';
  document.getElementById('compoundTaxField').style.display = isCompound ? '' : 'none';
  document.getElementById('compoundIndexField').style.display = isCompound ? '' : 'none';

  if (isCompound) {
    const cr = document.getElementById('compoundRate');
    if (!cr.value) cr.value = '10';
    const ct = document.getElementById('compoundTax');
    if (!ct.value) ct.value = document.getElementById('bonusPercent').value || '';
    // Set default dates: today + 2 years
    const now = new Date();
    document.getElementById('dateStart').value = now.toISOString().split('T')[0];
    const end = new Date(now);
    end.setFullYear(end.getFullYear() + 2);
    document.getElementById('dateEnd').value = end.toISOString().split('T')[0];
  } else {
    // Reset to 3 months
    const now = new Date();
    document.getElementById('dateStart').value = now.toISOString().split('T')[0];
    const end = new Date(now);
    end.setMonth(end.getMonth() + 3);
    document.getElementById('dateEnd').value = end.toISOString().split('T')[0];
  }

  // Hide bond-specific fields in compound mode; also respect calcType if present
  const calcTypeEl = document.getElementById('calcType');
  const ctype = calcTypeEl ? calcTypeEl.value : null;
  const isOvdpType = ctype === 'ovdp';
  const bondFields = ['fieldBondPrice', 'fieldBondCount'];
  bondFields.forEach(id => {
    const hide = isCompound || (ctype && !isOvdpType);
    document.getElementById(id).style.display = hide ? 'none' : '';
  });
  // Name field stays visible for all types — even in compound mode users want
  // to label their record before saving.
  document.getElementById('fieldBondName').style.display = '';
  ['fieldReceived', 'fieldDiff'].forEach(id => {
    const hide = isCompound || ctype === 'insurance';
    document.getElementById(id).style.display = hide ? 'none' : '';
  });

  // Update labels
  document.getElementById('labelInvested').textContent = isCompound
    ? (t('calc.depositAmount') || 'Сума вкладу (грн)')
    : (t('calc.invested') || 'Сума вкладення (грн)');
  document.getElementById('labelDateStart').textContent = isCompound
    ? (t('calc.periodStart') || 'Початок періоду')
    : (t('calc.dateStart') || 'Дата вкладення');
  document.getElementById('labelDateEnd').textContent = isCompound
    ? (t('calc.periodEnd') || 'Кінець періоду')
    : (t('calc.dateEnd') || 'Дата отримання');

  calculate();
}

// ============ CALCULATE & DISPLAY ============
let compoundChartInstance = null;

function calculate() {
  const errorEl = document.getElementById('error');
  const resultsEl = document.getElementById('results');
  errorEl.style.display = 'none';

  const bondPrice = getVal('bondPrice');
  const bondCount = getVal('bondCount');
  let invested = getVal('invested');
  let received = getVal('received');
  const annualRateInput = getVal('annualRateInput');
  const diffAmount = getVal('diffAmount');
  const diffDays = getDays();

  const hasBondPrice = !isNaN(bondPrice) && bondPrice > 0;
  const hasBondCount = !isNaN(bondCount) && bondCount > 0;
  const hasRate = !isNaN(annualRateInput) && annualRateInput > 0;
  const hasDiff = !isNaN(diffAmount);

  if ((isNaN(invested) || invested <= 0) && hasBondPrice && hasBondCount) invested = bondPrice * bondCount;
  if ((isNaN(received) || received <= 0) && !isNaN(invested) && invested > 0 && hasDiff) received = invested + diffAmount;
  if ((isNaN(received) || received <= 0) && !isNaN(invested) && invested > 0 && hasRate && !isNaN(diffDays) && diffDays > 0)
    received = invested * (1 + (annualRateInput / 100) * (diffDays / 365.25));
  if ((isNaN(invested) || invested <= 0) && !isNaN(received) && received > 0 && hasRate && !isNaN(diffDays) && diffDays > 0)
    invested = received / (1 + (annualRateInput / 100) * (diffDays / 365.25));

  if (isNaN(invested) || invested <= 0 || isNaN(received) || received <= 0 || isNaN(diffDays) || diffDays <= 0) {
    resultsEl.classList.remove('show');
    return;
  }

  const profit = received - invested;
  const periodRate = (profit / invested) * 100;
  const annualRate = periodRate / diffDays * 365.25;

  let showBonds = hasBondPrice || hasBondCount;
  if (showBonds) {
    let bc = hasBondCount ? Math.floor(bondCount) : Math.floor(invested / bondPrice);
    document.getElementById('resBondsCount').textContent = bc + ' шт.';
    showRow('bondsCountRow', bc > 0);
    if (hasBondPrice && hasBondCount && !isManual('invested')) {
      document.getElementById('resInvestedCalc').textContent = formatNum(invested) + ' грн';
      showRow('investedCalcRow', true);
    } else { showRow('investedCalcRow', false); }
  } else {
    showRow('bondsCountRow', false);
    showRow('investedCalcRow', false);
  }
  const bondName = document.getElementById('bondName').value.trim();
  if (bondName && showBonds) {
    document.getElementById('resBondName').textContent = bondName;
    showRow('bondNameRow', true);
  } else { showRow('bondNameRow', false); }
  document.getElementById('bondsSectionLabel').style.display = showBonds ? 'block' : 'none';

  if (hasRate && !isManual('received')) {
    document.getElementById('resReceivedCalc').textContent = formatNum(received) + ' грн';
    showRow('receivedCalcRow', true);
  } else { showRow('receivedCalcRow', false); }

  document.getElementById('resProfit').textContent = formatNum(profit) + ' грн';

  if (hasBondCount || hasBondPrice) {
    const bc = hasBondCount ? Math.floor(bondCount) : Math.floor(invested / bondPrice);
    if (bc > 0) {
      document.getElementById('resProfitPerBond').textContent = formatNum(profit / bc) + ' грн';
      showRow('profitPerBondRow', true);
    } else { showRow('profitPerBondRow', false); }
  } else { showRow('profitPerBondRow', false); }

  document.getElementById('resTerm').textContent = formatTerm(diffDays);
  document.getElementById('resPeriodRate').textContent = periodRate.toFixed(2) + '%';
  document.getElementById('resAnnualRate').textContent = annualRate.toFixed(2) + '%';

  if (hasRate && isManual('received')) {
    document.getElementById('annualRateCalcRow').querySelector('.result-label').textContent = 'Річна дохідність (факт)';
  } else {
    document.getElementById('annualRateCalcRow').querySelector('.result-label').textContent = 'Річна дохідність';
  }

  document.getElementById('resNetProfit').textContent = formatNum(profit) + ' грн';
  if (hasBondCount || hasBondPrice) {
    const bc = hasBondCount ? Math.floor(bondCount) : Math.floor(invested / bondPrice);
    if (bc > 0) {
      document.getElementById('resNetPerBond').textContent = formatNum(profit / bc) + ' грн';
      showRow('netPerBondRow', true);
    } else { showRow('netPerBondRow', false); }
  } else { showRow('netPerBondRow', false); }

  // Tax on income
  const taxPct = getVal('bonusPercent');
  const hasTax = !isNaN(taxPct) && taxPct > 0;
  if (hasTax) {
    const taxAmount = profit * taxPct / 100;
    const netAfterTax = profit - taxAmount;
    document.getElementById('resBonusPct').textContent = taxPct;
    document.getElementById('resBonusAmount').textContent = '−' + formatNum(taxAmount) + ' грн';
    document.getElementById('resTotalWithBonus').textContent = formatNum(netAfterTax) + ' грн';
    document.getElementById('bonusSectionLabel').style.display = 'block';
    showRow('bonusAmountRow', true);
    showRow('totalWithBonusRow', true);
  } else {
    document.getElementById('bonusSectionLabel').style.display = 'none';
    showRow('bonusAmountRow', false);
    showRow('totalWithBonusRow', false);
  }

  // Compound interest — independent calculation from its own fields
  const compoundSection = document.getElementById('compoundSection');
  const isCompound = document.getElementById('compoundCheck').checked;
  if (isCompound && !isNaN(invested) && invested > 0 && !isNaN(diffDays) && diffDays > 0) {
    const years = parseInt(document.getElementById('compoundYears').value) || 2;

    // Compound rate from its own field (default 10)
    const cRate = parseNum(document.getElementById('compoundRate').value) || 10;
    const annualRate_c = cRate / 100;

    // Indexation
    const indexVal = parseNum(document.getElementById('compoundIndex').value);
    const indexPct = !isNaN(indexVal) ? indexVal : 0;

    // Compound tax from its own field
    const compoundTaxVal = parseNum(document.getElementById('compoundTax').value);
    const cHasTax = !isNaN(compoundTaxVal) && compoundTaxVal > 0;
    const taxRate = cHasTax ? compoundTaxVal / 100 : 0;

    // Simple yearly compound: reinvest once per year
    const labels = ['Старт'];
    const investedLine = [Math.round(invested)];
    const grossLine = [Math.round(invested)];
    const netLine = [Math.round(invested)];
    const simpleLine = [Math.round(invested)];

    let balance = invested;
    let balanceNet = invested;

    for (let y = 1; y <= years; y++) {
      const yearRate = indexPct !== 0 ? annualRate_c * Math.pow(1 + indexPct / 100, y - 1) : annualRate_c;
      balance += balance * yearRate;
      balanceNet += balanceNet * yearRate * (1 - taxRate);

      labels.push(y + (y === 1 ? ' рік' : y < 5 ? ' роки' : ' років'));
      investedLine.push(Math.round(invested));
      grossLine.push(Math.round(balance));
      netLine.push(Math.round(balanceNet));
      simpleLine.push(Math.round(invested * (1 + annualRate_c * y)));
    }

    const totalGrossProfit = balance - invested;
    const totalNetProfit = balanceNet - invested;

    document.getElementById('resCompoundPeriods').textContent = years + ' р. (щорічне реінвестування)';
    document.getElementById('resCompoundTotal').textContent = formatNum(cHasTax ? balanceNet : balance) + ' грн';
    document.getElementById('resCompoundProfit').textContent = '+' + formatNum(cHasTax ? totalNetProfit : totalGrossProfit) + ' грн'
      + (cHasTax ? ' (чисті, −' + compoundTaxVal + '% податок)' : '');

    if (cHasTax) {
      document.getElementById('resCompoundNet').textContent = 'Без податку: +' + formatNum(totalGrossProfit) + ' грн → з податком: +' + formatNum(totalNetProfit) + ' грн';
      showRow('compoundNetRow', true);
    } else {
      showRow('compoundNetRow', false);
    }

    compoundSection.style.display = 'block';
    document.getElementById('compoundFullWidth').style.display = 'block';

    // Comparison table: simple vs compound per year
    const compareEl = document.getElementById('compoundCompare');
    let cmpHtml = `<div class="compound-compare-header">
      <span></span><span style="text-align:right">Без реінвест.</span><span style="text-align:right">З реінвест.</span>
    </div>`;
    let cmpBalance = invested;
    let cmpHtmlRows = '';
    for (let y = 1; y <= years; y++) {
      const yr = indexPct !== 0 ? annualRate_c * Math.pow(1 + indexPct / 100, y - 1) : annualRate_c;
      cmpBalance += cmpBalance * yr;
      const simpleVal = invested * (1 + annualRate_c * y);
      const diff = cmpBalance - simpleVal;
      const yLabel = y + (y === 1 ? ' рік' : y < 5 ? ' роки' : ' років');
      cmpHtmlRows += `<div class="compound-compare-row">
        <span class="cc-label">${yLabel}</span>
        <span class="cc-value">${formatNum(simpleVal)} грн</span>
        <span class="cc-diff">${formatNum(cmpBalance)} грн <span style="font-size:11px;color:#4ade80">(+${formatNum(diff)})</span></span>
      </div>`;
    }
    compareEl.innerHTML = cmpHtml + cmpHtmlRows;

    // Chart
    const canvas = document.getElementById('compoundChart');
    if (canvas && typeof Chart !== 'undefined') {
      if (compoundChartInstance) compoundChartInstance.destroy();
      const simpleColor = '#f59e0b';
      const _isLightC = document.documentElement.getAttribute('data-theme-effective') === 'light';
      const _gridC = _isLightC ? '#e2e8f0' : '#1e293b';
      const _tickC = _isLightC ? '#475569' : '#64748b';
      const _legC = _isLightC ? '#334155' : '#94a3b8';
      compoundChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Вкладено',
              data: investedLine,
              borderColor: '#475569',
              borderDash: [4, 4],
              pointRadius: 0,
              borderWidth: 1.5,
              fill: false
            },
            {
              label: 'Простий відсоток',
              data: simpleLine,
              borderColor: simpleColor,
              borderDash: [6, 3],
              pointRadius: 2,
              pointBackgroundColor: simpleColor,
              borderWidth: 1.5,
              fill: false
            },
            {
              label: 'Складний відсоток',
              data: grossLine,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,0.08)',
              pointRadius: 3,
              pointBackgroundColor: '#3b82f6',
              borderWidth: 2,
              fill: true
            },
            ...(cHasTax ? [{
              label: 'Після податку',
              data: netLine,
              borderColor: '#4ade80',
              pointRadius: 3,
              pointBackgroundColor: '#4ade80',
              borderWidth: 2,
              fill: false
            }] : [])
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: _legC, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' + formatShort(ctx.raw) + ' грн'
              }
            }
          },
          scales: {
            x: { ticks: { color: _tickC, font: { size: 10 } }, grid: { color: _gridC } },
            y: {
              ticks: {
                color: _tickC,
                font: { size: 10 },
                callback: v => formatShort(v)
              },
              grid: { color: _gridC }
            }
          }
        }
      });
    }
  } else {
    compoundSection.style.display = 'none';
    document.getElementById('compoundFullWidth').style.display = 'none';
    document.getElementById('compoundCompare').innerHTML = '';
    if (compoundChartInstance) { compoundChartInstance.destroy(); compoundChartInstance = null; }
  }

  var ph = document.getElementById('resultsPlaceholder');
  if (ph) ph.style.display = 'none';
  resultsEl.classList.add('show');
}

// ============ SAVE RECORD ============
function saveRecord() {
  const isCompound = document.getElementById('compoundCheck').checked;
  const bondPrice = getVal('bondPrice');
  const bondCount = getVal('bondCount');
  let invested = getVal('invested');
  let received = getVal('received');
  const annualRateInput = getVal('annualRateInput');
  const diffDays = getDays();

  const hasBondPrice = !isNaN(bondPrice) && bondPrice > 0;
  const hasBondCount = !isNaN(bondCount) && bondCount > 0;
  const hasRate = !isNaN(annualRateInput) && annualRateInput > 0;

  if ((isNaN(invested) || invested <= 0) && hasBondPrice && hasBondCount) invested = bondPrice * bondCount;
  if ((isNaN(received) || received <= 0) && !isNaN(invested) && invested > 0 && hasRate && !isNaN(diffDays) && diffDays > 0)
    received = invested * (1 + (annualRateInput / 100) * (diffDays / 365.25));

  // In compound mode, invested is enough
  if (isCompound && !isNaN(invested) && invested > 0) {
    if (isNaN(received) || received <= 0) received = invested;
  }

  if (isNaN(invested) || invested <= 0) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = 'Заповніть дані для збереження';
    errorEl.style.display = 'block';
    return;
  }

  const profit = received - invested;
  const periodRate = invested > 0 ? (profit / invested) * 100 : 0;
  const annualRate = !isNaN(diffDays) && diffDays > 0 ? periodRate / diffDays * 365.25 : 0;

  const taxPct = getVal('bonusPercent');
  const hasTax = !isNaN(taxPct) && taxPct > 0;
  const taxAmount = hasTax ? profit * taxPct / 100 : 0;

  // Compound data
  const compoundRate = isCompound ? (parseNum(document.getElementById('compoundRate').value) || 10) : null;
  const compoundTax = isCompound ? (parseNum(document.getElementById('compoundTax').value) || null) : null;
  const compoundIndex = isCompound ? (parseNum(document.getElementById('compoundIndex').value) || 0) : null;
  const compoundYears = isCompound ? (parseInt(document.getElementById('compoundYears').value) || 2) : null;

  const calcTypeEl = document.getElementById('calcType');
  const record = {
    id: Date.now(),
    calcType: calcTypeEl ? calcTypeEl.value : null,
    name: document.getElementById('bondName').value.trim() || (isCompound ? 'Вклад (складний %)' : '—'),
    bondPrice: hasBondPrice ? bondPrice : null,
    bondCount: hasBondCount ? Math.floor(bondCount) : null,
    invested: invested,
    received: received,
    profit: profit,
    dateStart: document.getElementById('dateStart').value,
    dateEnd: document.getElementById('dateEnd').value,
    rateInput: hasRate ? annualRateInput : null,
    annualRate: annualRate,
    periodRate: periodRate,
    taxPercent: hasTax ? taxPct : null,
    taxAmount: taxAmount,
    netAfterTax: profit - taxAmount,
    compound: isCompound,
    compoundRate: compoundRate,
    compoundTax: compoundTax,
    compoundIndex: compoundIndex,
    compoundYears: compoundYears
  };

  savedRecords.push(record);
  renderSaved();

  if (typeof FormDrafts !== 'undefined') FormDrafts.clear('calc');

  const msg = document.getElementById('successMsg');
  msg.textContent = '✓ Запис збережено!';
  msg.style.display = 'block';
  msg.style.animation = 'none';
  msg.offsetHeight;
  msg.style.animation = 'fadeOut 3s forwards';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

// ============ RENDER SAVED TABLE ============
function renderSaved() {
  const section = document.getElementById('savedSection');
  const body = document.getElementById('savedBody');
  const foot = document.getElementById('savedFoot');

  if (savedRecords.length === 0) {
    section.classList.remove('show');
    return;
  }

  section.classList.add('show');
  document.getElementById('savedCount').textContent = savedRecords.length + ' шт.';

  body.innerHTML = '';
  let totalInvested = 0, totalReceived = 0, totalProfit = 0;

  savedRecords.forEach((r, i) => {
    totalInvested += r.invested;
    totalReceived += r.received;
    totalProfit += r.profit;

    let days = 0, months = 0;
    if (r.dateStart && r.dateEnd) {
      const d1 = new Date(r.dateStart), d2 = new Date(r.dateEnd);
      days = Math.round((d2 - d1) / (1000*60*60*24));
      months = +(days / 30.44).toFixed(1);
    }

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = function(e) {
      if (e.target.closest('.btn-delete')) return;
      loadRecordToForm(r);
    };
    tr.innerHTML = `
      <td>${esc(r.name)}</td>
      <td class="num">${r.bondPrice ? formatShort(r.bondPrice) : '—'}</td>
      <td class="num">${r.bondCount || '—'}</td>
      <td class="num">${formatShort(r.invested)}</td>
      <td class="num">${formatShort(r.received)}</td>
      <td class="num profit-cell">${formatShort(r.profit)}</td>
      <td>${formatDate(r.dateStart)}</td>
      <td>${formatDate(r.dateEnd)}</td>
      <td class="num">${days}</td>
      <td class="num">${months}</td>
      <td class="num">${r.rateInput ? r.rateInput.toFixed(1) + '%' : '—'}</td>
      <td class="num rate-cell">${r.annualRate.toFixed(2)}%</td>
      <td><button class="btn-delete" onclick="deleteRecord(${r.id})">✕</button></td>
    `;
    body.appendChild(tr);
  });

  const avgAnnual = savedRecords.reduce((s, r) => s + r.annualRate, 0) / savedRecords.length;
  foot.innerHTML = `
    <tr class="total-row">
      <td colspan="3">Разом (${savedRecords.length})</td>
      <td class="num">${formatShort(totalInvested)}</td>
      <td class="num">${formatShort(totalReceived)}</td>
      <td class="num profit-cell">${formatShort(totalProfit)}</td>
      <td colspan="4"></td>
      <td></td>
      <td class="num rate-cell">${avgAnnual.toFixed(2)}%</td>
      <td></td>
    </tr>
  `;
}

function loadRecordToForm(r) {
  // Fill form fields from saved record
  document.getElementById('bondName').value = r.name === '—' || r.name === 'Вклад (складний %)' ? '' : r.name || '';
  document.getElementById('bondPrice').value = r.bondPrice ? formatShort(r.bondPrice) : '';
  document.getElementById('bondCount').value = r.bondCount || '';
  document.getElementById('invested').value = formatNum(r.invested);
  document.getElementById('received').value = r.received ? formatNum(r.received) : '';
  document.getElementById('annualRateInput').value = r.rateInput || '';
  document.getElementById('dateStart').value = r.dateStart || '';
  document.getElementById('dateEnd').value = r.dateEnd || '';
  document.getElementById('diffAmount').value = r.profit ? formatNum(r.profit) : '';
  document.getElementById('bonusPercent').value = r.taxPercent || '';

  // Compound fields
  document.getElementById('compoundCheck').checked = !!r.compound;
  document.getElementById('compoundRate').value = r.compoundRate || '';
  document.getElementById('compoundTax').value = r.compoundTax || '';
  document.getElementById('compoundIndex').value = r.compoundIndex || '';
  if (r.compoundYears) document.getElementById('compoundYears').value = r.compoundYears;
  toggleCompoundOptions();

  const ct = document.getElementById('calcType');
  if (ct) {
    ct.value = r.calcType || (r.bondPrice || r.bondCount ? 'ovdp' : (r.compound ? 'deposit' : 'other'));
    toggleCalcTypeFields();
  }

  // Mark manual fields so calculate() doesn't override them
  numFields.forEach(id => document.getElementById(id).classList.remove('auto-filled'));

  // Run calculation to show results + charts
  calculate();

  // Scroll to top of calculator
  document.getElementById('panel-calc').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteRecord(id) {
  savedRecords = savedRecords.filter(r => r.id !== id);
  renderSaved();
}

// ============ EXPORT TO EXCEL (STYLED) ============
function exportToExcel() {
  if (savedRecords.length === 0) return;

  const darkBg = '0F172A';
  const headerBg = '1E293B';
  const borderColor = '334155';
  const textLight = 'E2E8F0';
  const textMuted = '94A3B8';
  const green = '4ADE80';
  const yellow = 'FACC15';
  const blue = '60A5FA';
  const white = 'F1F5F9';

  const border = {
    top: { style: 'thin', color: { rgb: borderColor } },
    bottom: { style: 'thin', color: { rgb: borderColor } },
    left: { style: 'thin', color: { rgb: borderColor } },
    right: { style: 'thin', color: { rgb: borderColor } }
  };

  const headerStyle = {
    font: { name: 'Arial', bold: true, color: { rgb: textMuted }, sz: 11 },
    fill: { fgColor: { rgb: headerBg } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: border
  };

  const cellStyle = {
    font: { name: 'Arial', color: { rgb: textLight }, sz: 11 },
    fill: { fgColor: { rgb: darkBg } },
    alignment: { vertical: 'center' },
    border: border
  };

  const numStyle = {
    ...cellStyle,
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0'
  };

  const profitStyle = {
    ...numStyle,
    font: { name: 'Arial', color: { rgb: green }, sz: 11, bold: true }
  };

  const rateStyle = {
    font: { name: 'Arial', color: { rgb: yellow }, sz: 12, bold: true },
    fill: { fgColor: { rgb: darkBg } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: border,
    numFmt: '0.00"%"'
  };

  const totalStyle = {
    font: { name: 'Arial', color: { rgb: white }, sz: 12, bold: true },
    fill: { fgColor: { rgb: '1E293B' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: {
      top: { style: 'medium', color: { rgb: '475569' } },
      bottom: { style: 'medium', color: { rgb: '475569' } },
      left: { style: 'thin', color: { rgb: borderColor } },
      right: { style: 'thin', color: { rgb: borderColor } }
    },
    numFmt: '#,##0'
  };

  const totalLabelStyle = {
    ...totalStyle,
    font: { name: 'Arial', color: { rgb: white }, sz: 12, bold: true },
    alignment: { horizontal: 'left', vertical: 'center' }
  };

  const titleStyle = {
    font: { name: 'Arial', bold: true, color: { rgb: white }, sz: 16 },
    fill: { fgColor: { rgb: headerBg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border
  };

  const subtitleStyle = {
    font: { name: 'Arial', color: { rgb: textMuted }, sz: 11 },
    fill: { fgColor: { rgb: headerBg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border
  };

  const colCount = 13;
  const headers = [
    'Назва', 'Ціна обл.', 'К-сть', 'Вкладено (грн)',
    'Отримано (грн)', 'Різниця (грн)', 'Дата від', 'Дата до',
    'Днів', 'Місяців', 'Ставка', 'Річна %', 'За період %'
  ];

  const ws = {};

  ws['A1'] = { v: 'Invest UA — Облігації', s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];
  for (let c = 1; c < colCount; c++) {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: '', s: titleStyle };
  }

  const dateGenerated = 'Згенеровано: ' + new Date().toLocaleDateString('uk-UA');
  ws['A2'] = { v: dateGenerated, s: subtitleStyle };
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } });
  for (let c = 1; c < colCount; c++) {
    ws[XLSX.utils.encode_cell({ r: 1, c })] = { v: '', s: subtitleStyle };
  }

  headers.forEach((h, i) => {
    ws[XLSX.utils.encode_cell({ r: 2, c: i })] = { v: h, s: headerStyle };
  });

  savedRecords.forEach((r, ri) => {
    const row = ri + 3;
    const dateStyle = { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } };
    const centerStyle = { ...numStyle, alignment: { horizontal: 'center', vertical: 'center' } };

    let days = 0, months = 0;
    if (r.dateStart && r.dateEnd) {
      const d1 = new Date(r.dateStart), d2 = new Date(r.dateEnd);
      days = Math.round((d2 - d1) / (1000*60*60*24));
      months = +(days / 30.44).toFixed(1);
    }

    ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: r.name, s: { ...cellStyle, font: { name: 'Arial', color: { rgb: blue }, sz: 11 } } };
    ws[XLSX.utils.encode_cell({ r: row, c: 1 })] = { v: r.bondPrice || '', s: r.bondPrice ? numStyle : cellStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 2 })] = { v: r.bondCount || '', s: r.bondCount ? numStyle : cellStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 3 })] = { v: Math.round(r.invested), s: numStyle, t: 'n' };
    ws[XLSX.utils.encode_cell({ r: row, c: 4 })] = { v: Math.round(r.received), s: numStyle, t: 'n' };
    ws[XLSX.utils.encode_cell({ r: row, c: 5 })] = { v: Math.round(r.profit), s: profitStyle, t: 'n' };
    ws[XLSX.utils.encode_cell({ r: row, c: 6 })] = { v: r.dateStart, s: dateStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 7 })] = { v: r.dateEnd, s: dateStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 8 })] = { v: days, s: centerStyle, t: 'n' };
    ws[XLSX.utils.encode_cell({ r: row, c: 9 })] = { v: months, s: centerStyle, t: 'n' };
    ws[XLSX.utils.encode_cell({ r: row, c: 10 })] = { v: r.rateInput ? r.rateInput.toFixed(1) + '%' : '—', s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } };
    ws[XLSX.utils.encode_cell({ r: row, c: 11 })] = { v: Math.round(r.annualRate * 100) / 100, s: rateStyle, t: 'n' };
    ws[XLSX.utils.encode_cell({ r: row, c: 12 })] = { v: Math.round(r.periodRate * 100) / 100, s: { ...profitStyle, numFmt: '0.00"%"' }, t: 'n' };
  });

  const totalRow = savedRecords.length + 3;
  const totalInvested = savedRecords.reduce((s, r) => s + r.invested, 0);
  const totalReceived = savedRecords.reduce((s, r) => s + r.received, 0);
  const totalProfit = savedRecords.reduce((s, r) => s + r.profit, 0);
  const avgAnnual = savedRecords.reduce((s, r) => s + r.annualRate, 0) / savedRecords.length;

  ws[XLSX.utils.encode_cell({ r: totalRow, c: 0 })] = { v: 'РАЗОМ (' + savedRecords.length + ')', s: totalLabelStyle };
  for (let c = 1; c <= 2; c++) ws[XLSX.utils.encode_cell({ r: totalRow, c })] = { v: '', s: totalStyle };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 3 })] = { v: Math.round(totalInvested), s: totalStyle, t: 'n' };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 4 })] = { v: Math.round(totalReceived), s: totalStyle, t: 'n' };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 5 })] = { v: Math.round(totalProfit), s: { ...totalStyle, font: { name: 'Arial', color: { rgb: green }, sz: 12, bold: true } }, t: 'n' };
  for (let c = 6; c <= 10; c++) ws[XLSX.utils.encode_cell({ r: totalRow, c })] = { v: '', s: totalStyle };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 11 })] = { v: Math.round(avgAnnual * 100) / 100, s: { ...totalStyle, font: { name: 'Arial', color: { rgb: yellow }, sz: 13, bold: true }, numFmt: '"⌀ "0.00"%"' }, t: 'n' };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 12 })] = { v: '', s: totalStyle };

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow, c: colCount - 1 } });

  ws['!cols'] = [
    { wch: 32 }, { wch: 12 }, { wch: 8 }, { wch: 16 },
    { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }
  ];

  ws['!rows'] = [{ hpt: 32 }, { hpt: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Облігації');

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `oblihatsii_${dateStr}.xlsx`);
}

// ============ IMPORT FROM EXCEL ============
function importFromExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const row = rows[i];
        if (row && row.some(c => typeof c === 'string' && (c.includes('Назва') || c.includes('Вкладено')))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        toast('✗ Не вдалося знайти заголовки таблиці у файлі. Перевірте формат.', 'err');
        return;
      }

      const dataRows = rows.slice(headerIdx + 1);
      let imported = 0;

      dataRows.forEach(row => {
        if (!row || row.length < 6) return;
        const name = row[0];
        if (!name || name === 'РАЗОМ' || (typeof name === 'string' && name.startsWith('РАЗОМ'))) return;

        const invested = parseFloat(row[3]);
        const received = parseFloat(row[4]);
        if (isNaN(invested) || isNaN(received) || invested <= 0) return;

        const profit = received - invested;
        const bondPrice = row[1] ? parseFloat(row[1]) : null;
        const bondCount = row[2] ? parseInt(row[2]) : null;
        const dateStart = row[6] || '';
        const dateEnd = row[7] || '';
        const rateInputRaw = row[8];
        let rateInput = null;
        if (rateInputRaw) {
          const parsed = parseFloat(String(rateInputRaw).replace('%', ''));
          if (!isNaN(parsed) && parsed > 0) rateInput = parsed;
        }
        const annualRate = row[9] ? parseFloat(String(row[9]).replace('%', '')) : 0;
        const periodRate = row[10] ? parseFloat(String(row[10]).replace('%', '')) : (invested > 0 ? (profit / invested) * 100 : 0);

        savedRecords.push({
          id: Date.now() + Math.random(),
          name: String(name),
          bondPrice: bondPrice && bondPrice > 0 ? bondPrice : null,
          bondCount: bondCount && bondCount > 0 ? bondCount : null,
          invested, received, profit,
          dateStart: String(dateStart),
          dateEnd: String(dateEnd),
          rateInput,
          annualRate: annualRate || 0,
          periodRate
        });
        imported++;
      });

      renderSaved();

      if (imported === 0) {
        toast('✗ Жодного запису не імпортовано. Переконайтесь, що файл має правильний формат і містить дані.', 'err');
      } else {
        toast('✓ Імпортовано ' + imported + ' запис' + (imported === 1 ? '' : imported < 5 ? 'и' : 'ів') + ' з файлу', 'ok');
      }

    } catch (err) {
      toast('✗ Помилка при читанні файлу: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

// ============ ОВДП SELECT (bonds from Firestore, managed in admin) ============
let ovdpBonds = [];

// Load ОВДП bonds from Firestore and populate select
async function loadOvdpBonds() {
  try {
    if (typeof firebase === 'undefined' || !firebase.firestore) return;
    const doc = await firebase.firestore().collection('settings').doc('ovdp').get();
    if (!doc.exists) return;
    const data = doc.data();
    ovdpBonds = data.bonds || [];
    if (ovdpBonds.length === 0) return;

    // Sort by maturity date
    ovdpBonds.sort((a, b) => (a.maturityDate || '').localeCompare(b.maturityDate || ''));

    const select = document.getElementById('ovdpBondSelect');
    const pSelect = document.getElementById('pOvdpBondSelect');

    const placeholder = '<option value="">— Оберіть облігацію ОВДП (' + ovdpBonds.length + ') —</option>';
    [select, pSelect].forEach(sel => { if (sel) sel.innerHTML = placeholder; });

    ovdpBonds.forEach((b, i) => {
      const daysLeft = b.maturityDate ? Math.max(0, Math.round((new Date(b.maturityDate) - new Date()) / 86400000)) : 0;
      const label = b.name + ' — до ' + b.maturityDate + ' (' + daysLeft + ' дн.)';
      [select, pSelect].forEach(sel => {
        if (!sel) return;
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = label;
        sel.appendChild(opt);
      });
    });

    if (typeof toggleCalcTypeFields === 'function' && document.getElementById('calcType')) toggleCalcTypeFields();
    if (typeof togglePortfolioTypeFields === 'function' && document.getElementById('pType')) togglePortfolioTypeFields();
  } catch(e) {
    console.log('ОВДП load:', e.message);
  }
}

function onOvdpSelect() {
  const select = document.getElementById('ovdpBondSelect');
  const infoEl = document.getElementById('ovdpBondInfo');
  const idx = select.value;

  if (idx === '' || idx === null) {
    infoEl.style.display = 'none';
    return;
  }

  const bond = ovdpBonds[parseInt(idx)];
  if (!bond) return;

  const today = new Date();
  const daysLeft = bond.maturityDate ? Math.max(0, Math.round((new Date(bond.maturityDate) - today) / 86400000)) : 0;
  const todayStr = today.toISOString().split('T')[0];
  const hasCommission = applyDiiaCommission(todayStr);

  // Info card
  infoEl.innerHTML =
    '<strong>' + bond.name + '</strong><br>' +
    '<strong>ISIN:</strong> ' + bond.isin + '<br>' +
    '<strong>Погашення:</strong> ' + bond.maturityDate + ' (~' + daysLeft + ' дн.)<br>' +
    '<strong>Купон:</strong> ' + (bond.couponAmount > 0 ? bond.couponAmount.toFixed(2) + ' грн' : '—') + '<br>' +
    (hasCommission
      ? '<span style="color:#f59e0b;font-size:12px;display:block;margin-top:4px">💳 Комісія Дії: 0.20% від суми (з 15.04.2026), списується разом з вартістю облігацій</span>'
      : '') +
    '<span style="color:#f59e0b;font-size:12px">⚠ Введіть ціну з Дії — ставка розрахується автоматично</span>';
  infoEl.style.display = 'block';

  // Auto-fill
  document.getElementById('bondName').value = bond.name + ' ' + bond.isin;
  document.getElementById('bondPrice').value = '';
  document.getElementById('annualRateInput').value = '';
  document.getElementById('dateStart').value = today.toISOString().split('T')[0];
  if (bond.maturityDate) {
    document.getElementById('dateEnd').value = bond.maturityDate;
  }

  ['dateStart', 'dateEnd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('auto-filled');
  });

  // Auto-calc yield when user enters price
  const priceEl = document.getElementById('bondPrice');
  priceEl._ovdpBond = bond;
  priceEl.removeEventListener('input', onBondPriceInputOvdp);
  priceEl.addEventListener('input', onBondPriceInputOvdp);

  setTimeout(() => priceEl.focus(), 100);
}

// Комісія Дії 0.20% від суми операції — з 15.04.2026
const DIIA_COMMISSION_RATE = 0.002;
const DIIA_COMMISSION_START = '2026-04-15';

function applyDiiaCommission(dateStart) {
  const d = dateStart || new Date().toISOString().split('T')[0];
  return d >= DIIA_COMMISSION_START;
}

function onBondPriceInputOvdp() {
  const priceEl = document.getElementById('bondPrice');
  const bond = priceEl._ovdpBond;
  if (!bond) return;

  const price = parseFloat(priceEl.value.replace(/\s/g, '').replace(',', '.'));
  if (!price || price <= 0 || !bond.maturityDate) return;

  const today = new Date();
  const maturity = new Date(bond.maturityDate);
  const daysLeft = Math.max(1, Math.round((maturity - today) / 86400000));

  // Count remaining coupon payments after today
  let remainingCoupons = 0;
  if (bond.couponDates && bond.couponDates.length > 0) {
    const todayStr = today.toISOString().split('T')[0];
    remainingCoupons = bond.couponDates.filter(d => d > todayStr).length;
  }

  // Комісія Дії 0.20% — додається до ціни купівлі
  const dateStartVal = document.getElementById('dateStart').value;
  const hasCommission = applyDiiaCommission(dateStartVal);
  const commissionPerBond = hasCommission ? price * DIIA_COMMISSION_RATE : 0;
  const effectivePrice = price + commissionPerBond;

  const totalCoupons = remainingCoupons * (bond.couponAmount || 0);
  const receivedAtMaturity = 1000 + totalCoupons;
  const profit = receivedAtMaturity - effectivePrice;
  const effectiveYield = (profit / effectivePrice) * (365 / daysLeft) * 100;

  if (effectiveYield > -50 && effectiveYield < 200) {
    document.getElementById('annualRateInput').value = effectiveYield.toFixed(2);
    document.getElementById('annualRateInput').classList.add('auto-filled');

    const infoEl = document.getElementById('ovdpBondInfo');
    const existingCalc = infoEl.querySelector('.minfin-calc-yield');
    const commissionHtml = hasCommission
      ? ' <span style="font-weight:400;color:#f59e0b;font-size:11px;display:block;margin-top:2px">💳 Комісія Дії (0.20%): +' + commissionPerBond.toFixed(2) + ' грн/облігацію, фактична ціна ' + effectivePrice.toFixed(2) + ' грн</span>'
      : '';
    const calcHtml = '<span class="minfin-calc-yield" style="display:block;margin-top:6px;padding:6px 10px;background:rgba(34,197,94,0.1);border-radius:8px;color:#22c55e;font-weight:600">' +
      '📈 Дохідність: ' + effectiveYield.toFixed(2) + '% річних' +
      ' <span style="font-weight:400;color:#94a3b8;font-size:12px">(отримаєте ' + receivedAtMaturity.toFixed(2) + ' грн через ' + daysLeft + ' дн.)</span>' +
      commissionHtml + '</span>';
    if (existingCalc) {
      existingCalc.outerHTML = calcHtml;
    } else {
      infoEl.insertAdjacentHTML('beforeend', calcHtml);
    }
  }
}

// ============ PORTFOLIO ОВДП SELECT ============
function onPortfolioOvdpSelect() {
  const select = document.getElementById('pOvdpBondSelect');
  const infoEl = document.getElementById('pOvdpBondInfo');
  const idx = select.value;

  if (idx === '' || idx === null) {
    infoEl.style.display = 'none';
    return;
  }

  const bond = ovdpBonds[parseInt(idx)];
  if (!bond) return;

  const today = new Date();
  const daysLeft = bond.maturityDate ? Math.max(0, Math.round((new Date(bond.maturityDate) - today) / 86400000)) : 0;
  const todayStr = today.toISOString().split('T')[0];
  const hasCommission = applyDiiaCommission(todayStr);

  infoEl.innerHTML =
    '<strong>' + bond.name + '</strong><br>' +
    '<strong>ISIN:</strong> ' + bond.isin + '<br>' +
    '<strong>Погашення:</strong> ' + bond.maturityDate + ' (~' + daysLeft + ' дн.)<br>' +
    '<strong>Купон:</strong> ' + (bond.couponAmount > 0 ? bond.couponAmount.toFixed(2) + ' грн' : '—') + '<br>' +
    (hasCommission
      ? '<span style="color:#f59e0b;font-size:12px;display:block;margin-top:4px">💳 Комісія Дії: 0.20% від суми (з 15.04.2026), списується разом з вартістю облігацій</span>'
      : '') +
    '<span style="color:#f59e0b;font-size:12px">⚠ Введіть ціну з Дії — ставка розрахується автоматично</span>';
  infoEl.style.display = 'block';

  document.getElementById('pName').value = bond.name + ' ' + bond.isin;
  document.getElementById('pBondPrice').value = '';
  document.getElementById('pBondCount').value = '';
  document.getElementById('pRate').value = '';
  document.getElementById('pDateStart').value = today.toISOString().split('T')[0];
  if (bond.maturityDate) document.getElementById('pDateEnd').value = bond.maturityDate;

  const priceEl = document.getElementById('pBondPrice');
  priceEl._ovdpBond = bond;
  priceEl.removeEventListener('input', onPortfolioBondPriceInputOvdp);
  priceEl.addEventListener('input', onPortfolioBondPriceInputOvdp);

  setTimeout(() => priceEl.focus(), 100);
}

function onPortfolioBondPriceInputOvdp() {
  const priceEl = document.getElementById('pBondPrice');
  const bond = priceEl._ovdpBond;
  if (!bond) return;

  const price = parseFloat(priceEl.value.replace(/\s/g, '').replace(',', '.'));
  if (!price || price <= 0 || !bond.maturityDate) return;

  const today = new Date();
  const maturity = new Date(bond.maturityDate);
  const daysLeft = Math.max(1, Math.round((maturity - today) / 86400000));

  let remainingCoupons = 0;
  if (bond.couponDates && bond.couponDates.length > 0) {
    const todayStr = today.toISOString().split('T')[0];
    remainingCoupons = bond.couponDates.filter(d => d > todayStr).length;
  }

  // Комісія Дії 0.20% — додається до ціни купівлі
  const dateStartVal = document.getElementById('pDateStart').value;
  const hasCommission = applyDiiaCommission(dateStartVal);
  const commissionPerBond = hasCommission ? price * DIIA_COMMISSION_RATE : 0;
  const effectivePrice = price + commissionPerBond;

  const totalCoupons = remainingCoupons * (bond.couponAmount || 0);
  const receivedAtMaturity = 1000 + totalCoupons;
  const profit = receivedAtMaturity - effectivePrice;
  const effectiveYield = (profit / effectivePrice) * (365 / daysLeft) * 100;

  if (effectiveYield > -50 && effectiveYield < 200) {
    document.getElementById('pRate').value = effectiveYield.toFixed(2);
    // Prefill "receive at maturity" (total across all bonds) — user can override.
    const countRaw = document.getElementById('pBondCount').value;
    const count = parseNum(countRaw);
    if (!isNaN(count) && count > 0) {
      document.getElementById('pReceivedAtMaturity').value = formatNum(receivedAtMaturity * count);
    }

    const infoEl = document.getElementById('pOvdpBondInfo');
    const existingCalc = infoEl.querySelector('.minfin-calc-yield');
    const commissionHtml = hasCommission
      ? ' <span style="font-weight:400;color:#f59e0b;font-size:11px;display:block;margin-top:2px">💳 Комісія Дії (0.20%): +' + commissionPerBond.toFixed(2) + ' грн/облігацію, фактична ціна ' + effectivePrice.toFixed(2) + ' грн</span>'
      : '';
    const calcHtml = '<span class="minfin-calc-yield" style="display:block;margin-top:6px;padding:6px 10px;background:rgba(34,197,94,0.1);border-radius:8px;color:#22c55e;font-weight:600">' +
      '📈 Дохідність: ' + effectiveYield.toFixed(2) + '% річних' +
      ' <span style="font-weight:400;color:#94a3b8;font-size:12px">(отримаєте ' + receivedAtMaturity.toFixed(2) + ' грн через ' + daysLeft + ' дн.)</span>' +
      commissionHtml + '</span>';
    if (existingCalc) existingCalc.outerHTML = calcHtml;
    else infoEl.insertAdjacentHTML('beforeend', calcHtml);
  }
}

// ============ CLEAR ============
// Wipes all inputs, results, and ОВДП bond selection. Does NOT touch the type
// dropdown — callers decide whether to keep the current type or reset it.
function _resetCalcForm() {
  numFields.forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.classList.remove('auto-filled');
  });
  document.getElementById('bondName').value = '';
  activeField = null;
  document.getElementById('results').classList.remove('show');
  var ph = document.getElementById('resultsPlaceholder');
  if (ph) ph.style.display = '';
  document.getElementById('error').style.display = 'none';

  // Clear all result values
  ['resProfit','resTerm','resPeriodRate','resAnnualRate','resNetProfit',
   'resBondName','resBondsCount','resInvestedCalc','resReceivedCalc',
   'resProfitPerBond','resNetPerBond','resBonusAmount','resTotalWithBonus'
  ].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
  ['bondsSectionLabel','bondNameRow','bondsCountRow','investedCalcRow',
   'receivedCalcRow','profitPerBondRow','netPerBondRow','bonusSectionLabel',
   'bonusAmountRow','totalWithBonusRow'
  ].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  // Reset ОВДП select
  const ovdpSel = document.getElementById('ovdpBondSelect');
  if (ovdpSel) ovdpSel.selectedIndex = 0;
  const ovdpInfo = document.getElementById('ovdpBondInfo');
  if (ovdpInfo) ovdpInfo.style.display = 'none';

  document.getElementById('compoundCheck').checked = false;
  document.getElementById('compoundRate').value = '';
  document.getElementById('compoundTax').value = '';
  document.getElementById('compoundIndex').value = '';
  toggleCompoundOptions();
  document.getElementById('compoundSection').style.display = 'none';
  const cfw = document.getElementById('compoundFullWidth');
  if (cfw) cfw.style.display = 'none';
  if (typeof compoundChartInstance !== 'undefined' && compoundChartInstance) {
    compoundChartInstance.destroy();
    compoundChartInstance = null;
  }
  const t = new Date();
  document.getElementById('dateStart').value = t.toISOString().split('T')[0];
  const f = new Date(t);
  f.setMonth(f.getMonth() + 3);
  document.getElementById('dateEnd').value = f.toISOString().split('T')[0];
}

function clearAll() {
  _resetCalcForm();
  const ct = document.getElementById('calcType');
  if (ct && ct.value !== 'ovdp') {
    ct.value = 'ovdp';
    _calcPrevType = 'ovdp';
    toggleCalcTypeFields();
  }
}

document.addEventListener('keydown', e => { if (e.key === 'Enter') calculate(); });

// ============ PERSISTENT STORAGE (IndexedDB) ============
const DB_NAME = 'InvestCalcDB';
const DB_STORE = 'records';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToStorage() {
  try {
    const idb = await openDB();
    const tx = idb.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.clear();
    savedRecords.forEach(r => store.put(r));
  } catch(e) { console.warn('Storage save failed:', e); }
}

async function loadFromStorage() {
  try {
    const idb = await openDB();
    const tx = idb.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      if (req.result && req.result.length > 0) {
        savedRecords = req.result;
        renderSaved();
      }
    };
  } catch(e) { console.warn('Storage load failed:', e); }
}

const origRenderSaved = renderSaved;
renderSaved = function() {
  origRenderSaved();
  saveToStorage();
  if (!_skipFirestoreSync && typeof saveToFirestore === 'function') saveToFirestore();
};

// ============ PWA INSTALL ============
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBanner').classList.add('show');
});

function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      document.getElementById('installBanner').classList.remove('show');
    });
  }
}

if ('serviceWorker' in navigator) {
  // updateViaCache:'none' — never use the browser HTTP cache for sw.js itself.
  // GitHub Pages and CDNs aggressively cache static files; without this flag a
  // freshly-deployed sw.js can be served from cache for hours, so users would
  // never see the new CACHE_NAME and would stay on the old build.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    // Probe for new SW versions when the tab regains focus and once an hour
    // while it stays open — covers the "PWA left running for days" case.
    const checkForUpdate = () => { reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
    setInterval(checkForUpdate, 60 * 60 * 1000);
  }).catch(err => console.warn('SW:', err));

  // sw.js calls skipWaiting() + clients.claim(), so the new worker takes
  // control as soon as it's installed. controllerchange fires once at that
  // moment — reload the page to pick up the freshly cached HTML/JS.
  let _swReloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_swReloading) return;
    _swReloading = true;
    window.location.reload();
  });
}

// ================================================================
// =============== UNSUBSCRIBE FROM EMAIL NEWSLETTER ==============
// Triggered when a user clicks the "Відписатися" link in a marketing
// email — that link points to https://investua.app/?unsubscribe=<token>.
// The token is a stateless HMAC over the user's UID, verified server-side.
// We don't need Firebase auth for this — the token IS the auth.
async function processUnsubscribeOnBoot() {
  let token;
  try {
    const url = new URL(window.location.href);
    token = url.searchParams.get('unsubscribe');
    if (!token) return;
    // Strip from URL so a reload doesn't retrigger the confirm dialog.
    url.searchParams.delete('unsubscribe');
    history.replaceState(null, '', url.toString());
  } catch(_) { return; }

  const apiBase = typeof NOTIFY_API_BASE !== 'undefined' ? NOTIFY_API_BASE : '';
  if (!apiBase) return;

  const proceed = await uiConfirm(
    'Відписатись від email-розсилки Invest UA?\n\nВи більше не отримуватимете листи з оновленнями. Сповіщення про завершення вкладень не зачіпаються.',
    { okText: 'Відписатись', cancelText: 'Скасувати', danger: true }
  );
  if (!proceed) return;

  try {
    const res = await fetch(apiBase + '/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      await uiConfirm('Не вдалося відписатись: ' + (json.description || 'посилання недійсне'), { okText: 'OK', cancelText: '' });
      return;
    }
    const undo = await uiConfirm(
      '✓ Вас відписано від розсилки.\n\nЯкщо це сталось випадково — можна підписатись назад.',
      { okText: 'Підписатись назад', cancelText: 'Закрити' }
    );
    if (!undo) return;
    const r = await fetch(apiBase + '/resubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      await uiConfirm('✓ Підписку відновлено.', { okText: 'OK', cancelText: '' });
    } else {
      await uiConfirm('Не вдалося відновити: ' + (j.description || 'помилка сервера'), { okText: 'OK', cancelText: '' });
    }
  } catch(_) {
    await uiConfirm('Помилка мережі. Спробуйте пізніше.', { okText: 'OK', cancelText: '' });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processUnsubscribeOnBoot);
} else {
  processUnsubscribeOnBoot();
}

// Firebase and Telegram logic moved to firebase.js and telegram.js

// ================================================================
// ==================== ANALYTICS ENGINE ==========================
// ================================================================

let aComboTab = 'efficiency';

function checkAnalyticsReady() {
  const authGate = document.getElementById('analyticsAuth');
  const empty = document.getElementById('analyticsEmpty');
  const content = document.getElementById('analyticsContent');

  if (typeof currentUser === 'undefined') return;
  if (!currentUser) {
    authGate.style.display = 'block';
    empty.style.display = 'none';
    content.style.display = 'none';
    return;
  }

  authGate.style.display = 'none';
  const hasData = savedRecords.length >= 2;
  empty.style.display = hasData ? 'none' : 'block';
  content.style.display = hasData ? 'block' : 'none';
  if (hasData) runAnalytics();
}

function getAnalyzedBonds(horizonMonths) {
  return savedRecords.map(r => {
    let days = 0;
    if (r.dateStart && r.dateEnd) {
      days = Math.round((new Date(r.dateEnd) - new Date(r.dateStart)) / 86400000);
    }
    if (days <= 0) return null;
    const months = +(days / 30.44).toFixed(1);
    const profitPerUnit = r.bondCount && r.bondCount > 0 ? r.profit / r.bondCount : r.profit;
    const pricePerUnit = r.bondPrice || (r.bondCount > 0 ? r.invested / r.bondCount : r.invested);
    const periodReturn = r.profit / r.invested * 100;
    const effAnnual = (Math.pow(1 + r.profit / r.invested, 365 / days) - 1) * 100;
    // Прибуток/день на 1 облігацію — щоб колонка узгоджувалась з ціною per-unit
    // та ефективною річною (інакше позиції з більшою кількістю облігацій
    // механічно виглядали б прибутковішими).
    const dailyProfit = profitPerUnit / days;

    return {
      ...r,
      days, months,
      profitPerUnit, pricePerUnit,
      periodReturn, effAnnual, dailyProfit,
      receivedPerUnit: r.bondCount > 0 ? r.received / r.bondCount : r.received
    };
  }).filter(b => {
    if (!b) return false;
    if (horizonMonths === 0) return true;
    const minDays = (horizonMonths - 2) * 30.44;
    const maxDays = (horizonMonths + 2) * 30.44;
    return b.days >= minDays && b.days <= maxDays;
  });
}

function runAnalytics() {
  const horizonMonths = +document.getElementById('aHorizon').value;
  const bonds = getAnalyzedBonds(horizonMonths);

  renderRankingTable(bonds);
  findAndRenderCombos(bonds);
  findAndRenderReinvest();
}

// ---- Ranking Table ----
let aSortCol = 'effAnnual';
let aSortAsc = false;

function renderRankingTable(bonds) {
  if (bonds.length === 0) {
    document.getElementById('aRankTable').innerHTML = '<tr><td style="color:#475569;padding:20px;text-align:center">Немає облігацій для обраного горизонту</td></tr>';
    return;
  }

  const sorted = [...bonds].sort((a, b) => aSortAsc ? a[aSortCol] - b[aSortCol] : b[aSortCol] - a[aSortCol]);
  const bestName = sorted[0]?.name;

  const cols = [
    { key: 'name', label: 'Назва', fmt: v => v },
    { key: 'pricePerUnit', label: 'Ціна', fmt: v => formatShort(v) },
    { key: 'days', label: 'Днів', fmt: v => v },
    { key: 'months', label: 'Міс.', fmt: v => v },
    { key: 'rateInput', label: 'Ставка', fmt: v => v ? v.toFixed(1) + '%' : '—' },
    { key: 'periodReturn', label: 'За період', fmt: v => v.toFixed(2) + '%' },
    { key: 'effAnnual', label: 'Ефект. річна', fmt: v => v.toFixed(2) + '%' },
    { key: 'dailyProfit', label: 'Прибуток/день', fmt: v => formatShort(v) + ' грн' },
  ];

  const arrow = k => aSortCol === k ? (aSortAsc ? ' ▲' : ' ▼') : '';

  let html = '<thead><tr>';
  cols.forEach(c => {
    html += `<th onclick="aChangeSort('${c.key}')">${c.label}${arrow(c.key)}</th>`;
  });
  html += '<th></th></tr></thead><tbody>';

  sorted.forEach(b => {
    const best = b.name === bestName;
    html += `<tr class="${best ? 'a-best' : ''}">`;
    cols.forEach(c => {
      let val = c.fmt(b[c.key]);
      if (c.key === 'effAnnual' && best) val += ' <span class="a-badge a-badge-green">ТОП</span>';
      html += `<td>${val}</td>`;
    });
    html += `<td class="a-rank-actions"><button class="btn-delete" title="Видалити з рейтингу" onclick="deleteAnalyticsBond(${b.id})">✕</button></td>`;
    html += '</tr>';
  });
  html += '</tbody>';

  document.getElementById('aRankTable').innerHTML = html;
  window._aBonds = bonds;
}

async function deleteAnalyticsBond(id) {
  const rec = savedRecords.find(r => r.id === id);
  const name = rec && rec.name ? rec.name : 'облігацію';
  if (!await uiConfirm('Видалити «' + name + '» з рейтингу?', { danger: true, okText: 'Видалити' })) return;
  deleteRecord(id);
  checkAnalyticsReady();
}

function aChangeSort(col) {
  if (aSortCol === col) aSortAsc = !aSortAsc;
  else { aSortCol = col; aSortAsc = false; }
  if (window._aBonds) renderRankingTable(window._aBonds);
}

// ---- Combinations ----
function getCombos(arr, k) {
  if (k === 1) return arr.map(x => [x]);
  const res = [];
  for (let i = 0; i <= arr.length - k; i++) {
    getCombos(arr.slice(i + 1), k - 1).forEach(c => res.push([arr[i], ...c]));
  }
  return res;
}

function findAndRenderCombos(bonds) {
  const budget = +document.getElementById('aBudget').value || 600000;
  let count = +document.getElementById('aComboCount').value || 2;
  if (count > bonds.length) count = bonds.length;

  document.getElementById('aComboTitle').textContent =
    `Найкращі комбінації (${count} облігаці${count === 1 ? 'я' : count < 5 ? 'ї' : 'й'})`;

  if (bonds.length < count || count === 0) {
    document.getElementById('aCombosContainer').innerHTML =
      '<p style="color:#475569;text-align:center;padding:16px">Недостатньо облігацій для комбінації</p>';
    return;
  }

  const combos = getCombos(bonds, count);
  const results = [];

  const splits = count === 1 ? [[1.0]] :
    count === 2 ? [[0.3,0.7],[0.4,0.6],[0.5,0.5],[0.6,0.4],[0.7,0.3]] :
    [[0.2,0.4,0.4],[0.33,0.33,0.34],[0.4,0.3,0.3],[0.5,0.25,0.25],[0.25,0.5,0.25],[0.25,0.25,0.5]];

  combos.forEach(combo => {
    splits.forEach(split => {
      const alloc = combo.map((b, i) => {
        const qty = Math.floor((budget * split[i]) / b.pricePerUnit);
        return { ...b, qty, allocInvested: qty * b.pricePerUnit, allocProfit: qty * b.profitPerUnit };
      });
      if (alloc.some(a => a.qty === 0)) return;
      const totalInv = alloc.reduce((s, a) => s + a.allocInvested, 0);
      if (totalInv > budget) return;
      const totalProf = alloc.reduce((s, a) => s + a.allocProfit, 0);
      const wAnnual = alloc.reduce((s, a) => s + a.effAnnual * a.allocInvested, 0) / totalInv;

      results.push({ alloc, totalInv, totalProf, wAnnual, leftover: budget - totalInv, label: alloc.map(a => a.name).join(' + ') });
    });
  });

  window._aComboResults = results;
  renderCombos(aComboTab);
}

function renderCombos(tab) {
  const results = window._aComboResults || [];
  if (results.length === 0) {
    document.getElementById('aCombosContainer').innerHTML = '<p style="color:#475569;text-align:center;padding:16px">Немає підходящих комбінацій</p>';
    return;
  }

  const sorted = tab === 'efficiency'
    ? [...results].sort((a, b) => b.wAnnual - a.wAnnual)
    : [...results].sort((a, b) => b.totalProf - a.totalProf);

  const seen = new Set();
  const top = [];
  for (const r of sorted) {
    if (!seen.has(r.label)) { seen.add(r.label); top.push(r); }
    if (top.length >= 5) break;
  }

  document.getElementById('aCombosContainer').innerHTML = top.map((r, i) => `
    <div class="a-combo">
      <h4><span class="a-combo-rank">#${i + 1}</span> ${r.label} ${i === 0 ? '<span class="a-badge a-badge-green">НАЙКРАЩИЙ</span>' : ''}</h4>
      <div class="a-combo-items">
        ${r.alloc.map(a => `
          <div class="a-combo-item">
            <div class="name">${a.name}</div>
            <div>${a.qty} шт × ${formatShort(a.pricePerUnit)} = <b>${formatShort(a.allocInvested)} грн</b></div>
            <div style="color:#4ade80">+${formatShort(a.allocProfit)} грн за ${a.days} дн. (${a.months} міс.)</div>
          </div>
        `).join('')}
      </div>
      <div class="a-combo-summary">
        <div class="a-stat"><div class="a-stat-label">Вкладено</div><div class="a-stat-value">${formatShort(r.totalInv)} грн</div></div>
        <div class="a-stat"><div class="a-stat-label">Прибуток</div><div class="a-stat-value green">+${formatShort(r.totalProf)} грн</div></div>
        <div class="a-stat"><div class="a-stat-label">Ефект. річна</div><div class="a-stat-value yellow">${r.wAnnual.toFixed(2)}%</div></div>
        <div class="a-stat"><div class="a-stat-label">Залишок</div><div class="a-stat-value">${formatShort(r.leftover)} грн</div></div>
      </div>
    </div>
  `).join('');
}

function switchComboTab(tab, btn) {
  aComboTab = tab;
  document.querySelectorAll('.a-sub-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderCombos(tab);
}

// ---- Reinvestment Strategy ----
function findAndRenderReinvest() {
  const budget = +document.getElementById('aBudget').value || 600000;
  const allBonds = getAnalyzedBonds(0);
  if (allBonds.length < 2) {
    document.getElementById('aReinvestContainer').innerHTML = '<p style="color:#475569;text-align:center">Потрібно мінімум 2 облігації</p>';
    return;
  }

  const sorted = [...allBonds].sort((a, b) => a.days - b.days);
  const results = [];

  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i];
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      const second = sorted[j];
      if (!first.dateEnd || !second.dateEnd) continue;
      const firstEnd = new Date(first.dateEnd);
      const secondEnd = new Date(second.dateEnd);
      if (secondEnd <= firstEnd) continue;

      const qty1 = Math.floor(budget / first.pricePerUnit);
      if (qty1 === 0) continue;
      const inv1 = qty1 * first.pricePerUnit;
      const prof1 = qty1 * first.profitPerUnit;
      const afterFirst = inv1 + prof1 + (budget - inv1);

      const qty2 = Math.floor(afterFirst / second.pricePerUnit);
      if (qty2 === 0) continue;
      const inv2 = qty2 * second.pricePerUnit;
      const prof2 = qty2 * second.profitPerUnit;

      const totalProfit = prof1 + prof2;
      const totalDays = Math.round((secondEnd - new Date(first.dateStart)) / 86400000);
      const effAnnual = totalDays > 0 ? (Math.pow(1 + totalProfit / budget, 365 / totalDays) - 1) * 100 : 0;

      results.push({ first, second, qty1, inv1, prof1, qty2, inv2, prof2, afterFirst, totalProfit, totalDays, effAnnual });
    }
  }

  results.sort((a, b) => b.effAnnual - a.effAnnual);
  const top = results.slice(0, 3);

  if (top.length === 0) {
    document.getElementById('aReinvestContainer').innerHTML = '<p style="color:#475569;text-align:center">Немає варіантів для реінвестування</p>';
    return;
  }

  document.getElementById('aReinvestContainer').innerHTML = top.map((r, i) => `
    <div class="a-combo" style="margin-bottom:12px">
      <h4>
        <span class="a-combo-rank">#${i + 1}</span>
        ${r.first.name} → ${r.second.name}
        ${i === 0 ? '<span class="a-badge a-badge-yellow">НАЙВИГІДНІШЕ</span>' : ''}
      </h4>
      <div class="a-reinvest-chain">
        <div class="a-reinvest-step">
          <div style="font-weight:600;margin-bottom:4px">${r.first.name}</div>
          <div>${r.qty1} шт × ${formatShort(r.first.pricePerUnit)} грн</div>
          <div style="color:#4ade80">+${formatShort(r.prof1)} грн за ${r.first.days} дн.</div>
          <div style="color:#64748b;font-size:12px">до ${formatDate(r.first.dateEnd)}</div>
        </div>
        <div class="a-reinvest-arrow">→</div>
        <div class="a-reinvest-step">
          <div style="font-weight:600;margin-bottom:4px">${r.second.name}</div>
          <div>${r.qty2} шт × ${formatShort(r.second.pricePerUnit)} грн</div>
          <div style="color:#4ade80">+${formatShort(r.prof2)} грн</div>
          <div style="color:#64748b;font-size:12px">до ${formatDate(r.second.dateEnd)}</div>
        </div>
      </div>
      <div class="a-combo-summary">
        <div class="a-stat"><div class="a-stat-label">Загальний прибуток</div><div class="a-stat-value green">+${formatShort(r.totalProfit)} грн</div></div>
        <div class="a-stat"><div class="a-stat-label">Загальний строк</div><div class="a-stat-value">${r.totalDays} дн. (${(r.totalDays / 30.44).toFixed(1)} міс.)</div></div>
        <div class="a-stat"><div class="a-stat-label">Ефект. річна</div><div class="a-stat-value yellow">${r.effAnnual.toFixed(2)}%</div></div>
      </div>
    </div>
  `).join('');
}

// ================================================================
// ==================== PORTFOLIO ================================
// ================================================================

let portfolioItems = [];
let _editingPortfolioId = null;

// ── Tester role: exclusion flag on records ──
// `excluded: true` means the item is hidden from totals/charts/dashboards but
// visible in lists (greyed out). Checkbox shown only to users with meta.isTester.
function isTester() { return !!window._isTester; }
function isExcluded(item) { return !!(item && item.excluded); }
function activeOnly(list) { return (list || []).filter(p => !isExcluded(p)); }

function _exclusionCheckboxHtml(scope, id, checked) {
  if (!isTester()) return '';
  const title = checked ? 'Не враховується в сумах (клік щоб повернути)' : 'Виключити з сум (тест)';
  return '<label class="exclude-toggle" title="' + esc(title) + '" onclick="event.stopPropagation()">' +
    '<input type="checkbox" ' + (checked ? '' : 'checked') + ' onclick="toggleExcluded(\'' + scope + '\',\'' + id + '\',!this.checked)"> <span>враховувати</span></label>';
}

async function toggleExcluded(scope, id, excluded) {
  try {
    if (scope === 'portfolio') {
      const it = portfolioItems.find(p => String(p.id) === String(id));
      if (it) { it.excluded = !!excluded; await savePortfolioToFirestore(); renderPortfolio(); }
    } else if (scope === 'dream') {
      const it = dreamItems.find(p => String(p.id) === String(id));
      if (it) { it.excluded = !!excluded; await saveDreamsToFirestore(); renderDreams(); }
    } else if (scope === 'saving') {
      const it = savingItems.find(p => String(p.id) === String(id));
      if (it) { it.excluded = !!excluded; await saveSavingsToFirestore(); renderSavings(); }
    } else if (scope === 'purchase') {
      const found = typeof _findPurchase === 'function' ? _findPurchase(id) : null;
      if (found && found.source === 'private') {
        found.item.excluded = !!excluded;
        await savePurchasesToFirestore();
        renderPurchases();
      } else if (found && found.source === 'shared') {
        await db.collection('sharedPurchases').doc(String(id)).update({ excluded: !!excluded });
      }
    }
  } catch(e) { console.warn('Toggle excluded failed:', e); }
}

async function togglePortfolioForm(forceOpen) {
  const card = document.getElementById('portfolioFormCard');
  const toggleBtn = document.getElementById('btnTogglePortfolioForm');
  const isHidden = card.style.display === 'none';
  const shouldOpen = forceOpen !== undefined ? forceOpen : isHidden;

  // Closing — guard unsaved edits
  if (!shouldOpen && typeof FormDrafts !== 'undefined' && FormDrafts.isDirty('portfolio.form')) {
    if (!await FormDrafts.confirmDiscard('portfolio.form', 'У формі вкладення є незбережені зміни. Закрити без збереження?', { okText: 'Закрити', cancelText: 'Залишитись' })) {
      return;
    }
  }

  if (shouldOpen) {
    card.style.display = 'block';
    toggleBtn.textContent = '− ' + (t('portfolio.cancel') || 'Скасувати');
    toggleBtn.classList.remove('btn-save');
    toggleBtn.classList.add('btn-export');
    togglePortfolioTypeFields();
    // Offer to restore an earlier unsaved draft (but only when opening a fresh "new" form).
    if (typeof FormDrafts !== 'undefined' && FormDrafts.hasDraft('portfolio.form') && !FormDrafts.isDirty('portfolio.form')) {
      if (await uiConfirm('Знайдено незбережену чернетку. Відновити?', { okText: 'Відновити' })) {
        FormDrafts.restore('portfolio.form');
        togglePortfolioTypeFields();
      } else {
        FormDrafts.clear('portfolio.form');
      }
    }
  } else {
    card.style.display = 'none';
    toggleBtn.textContent = '+ ' + (t('portfolio.addNew') || 'Новий запис');
    toggleBtn.classList.remove('btn-export');
    toggleBtn.classList.add('btn-save');
    // Reset form state when closing
    const addBtn = document.getElementById('btnAddPortfolio');
    addBtn.textContent = t('portfolio.add') || 'Додати до портфеля';
    addBtn.classList.remove('btn-export');
    addBtn.classList.add('btn-save');
    _editingPortfolioId = null;
    _pendingCashHistory = null;
  }
}

function togglePortfolioTypeFields() {
  const type = document.getElementById('pType').value;
  const isOvdp = type === 'ovdp';
  const isDeposit = type === 'deposit';
  const isInsurance = type === 'insurance';
  const isCash = type === 'cash';

  // ОВДП bond picker — only when type is ovdp and bonds loaded
  const pOvdpSection = document.getElementById('pOvdpSection');
  if (pOvdpSection) {
    pOvdpSection.style.display = (isOvdp && typeof ovdpBonds !== 'undefined' && ovdpBonds.length > 0) ? 'block' : 'none';
  }

  // Bond fields — only ОВДП
  document.getElementById('pBondPriceField').style.display = isOvdp ? '' : 'none';
  document.getElementById('pBondCountField').style.display = isOvdp ? '' : 'none';
  const rcvField = document.getElementById('pReceivedAtMaturityField');
  if (rcvField) rcvField.style.display = isOvdp ? '' : 'none';

  // Cash currency — only for cash; bank field is hidden for cash.
  const cashCurField = document.getElementById('pCashCurrencyField');
  if (cashCurField) cashCurField.style.display = isCash ? '' : 'none';
  const bankField = document.getElementById('pBankField');
  if (bankField) bankField.style.display = isCash ? 'none' : '';
  if (typeof onPCashCurrencyChange === 'function') onPCashCurrencyChange();

  // Rate and dates — hidden for cash
  document.getElementById('pRateField').style.display = isCash ? 'none' : '';
  document.getElementById('pDateStartField').style.display = isCash ? 'none' : '';
  document.getElementById('pDateEndField').style.display = isCash ? 'none' : '';

  // Tax — deposit, insurance, and other
  document.getElementById('pTaxField').style.display = (isDeposit || isInsurance || type === 'other') ? '' : 'none';

  // Indexation — only insurance
  document.getElementById('pIndexField').style.display = isInsurance ? '' : 'none';

  // Compound checkbox — only deposit
  document.getElementById('pCompoundField').style.display = isDeposit ? '' : 'none';
  if (!isDeposit) document.getElementById('pCompound').checked = false;
}
// Legacy aliases
function togglePortfolioBondFields() { togglePortfolioTypeFields(); }
function togglePortfolioCompound() { togglePortfolioTypeFields(); }

function updatePortfolioUI() {
  const auth = document.getElementById('portfolioAuth');
  const content = document.getElementById('portfolioContent');
  if (typeof currentUser === 'undefined') return;
  if (currentUser) {
    auth.style.display = 'none';
    content.style.display = 'block';
    renderPortfolio();
  } else {
    auth.style.display = 'block';
    content.style.display = 'none';
  }
}

function addPortfolioItem() {
  const name = document.getElementById('pName').value.trim();
  const type = document.getElementById('pType').value;
  const bondPrice = parseNum(document.getElementById('pBondPrice').value);
  const bondCount = parseNum(document.getElementById('pBondCount').value);
  const invested = parseNum(document.getElementById('pInvested').value);
  const rate = parseNum(document.getElementById('pRate').value);
  const tax = parseNum(document.getElementById('pTax').value);
  const dateStart = document.getElementById('pDateStart').value;
  const dateEnd = document.getElementById('pDateEnd').value;
  const bank = document.getElementById('pBank').value.trim();
  const notes = document.getElementById('pNotes').value.trim();
  const indexation = parseNum(document.getElementById('pIndex').value);
  const receivedAtMaturity = parseNum(document.getElementById('pReceivedAtMaturity').value);
  const cashCurrency = (document.getElementById('pCashCurrency').value || 'UAH').toUpperCase();

  const isCompound = document.getElementById('pCompound').checked;

  if (!name || isNaN(invested) || invested <= 0) {
    const err = document.getElementById('pError');
    err.textContent = 'Вкажіть назву та суму вкладення';
    err.style.display = 'block';
    return;
  }
  document.getElementById('pError').style.display = 'none';

  const isCash = type === 'cash';
  const nowIso = new Date().toISOString();
  let history;
  if (isCash) {
    if (_pendingCashHistory) {
      history = _pendingCashHistory.history.slice();
      if (_pendingCashHistory.originalAmount !== invested) {
        history.push({ amount: invested, date: nowIso, note: 'Редагування' });
      }
    } else {
      history = [{ amount: invested, date: nowIso, note: 'Початковий баланс' }];
    }
  }
  _pendingCashHistory = null;

  const payload = {
    name, type, invested,
    rate: isCash || isNaN(rate) ? null : rate,
    bondPrice: type === 'ovdp' && !isNaN(bondPrice) && bondPrice > 0 ? bondPrice : null,
    bondCount: type === 'ovdp' && !isNaN(bondCount) && bondCount > 0 ? Math.floor(bondCount) : null,
    tax: isCash || isNaN(tax) ? null : tax,
    dateStart: isCash ? '' : dateStart,
    dateEnd: isCash ? '' : dateEnd,
    bank, notes,
    indexation: !isCash && !isNaN(indexation) && indexation > 0 ? indexation : null,
    compound: !isCash && isCompound,
    receivedAtMaturity: type === 'ovdp' && !isNaN(receivedAtMaturity) && receivedAtMaturity > 0 ? receivedAtMaturity : null,
    currency: isCash ? cashCurrency : null,
    history: isCash ? history : undefined
  };

  if (_editingPortfolioId !== null) {
    const idx = portfolioItems.findIndex(p => String(p.id) === String(_editingPortfolioId));
    if (idx !== -1) {
      portfolioItems[idx] = { ...portfolioItems[idx], ...payload };
    }
    _editingPortfolioId = null;
  } else {
    portfolioItems.push({ id: Date.now(), ...payload, createdAt: nowIso });
  }

  renderPortfolio();
  savePortfolioToFirestore();

  // Clear form
  document.getElementById('pName').value = '';
  document.getElementById('pBondPrice').value = '';
  document.getElementById('pBondCount').value = '';
  document.getElementById('pInvested').value = '';
  document.getElementById('pRate').value = '';
  document.getElementById('pTax').value = '';
  document.getElementById('pBank').value = '';
  document.getElementById('pReceivedAtMaturity').value = '';

  document.getElementById('pNotes').value = '';
  document.getElementById('pIndex').value = '';
  document.getElementById('pCompound').checked = false;
  const pOvdpSel = document.getElementById('pOvdpBondSelect');
  if (pOvdpSel) pOvdpSel.selectedIndex = 0;
  const pOvdpInfo = document.getElementById('pOvdpBondInfo');
  if (pOvdpInfo) pOvdpInfo.style.display = 'none';
  togglePortfolioTypeFields();
  const now = new Date();
  document.getElementById('pDateStart').value = now.toISOString().split('T')[0];
  const f = new Date(now); f.setMonth(f.getMonth() + 3);
  document.getElementById('pDateEnd').value = f.toISOString().split('T')[0];

  // Clear draft — data is now persisted in portfolio
  if (typeof FormDrafts !== 'undefined') FormDrafts.clear('portfolio.form');

  // Collapse form after adding (also resets button)
  togglePortfolioForm(false);

  const msg = document.getElementById('pSuccess');
  msg.textContent = '✓ Збережено!';
  msg.style.display = 'block';
  msg.style.animation = 'none';
  msg.offsetHeight;
  msg.style.animation = 'fadeOut 3s forwards';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

function openInvestmentDetail(id) {
  const item = portfolioItems.find(p => String(p.id) === String(id));
  if (!item) return;

  const now = new Date();
  const typeLabels = { ovdp: 'ОВДП', deposit: 'Депозит', compound: 'Складний %', insurance: 'Страхування', cash: 'Готівка', other: 'Інше' };
  const typeColors = { ovdp: 'p-type-ovdp', deposit: 'p-type-deposit', cash: 'p-type-cash', other: 'p-type-other' };
  const isCash = item.type === 'cash';
  const isActive = isCash ? false : (item.dateEnd ? new Date(item.dateEnd) > now : true);

  let days = 0, elapsed = 0, progress = 0, expectedProfit = 0, earnedSoFar = 0, dailyGross = 0, dailyNet = 0, daysLeft = 0;
  if (item.dateStart && item.dateEnd) {
    const start = new Date(item.dateStart);
    const end = new Date(item.dateEnd);
    days = Math.round((end - start) / 86400000);
    elapsed = Math.max(0, Math.round((now - start) / 86400000));
    daysLeft = Math.max(0, Math.round((end - now) / 86400000));
    progress = days > 0 ? Math.min(100, (elapsed / days) * 100) : 0;

    if (days > 0) {
      const totalYears = Math.round(days / 365.25);
      const ratePct = (item.rate || 0) / 100;
      const idxPct = (item.indexation || 0) / 100;
      const isIns = item.type === 'insurance';
      // Tax is withheld at each accrual (Ukrainian model), so compounding
      // happens on the NET interest. All earnings figures below are NET.
      const taxRate = (item.tax || 0) / 100;
      const effRate = ratePct * (1 - taxRate);

      if (isIns) {
        // Premium paid at START of each year, interest accrues DURING the year
        // on (prior balance + new premium). Matches user intuition that a 100k
        // deposit earns 100k × rate in year 1.
        const schedule = [];
        let balance = 0, totalInterest = 0, yp = item.invested;
        for (let y = 1; y <= totalYears; y++) {
          if (y > 1 && idxPct > 0) yp = item.invested * Math.pow(1 + idxPct, y - 1);
          balance += yp;
          const preInt = balance;
          const netInt = balance * effRate;
          balance += netInt;
          totalInterest += netInt;
          schedule.push({ preInt, netInt });
        }
        expectedProfit = totalInterest;
        // Earned-so-far: completed years' interest + proportional current year.
        const yearsE = Math.min(elapsed, days) / 365.25;
        const fullYears = Math.floor(yearsE);
        const frac = yearsE - fullYears;
        let earnedNet = 0;
        for (let i = 0; i < fullYears && i < schedule.length; i++) earnedNet += schedule[i].netInt;
        if (frac > 0 && fullYears < schedule.length) {
          earnedNet += schedule[fullYears].preInt * effRate * frac;
        }
        earnedSoFar = Math.min(earnedNet, expectedProfit);
        // Daily rate reflects the CURRENT year's accrual pace, not the first.
        const curIdx = Math.min(fullYears, schedule.length - 1);
        const curPre = schedule[curIdx] ? schedule[curIdx].preInt : item.invested;
        dailyGross = (curPre * (item.rate / 100)) / 365.25;
        dailyNet = dailyGross * (1 - taxRate);
      } else if (item.compound) {
        let balance = item.invested, totalInterest = 0;
        for (let y = 1; y <= totalYears; y++) {
          const netInt = balance * effRate;
          balance += netInt;
          totalInterest += netInt;
        }
        expectedProfit = totalInterest;
        const yearsE = Math.min(elapsed, days) / 365.25;
        earnedSoFar = item.invested * (Math.pow(1 + effRate, yearsE) - 1);
        earnedSoFar = Math.min(earnedSoFar, expectedProfit);
        dailyGross = item.invested * (item.rate / 100) / 365.25;
        dailyNet = dailyGross * (1 - taxRate);
      } else if (item.rate) {
        // Simple interest — single tax deduction at the end.
        const ty = days / 365.25;
        const ey = Math.min(elapsed, days) / 365.25;
        const grossExpected = item.invested * ratePct * ty;
        const grossEarned = item.invested * ratePct * ey;
        expectedProfit = grossExpected * (1 - taxRate);
        earnedSoFar = Math.min(grossEarned * (1 - taxRate), expectedProfit);
        dailyGross = item.invested * (item.rate / 100) / 365.25;
        dailyNet = dailyGross * (1 - taxRate);
      }
    }
  }

  // expectedProfit is NET; derive implied gross/tax for the Оподаткування card.
  const _taxRate = (item.tax || 0) / 100;
  const taxAmount = (item.tax && expectedProfit > 0)
    ? expectedProfit * _taxRate / (1 - _taxRate)
    : 0;
  const netProfit = expectedProfit;
  const grossProfit = expectedProfit + taxAmount;

  // Hide portfolio list, show detail
  document.getElementById('portfolioContent').style.display = 'none';
  document.getElementById('expiryAlerts').style.display = 'none';
  document.getElementById('portfolioSummary').style.display = 'none';
  const detail = document.getElementById('investmentDetail');
  detail.style.display = 'block';

  detail.querySelector('#investmentDetailContent').innerHTML = sanitize(`
    <div class="detail-header">
      <div class="detail-name">${esc(item.name)}</div>
      <span class="detail-type-badge ${typeColors[item.type] || ''}">${typeLabels[item.type] || item.type}</span>
      <div class="detail-invested">${formatNum(item.invested)} грн</div>
      ${item.bondPrice ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${formatShort(item.bondPrice)} грн × ${item.bondCount} шт.</div>` : ''}
      ${isCash ? '' : `<div class="detail-status" style="color:${isActive ? '#4ade80' : '#64748b'}">${isActive ? '● Активна' : '○ Завершена'}${item.compound ? ' · <span style="color:#a855f7">реінвестування</span>' : ''}</div>`}
      ${days > 0 ? `<div class="detail-progress"><div class="detail-progress-bar" style="width:${progress.toFixed(1)}%"></div></div>
      <div style="font-size:11px;color:#475569;margin-top:4px">${elapsed} з ${days} днів (${progress.toFixed(0)}%)</div>` : ''}
    </div>

    ${isCash ? '' : `<div class="detail-grid">
      <div class="detail-metric">
        <div class="detail-metric-label">Зароблено</div>
        <div class="detail-metric-value green">+${formatNum(earnedSoFar)} грн</div>
      </div>
      <div class="detail-metric">
        <div class="detail-metric-label">Очікуваний дохід</div>
        <div class="detail-metric-value green">+${formatNum(expectedProfit)} грн</div>
      </div>
      <div class="detail-metric">
        <div class="detail-metric-label">Дохід / день</div>
        <div class="detail-metric-value">${dailyGross.toFixed(2)} грн</div>
      </div>
      <div class="detail-metric">
        <div class="detail-metric-label">Чистий / день</div>
        <div class="detail-metric-value green">${dailyNet.toFixed(2)} грн</div>
      </div>
      <div class="detail-metric">
        <div class="detail-metric-label">Залишилось днів</div>
        <div class="detail-metric-value ${daysLeft <= 7 ? 'red' : daysLeft <= 30 ? 'yellow' : ''}">${daysLeft}</div>
      </div>
      <div class="detail-metric">
        <div class="detail-metric-label">Ставка</div>
        <div class="detail-metric-value yellow">${item.rate || '—'}%${(() => { const rr = computeRealRate(item); return rr !== null && item.rate && Math.abs(rr - item.rate) > 0.05 ? ' <span style="font-size:12px;color:#94a3b8;font-weight:400">(реал. ' + rr.toFixed(2) + '%)</span>' : ''; })()}</div>
      </div>
    </div>`}

    ${!isCash && item.compound && item.rate && days > 0 ? (() => {
      const totalYears = Math.round(days / 365.25);
      const r = item.rate / 100;
      const tax = (item.tax || 0) / 100;
      const effR = r * (1 - tax);
      // After-tax compounding (Ukrainian model: tax withheld each year).
      const finalBalance = item.invested * Math.pow(1 + effR, totalYears);
      const compProfit = finalBalance - item.invested;
      const simpleProfit = item.invested * r * totalYears * (1 - tax);
      const advantage = compProfit - simpleProfit;
      return `<div class="a-card">
        <h3>Складний відсоток${tax > 0 ? ' (після податку)' : ''}</h3>
        <div class="detail-info-row"><span class="detail-info-label">Ставка</span><span class="detail-info-value">${item.rate}% річних${tax > 0 ? ' <span style="color:#94a3b8;font-size:12px">(ефект. ' + (effR * 100).toFixed(2) + '%)</span>' : ''}</span></div>
        <div class="detail-info-row"><span class="detail-info-label">Термін</span><span class="detail-info-value">${totalYears} р. (щорічне реінвестування)</span></div>
        <div class="detail-info-row"><span class="detail-info-label">Підсумкова сума</span><span class="detail-info-value" style="color:#4ade80">${formatNum(finalBalance)} грн</span></div>
        <div class="detail-info-row"><span class="detail-info-label">Прибуток (складний)</span><span class="detail-info-value" style="color:#4ade80">+${formatNum(compProfit)} грн</span></div>
        <div class="detail-info-row"><span class="detail-info-label">Простий відсоток був би</span><span class="detail-info-value">+${formatNum(simpleProfit)} грн</span></div>
        <div class="detail-info-row"><span class="detail-info-label">Вигода від реінвестування</span><span class="detail-info-value" style="color:#a855f7">+${formatNum(advantage)} грн</span></div>
      </div>`;
    })() : ''}

    ${item.tax || taxAmount > 0 ? `<div class="a-card">
      <h3>Оподаткування</h3>
      <div class="detail-info-row"><span class="detail-info-label">Ставка податку</span><span class="detail-info-value">${item.tax}%</span></div>
      <div class="detail-info-row"><span class="detail-info-label">Сума податку</span><span class="detail-info-value" style="color:#f87171">−${formatNum(taxAmount)} грн</span></div>
      <div class="detail-info-row"><span class="detail-info-label">Чистий прибуток</span><span class="detail-info-value" style="color:#4ade80">+${formatNum(netProfit)} грн</span></div>
    </div>` : ''}

    <div class="a-card">
      <h3>Деталі</h3>
      ${item.bondPrice ? `<div class="detail-info-row"><span class="detail-info-label">Вартість 1 облігації</span><span class="detail-info-value">${formatNum(item.bondPrice)} грн</span></div>` : ''}
      ${item.bondCount ? `<div class="detail-info-row"><span class="detail-info-label">Кількість облігацій</span><span class="detail-info-value">${item.bondCount} шт.</span></div>` : ''}
      ${item.receivedAtMaturity ? `<div class="detail-info-row"><span class="detail-info-label">Отримаю при погашенні</span><span class="detail-info-value" style="color:#4ade80">${formatNum(item.receivedAtMaturity)} грн</span></div>` : ''}
      ${(() => { const rr = computeRealRate(item); return rr !== null ? `<div class="detail-info-row"><span class="detail-info-label">Реальна ставка</span><span class="detail-info-value"><strong style="color:#4ade80">${rr.toFixed(2)}%</strong>${item.rate && Math.abs(rr - item.rate) > 0.05 ? ' <span style="color:#f59e0b;font-size:12px">(введено ' + item.rate + '%)</span>' : ''}</span></div>` : ''; })()}
      ${item.indexation ? `<div class="detail-info-row"><span class="detail-info-label">Індексація внеску</span><span class="detail-info-value">${item.indexation}% / рік</span></div>` : ''}
      ${isCash ? '' : `<div class="detail-info-row"><span class="detail-info-label">Дата початку</span><span class="detail-info-value">${item.dateStart ? formatDate(item.dateStart) : '—'}</span></div>
      <div class="detail-info-row"><span class="detail-info-label">Дата завершення</span><span class="detail-info-value">${item.dateEnd ? formatDate(item.dateEnd) : '—'}</span></div>
      <div class="detail-info-row"><span class="detail-info-label">Термін</span><span class="detail-info-value">${days > 0 ? formatTerm(days) : '—'}</span></div>`}
      ${item.bank ? `<div class="detail-info-row"><span class="detail-info-label">Банк</span><span class="detail-info-value">${esc(item.bank)}</span></div>` : ''}
      ${item.notes ? `<div class="detail-info-row"><span class="detail-info-label">Нотатки</span><span class="detail-info-value">${esc(item.notes)}</span></div>` : ''}
      ${item.createdAt ? `<div class="detail-info-row"><span class="detail-info-label">Створено</span><span class="detail-info-value">${new Date(item.createdAt).toLocaleDateString('uk-UA')}</span></div>` : ''}
    </div>

    ${(() => {
      if (!item.dateStart || !item.dateEnd || days <= 0 || !item.rate) return '';
      const totalYears = Math.round(days / 365.25);
      const totalMonths = Math.round(days / 30.44);
      const isIns = item.type === 'insurance';
      const isCmp = !!item.compound;
      const ratePct = item.rate / 100;
      const idxPct = (item.indexation || 0) / 100;
      const startYear = new Date(item.dateStart).getFullYear();
      const startDate = new Date(item.dateStart);
      let rows = '', balance = 0, totalPaid = 0, totalInterest = 0;

      if (isIns) {
        // Insurance: premium paid at START of each year; interest accrues during
        // the year on (prior balance + new premium). Tax withheld at each accrual.
        const hasIdx = idxPct > 0;
        const taxRate = (item.tax || 0) / 100;
        const effRate = ratePct * (1 - taxRate);
        let yearlyPayment = item.invested;
        for (let y = 1; y <= totalYears; y++) {
          if (y > 1 && hasIdx) yearlyPayment = item.invested * Math.pow(1 + idxPct, y - 1);
          const idxAmount = y > 1 && hasIdx ? yearlyPayment - item.invested * Math.pow(1 + idxPct, y - 2) : 0;
          balance += yearlyPayment;
          const netInt = balance * effRate;
          balance += netInt;
          totalPaid += yearlyPayment;
          totalInterest += netInt;
          rows += '<tr><td>' + y + '</td><td>' + (startYear + y - 1) + '</td><td>' + formatNum(yearlyPayment) + '</td>' +
            (hasIdx ? '<td style="color:#f59e0b">' + (idxAmount > 0 ? '+' + formatNum(idxAmount) : '—') + '</td>' : '') +
            '<td style="color:#4ade80">' + (netInt > 0 ? '+' + formatNum(netInt) : '—') + '</td>' +
            '<td><strong>' + formatNum(balance) + '</strong></td></tr>';
        }
        return '<div class="a-card"><h3>Графік внесків по роках</h3>' +
          '<div style="max-height:400px;overflow-y:auto"><table class="credit-schedule-table"><thead><tr>' +
          '<th style="text-align:left">№</th><th>Рік</th><th>Внесок</th>' +
          (hasIdx ? '<th>Індексація</th>' : '') + '<th>Відсотки</th><th>Баланс</th>' +
          '</tr></thead><tbody>' + rows +
          '<tr style="font-weight:700;border-top:2px solid #334155"><td></td><td>Всього</td><td>' + formatNum(totalPaid) + '</td>' +
          (hasIdx ? '<td>—</td>' : '') +
          '<td style="color:#4ade80">' + (totalInterest > 0 ? '+' + formatNum(totalInterest) : '—') + '</td>' +
          '<td><strong>' + formatNum(balance) + '</strong></td></tr></tbody></table></div></div>';

      } else if (isCmp) {
        // Compound deposit: CALENDAR-year breakdown on the NET rate.
        // Tax is withheld yearly (Ukrainian model) → each year's reinvested
        // amount is net, so balance compounds at rate * (1 - tax).
        const endDate = new Date(item.dateEnd);
        const startCalYear = startDate.getFullYear();
        const endCalYear = endDate.getFullYear();
        const taxRate = (item.tax || 0) / 100;
        const effRate = ratePct * (1 - taxRate);

        // 1) Simulate deposit-year compounding on NET interest.
        const depYears = [];
        let depBal = item.invested;
        for (let y = 1; y <= totalYears; y++) {
          const yStart = new Date(startDate.getFullYear() + y - 1, startDate.getMonth(), startDate.getDate());
          const yEnd = new Date(startDate.getFullYear() + y, startDate.getMonth(), startDate.getDate());
          const netInt = depBal * effRate;
          depYears.push({ start: yStart, end: yEnd, interest: netInt });
          depBal += netInt;
        }

        // 2) Distribute each deposit year's interest across calendar years by time share.
        const calInt = {};
        for (const dy of depYears) {
          const first = dy.start.getFullYear();
          const last = dy.end.getFullYear();
          if (first === last) {
            calInt[first] = (calInt[first] || 0) + dy.interest;
          } else {
            const boundary = new Date(last, 0, 1);
            const totalMs = dy.end - dy.start;
            const shareFirst = (boundary - dy.start) / totalMs;
            calInt[first] = (calInt[first] || 0) + dy.interest * shareFirst;
            calInt[last] = (calInt[last] || 0) + dy.interest * (1 - shareFirst);
          }
        }

        // 3) Months of deposit actually inside each calendar year.
        const monthsInYear = yr => {
          const yStart = new Date(yr, 0, 1);
          const yEnd = new Date(yr + 1, 0, 1);
          const effStart = startDate > yStart ? startDate : yStart;
          const effEnd = endDate < yEnd ? endDate : yEnd;
          const ms = effEnd - effStart;
          return ms <= 0 ? 0 : ms / (30.4375 * 86400000);
        };

        balance = item.invested;
        for (let yr = startCalYear; yr <= endCalYear; yr++) {
          const months = monthsInYear(yr);
          if (months <= 0) continue;
          const int = calInt[yr] || 0;
          const balStart = balance;
          balance += int;
          totalInterest += int;
          const mRound = Math.max(1, Math.round(months));
          const isPartial = mRound < 12;
          const label = yr + (isPartial ? ' <span style="color:#94a3b8;font-size:11px">(' + mRound + ' міс.)</span>' : '');
          rows += '<tr><td>' + label + '</td><td>' + formatNum(balStart) +
            '</td><td style="color:#4ade80">+' + formatNum(int) + '</td><td><strong>' + formatNum(balance) + '</strong></td></tr>';
        }
        return '<div class="a-card"><h3>Графік нарахувань по роках</h3>' +
          '<div style="max-height:400px;overflow-y:auto"><table class="credit-schedule-table"><thead><tr>' +
          '<th style="text-align:left">Календ. рік</th><th>Баланс (поч.)</th><th>Нараховано</th><th>Баланс (кін.)</th>' +
          '</tr></thead><tbody>' + rows +
          '<tr style="font-weight:700;border-top:2px solid #334155"><td>Всього</td><td>' + formatNum(item.invested) +
          '</td><td style="color:#4ade80">+' + formatNum(totalInterest) + '</td><td><strong>' + formatNum(balance) + '</strong></td></tr></tbody></table></div></div>';

      } else if (totalYears <= 2) {
        // Simple deposit/OVDP up to 2 years: monthly table
        balance = item.invested;
        const monthlyRate = ratePct / 12;
        for (let m = 1; m <= totalMonths; m++) {
          const d = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
          const dateStr = d.toLocaleDateString('uk-UA', { month: '2-digit', year: 'numeric' });
          const interest = balance * monthlyRate;
          balance += interest;
          totalInterest += interest;
          rows += '<tr><td>' + m + '</td><td>' + dateStr + '</td><td style="color:#4ade80">+' + formatNum(interest) +
            '</td><td><strong>' + formatNum(balance) + '</strong></td></tr>';
        }
        return '<div class="a-card"><h3>Графік нарахувань по місяцях</h3>' +
          '<div style="max-height:400px;overflow-y:auto"><table class="credit-schedule-table"><thead><tr>' +
          '<th style="text-align:left">Міс.</th><th>Дата</th><th>Нараховано</th><th>Баланс</th>' +
          '</tr></thead><tbody>' + rows +
          '<tr style="font-weight:700;border-top:2px solid #334155"><td colspan="2">Всього</td>' +
          '<td style="color:#4ade80">+' + formatNum(totalInterest) + '</td><td><strong>' + formatNum(balance) + '</strong></td></tr></tbody></table></div></div>';

      } else {
        // Simple deposit/OVDP over 2 years: CALENDAR-year table.
        // Simple interest — each year contributes invested*rate (net of tax),
        // partial calendar years contribute proportionally to months in range.
        const endDate = new Date(item.dateEnd);
        const startCalYear = startDate.getFullYear();
        const endCalYear = endDate.getFullYear();
        const taxRate = (item.tax || 0) / 100;
        const yearInt = item.invested * ratePct * (1 - taxRate);
        const monthsInYear = yr => {
          const yStart = new Date(yr, 0, 1);
          const yEnd = new Date(yr + 1, 0, 1);
          const effStart = startDate > yStart ? startDate : yStart;
          const effEnd = endDate < yEnd ? endDate : yEnd;
          const ms = effEnd - effStart;
          return ms <= 0 ? 0 : ms / (30.4375 * 86400000);
        };
        balance = item.invested;
        for (let yr = startCalYear; yr <= endCalYear; yr++) {
          const months = monthsInYear(yr);
          if (months <= 0) continue;
          const frac = Math.min(months / 12, 1);
          const int = yearInt * frac;
          balance += int;
          totalInterest += int;
          const mRound = Math.max(1, Math.round(months));
          const isPartial = mRound < 12;
          const label = yr + (isPartial ? ' <span style="color:#94a3b8;font-size:11px">(' + mRound + ' міс.)</span>' : '');
          rows += '<tr><td>' + label + '</td><td style="color:#4ade80">+' + formatNum(int) +
            '</td><td><strong>' + formatNum(balance) + '</strong></td></tr>';
        }
        return '<div class="a-card"><h3>Графік нарахувань по роках</h3>' +
          '<div style="max-height:400px;overflow-y:auto"><table class="credit-schedule-table"><thead><tr>' +
          '<th style="text-align:left">Календ. рік</th><th>Нараховано</th><th>Баланс</th>' +
          '</tr></thead><tbody>' + rows +
          '<tr style="font-weight:700;border-top:2px solid #334155"><td>Всього</td>' +
          '<td style="color:#4ade80">+' + formatNum(totalInterest) + '</td><td><strong>' + formatNum(balance) + '</strong></td></tr></tbody></table></div></div>';
      }
    })()}

    ${isCash ? `<div class="a-card">
      <h3>Оновити баланс</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:140px">
          <label style="display:block;font-size:12px;color:#64748b;margin-bottom:4px">Нова сума (грн)</label>
          <input type="text" id="cashUpdateAmount" placeholder="${formatNum(item.invested)}" inputmode="decimal" style="width:100%;padding:10px 12px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#f1f5f9;font-size:14px;outline:none">
        </div>
        <div style="flex:2;min-width:180px">
          <label style="display:block;font-size:12px;color:#64748b;margin-bottom:4px">Коментар (необовʼязково)</label>
          <input type="text" id="cashUpdateNote" placeholder="Поповнення / зняття" style="width:100%;padding:10px 12px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#f1f5f9;font-size:14px;outline:none">
        </div>
        <button class="btn-save" onclick="updateCashBalance('${item.id}')" style="max-width:140px;margin-top:0">Додати</button>
      </div>
    </div>` : ''}

    ${isCash && item.history && item.history.length > 0 ? (() => {
      const rev = item.history.slice().reverse();
      const last = item.history[item.history.length - 1];
      return `<div class="a-card">
        <h3>Історія змін</h3>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">Остання зміна: <strong style="color:#cbd5e1">${new Date(last.date).toLocaleString('uk-UA')}</strong></div>
        <div style="max-height:400px;overflow-y:auto"><table class="credit-schedule-table" style="width:100%"><thead><tr>
          <th style="text-align:left">Дата</th><th>Сума</th><th>Δ</th><th style="text-align:left">Коментар</th>
        </tr></thead><tbody>
        ${rev.map((h, i) => {
          const older = rev[i + 1];
          const diff = older ? h.amount - older.amount : 0;
          const diffStr = !older ? '—' : (diff > 0 ? '<span style="color:#4ade80">+' + formatNum(diff) + '</span>' : diff < 0 ? '<span style="color:#f87171">' + formatNum(diff) + '</span>' : '0');
          return '<tr><td>' + new Date(h.date).toLocaleDateString('uk-UA') + '</td><td><strong>' + formatNum(h.amount) + '</strong></td><td>' + diffStr + '</td><td>' + esc(h.note || '') + '</td></tr>';
        }).join('')}
        </tbody></table></div>
      </div>`;
    })() : ''}

    <div class="detail-actions">
      <button class="btn-export" onclick="closeInvestmentDetail(); editPortfolioItem('${item.id}')">✎ Редагувати</button>
      <button class="btn-clear" onclick="confirmThen('Видалити це вкладення?', () => { deletePortfolioItem('${item.id}'); closeInvestmentDetail(); }, { danger: true, okText: 'Видалити' })">✕ Видалити</button>
    </div>
  `);

  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeInvestmentDetail() {
  document.getElementById('investmentDetail').style.display = 'none';
  document.getElementById('portfolioContent').style.display = 'block';
  document.getElementById('expiryAlerts').style.display = '';
  renderPortfolio();
}

function deletePortfolioItem(id) {
  portfolioItems = portfolioItems.filter(p => String(p.id) !== String(id));
  renderPortfolio();
  savePortfolioToFirestore();
}

function updateCashBalance(id) {
  const item = portfolioItems.find(p => String(p.id) === String(id));
  if (!item || item.type !== 'cash') return;
  const amountEl = document.getElementById('cashUpdateAmount');
  const noteEl = document.getElementById('cashUpdateNote');
  const amt = parseNum(amountEl.value);
  if (isNaN(amt) || amt < 0) { amountEl.focus(); return; }
  const note = noteEl.value.trim();
  if (!item.history || !item.history.length) {
    item.history = [{ amount: item.invested, date: item.createdAt || new Date().toISOString(), note: 'Початковий баланс' }];
  }
  item.history.push({ amount: amt, date: new Date().toISOString(), note });
  item.invested = amt;
  savePortfolioToFirestore();
  openInvestmentDetail(id);
}

let _pendingCashHistory = null;

function editPortfolioItem(id) {
  const item = portfolioItems.find(p => String(p.id) === String(id));
  if (!item) return;

  _pendingCashHistory = item.type === 'cash'
    ? { history: (item.history || []).slice(), originalAmount: item.invested }
    : null;

  document.getElementById('pName').value = item.name || '';
  document.getElementById('pType').value = item.type || 'ovdp';
  document.getElementById('pBondPrice').value = item.bondPrice ? formatShort(item.bondPrice) : '';
  document.getElementById('pBondCount').value = item.bondCount || '';
  togglePortfolioBondFields();
  document.getElementById('pInvested').value = item.invested ? Math.round(item.invested).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '';
  document.getElementById('pRate').value = item.rate || '';
  document.getElementById('pTax').value = item.tax || '';
  document.getElementById('pDateStart').value = item.dateStart || '';
  document.getElementById('pDateEnd').value = item.dateEnd || '';
  document.getElementById('pBank').value = item.bank || '';
  document.getElementById('pNotes').value = item.notes || '';
  document.getElementById('pReceivedAtMaturity').value = item.receivedAtMaturity ? formatShort(item.receivedAtMaturity) : '';
  if (typeof _updateRealRateDisplay === 'function') _updateRealRateDisplay();
  document.getElementById('pCashCurrency').value = item.currency || 'UAH';
  if (typeof onPCashCurrencyChange === 'function') onPCashCurrencyChange();

  // Compound fields
  // If saved as compound, set type to compound
  document.getElementById('pIndex').value = item.indexation || '';
  document.getElementById('pCompound').checked = !!item.compound;
  togglePortfolioCompound();

  // Mark which item is being edited; it stays in the list until the user saves.
  _editingPortfolioId = id;

  // Change button text
  const btn = document.getElementById('btnAddPortfolio');
  btn.textContent = t('portfolio.update') || 'Зберегти зміни';
  btn.classList.remove('btn-save');
  btn.classList.add('btn-export');

  // Open form and scroll to it
  togglePortfolioForm(true);
  // Mark just-filled values as clean baseline so the form isn't flagged dirty
  // until the user actually edits something. Clears any stale "new" draft too.
  if (typeof FormDrafts !== 'undefined') FormDrafts.setBaseline('portfolio.form');
  document.getElementById('pName').focus();
  document.getElementById('pName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderPortfolio() {
  const list = document.getElementById('portfolioList');
  const summary = document.getElementById('portfolioSummary');

  if (portfolioItems.length === 0) {
    list.innerHTML = '<div class="a-empty">Ще немає вкладень у портфелі.<br>Додайте перше вище.</div>';
    summary.style.display = 'none';
    return;
  }

  const now = new Date();
  const endOfYear = new Date(now.getFullYear(), 11, 31);
  let totalInvested = 0, totalExpectedProfit = 0, totalEarnedSoFar = 0, totalEarnedSoFarNet = 0, totalTaxSoFar = 0, activeCount = 0;
  let totalDailyGross = 0, totalDailyNet = 0, totalProfitToEOY = 0;
  const dailyBreakdown = [];

  const typeLabels = { ovdp: 'ОВДП', deposit: 'Депозит', compound: 'Складний %', insurance: 'Страхування', cash: 'Готівка', other: 'Інше' };

  list.innerHTML = sanitize(portfolioItems.map(p => {
    const isCash = p.type === 'cash';
    const isActive = isCash ? false : (p.dateEnd ? new Date(p.dateEnd) > now : true);
    const include = !isExcluded(p);
    if (include && isActive) activeCount++;
    // Cash can be in different currencies — convert to UAH for aggregation.
    if (include) totalInvested += isCash ? portfolioToUah(p.invested, portfolioCurOf(p)) : p.invested;

    let days = 0, elapsed = 0, progress = 0, daysLeft = 0;
    let expectedProfit = 0, expectedProfitNet = 0;
    let dailyGross = 0, dailyNet = 0, earnedSoFar = 0, earnedSoFarNet = 0;
    let insCurPreBal = 0;
    if (p.dateStart && p.dateEnd) {
      days = Math.round((new Date(p.dateEnd) - new Date(p.dateStart)) / 86400000);
      elapsed = Math.max(0, Math.round((now - new Date(p.dateStart)) / 86400000));
      daysLeft = Math.max(0, Math.round((new Date(p.dateEnd) - now) / 86400000));
      progress = days > 0 ? Math.min(100, (elapsed / days) * 100) : 0;
      if (days > 0) {
        const totalYearsN = Math.round(days / 365.25);
        const ratePct = (p.rate || 0) / 100;
        const idxPct = (p.indexation || 0) / 100;
        const isIns = p.type === 'insurance';
        // Ukrainian model: tax withheld at each accrual, so compound interest
        // reinvests net amount. Effective yearly rate = rate * (1 - tax).
        const taxRate = (p.tax || 0) / 100;
        const effRate = ratePct * (1 - taxRate);

        // ОВДП with exact "receive at maturity" from bank — bypass rate math entirely.
        if (p.type === 'ovdp' && p.receivedAtMaturity && p.receivedAtMaturity > 0) {
          expectedProfit = p.receivedAtMaturity - p.invested;
          expectedProfitNet = expectedProfit * (1 - taxRate);
          earnedSoFar = expectedProfit * Math.min(elapsed, days) / days;
          earnedSoFarNet = earnedSoFar * (1 - taxRate);
        } else if (isIns) {
          // Premium paid at START of each year; interest accrues during the year
          // on (prior balance + new premium). Tax withheld on NET interest.
          const schedule = [];
          let bal = 0, totalNetInt = 0, yPayment = p.invested;
          for (let y = 1; y <= totalYearsN; y++) {
            if (y > 1 && idxPct > 0) yPayment = p.invested * Math.pow(1 + idxPct, y - 1);
            bal += yPayment;
            const preInt = bal;
            const netI = bal * effRate;
            bal += netI;
            totalNetInt += netI;
            schedule.push({ preInt, netI });
          }
          expectedProfitNet = totalNetInt;
          expectedProfit = taxRate > 0 ? totalNetInt / (1 - taxRate) : totalNetInt;
          const yearsE = Math.min(elapsed, days) / 365.25;
          const fullYears = Math.floor(yearsE);
          const frac = yearsE - fullYears;
          let earnedNet = 0;
          for (let i = 0; i < fullYears && i < schedule.length; i++) earnedNet += schedule[i].netI;
          if (frac > 0 && fullYears < schedule.length) {
            earnedNet += schedule[fullYears].preInt * effRate * frac;
          }
          earnedSoFarNet = Math.min(earnedNet, expectedProfitNet);
          earnedSoFar = taxRate > 0 ? earnedSoFarNet / (1 - taxRate) : earnedSoFarNet;
          const curIdx = Math.min(fullYears, schedule.length - 1);
          insCurPreBal = schedule[curIdx] ? schedule[curIdx].preInt : 0;
        } else if (p.compound) {
          // Compound deposit — NET interest reinvested annually.
          let bal = p.invested, totalNetInt = 0;
          for (let y = 1; y <= totalYearsN; y++) {
            const netI = bal * effRate;
            bal += netI;
            totalNetInt += netI;
          }
          expectedProfitNet = totalNetInt;
          expectedProfit = taxRate > 0 ? totalNetInt / (1 - taxRate) : totalNetInt;
          const yearsE = Math.min(elapsed, days) / 365.25;
          earnedSoFarNet = p.invested * (Math.pow(1 + effRate, yearsE) - 1);
          earnedSoFarNet = Math.min(earnedSoFarNet, expectedProfitNet);
          earnedSoFar = taxRate > 0 ? earnedSoFarNet / (1 - taxRate) : earnedSoFarNet;
        } else if (p.rate) {
          // Simple interest — single tax deduction at the end.
          const ty = days / 365.25;
          const ey = Math.min(elapsed, days) / 365.25;
          expectedProfit = p.invested * ratePct * ty;
          expectedProfitNet = expectedProfit * (1 - taxRate);
          earnedSoFar = p.invested * ratePct * ey;
          earnedSoFar = Math.min(earnedSoFar, expectedProfit);
          earnedSoFarNet = earnedSoFar * (1 - taxRate);
        }
        if (include) totalExpectedProfit += expectedProfit;

        // Daily earnings (only for active investments)
        if (include && isActive && new Date(p.dateStart) <= now) {
          const useReceivedAtMaturity = p.type === 'ovdp' && p.receivedAtMaturity && p.receivedAtMaturity > 0;
          if (useReceivedAtMaturity) {
            dailyGross = days > 0 ? expectedProfit / days : 0;
          } else if (isIns && insCurPreBal) {
            // Insurance daily pace tracks current-year balance.
            dailyGross = (insCurPreBal * (p.rate / 100)) / 365.25;
          } else {
            dailyGross = (p.rate || 0) > 0 ? p.invested * (p.rate / 100) / 365.25 : 0;
          }
          dailyNet = dailyGross * (1 - taxRate);
          totalDailyGross += dailyGross;
          totalDailyNet += dailyNet;
          totalEarnedSoFar += earnedSoFar;
          totalEarnedSoFarNet += earnedSoFarNet;
          totalTaxSoFar += earnedSoFar - earnedSoFarNet;

          // Profit from now to end of year (or dateEnd if earlier)
          const eoyLimit = new Date(p.dateEnd) < endOfYear ? new Date(p.dateEnd) : endOfYear;
          const daysToEOY = Math.max(0, (eoyLimit - now) / 86400000);
          totalProfitToEOY += dailyGross * daysToEOY;

          dailyBreakdown.push({
            name: p.name,
            type: p.type,
            dailyGross,
            dailyNet,
            taxRate: p.tax || 0
          });
        }
      }
    }

    const excludedCls = !include ? ' excluded-item' : '';
    return `
      <div class="p-item${excludedCls}" onclick="if(!event.target.closest('.btn-delete')&&!event.target.closest('.exclude-toggle'))openInvestmentDetail('${p.id}')" style="cursor:pointer">
        <div class="p-item-info">
          <div class="p-item-name">
            ${esc(p.name)}
            <span class="p-item-type p-type-${esc(p.type)}">${esc(typeLabels[p.type] || p.type)}</span>
            ${isCash ? '' : '<span class="' + (isActive ? 'p-status-active' : 'p-status-ended') + '" style="font-size:11px">' + (isActive ? '● Активна' : '○ Завершена') + '</span>'}
            ${p.compound ? '<span class="p-item-type p-type-compound" style="font-size:10px">реінвест.</span>' : ''}
            ${_exclusionCheckboxHtml('portfolio', p.id, !include)}
          </div>
          ${days > 0 ? '<div class="detail-progress" style="margin:6px 0"><div class="detail-progress-bar" style="width:' + progress.toFixed(1) + '%"></div></div><div style="display:flex;justify-content:space-between;font-size:10px;color:#475569;margin-bottom:4px"><span>' + (isActive ? elapsed + ' з ' + days + ' дн. (' + progress.toFixed(0) + '%)' : 'Завершено') + '</span><span>' + (daysLeft > 0 ? daysLeft + ' дн. залишилось' : '') + '</span></div>' : ''}
          <div class="p-item-details p-row">
            <span>${isCash ? 'Сума' : 'Вкладено'}: <strong>${isCash ? fmtPortfolioAmount(p.invested, portfolioCurOf(p)) : formatNum(p.invested) + ' грн'}</strong></span>
            ${p.bondPrice ? '<span>' + formatShort(p.bondPrice) + ' грн × ' + p.bondCount + ' шт.</span>' : ''}
          </div>
          <div class="p-item-details p-row">
            ${p.rate ? '<span>Ставка: <strong>' + p.rate + '%</strong>' + (() => { const rr = computeRealRate(p); return rr !== null && Math.abs(rr - p.rate) > 0.05 ? ' <span style="color:#94a3b8;font-weight:400">(реал. ' + rr.toFixed(2) + '%)</span>' : ''; })() + '</span>' : ''}
            ${days > 0 ? '<span>Строк: <strong>' + days + ' дн.</strong></span>' : ''}
            ${p.tax ? '<span>Податок: <strong>' + p.tax + '%</strong></span>' : ''}
          </div>
          ${p.dateStart ? '<div class="p-item-details p-row"><span>' + formatDate(p.dateStart) + ' → ' + (p.dateEnd ? formatDate(p.dateEnd) : '...') + '</span></div>' : ''}
          ${p.bank ? '<div class="p-item-details p-row"><span>Банк: <strong>' + esc(p.bank) + '</strong></span></div>' : ''}
          ${p.notes ? '<div class="p-item-notes">' + esc(p.notes) + '</div>' : ''}
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn-delete" onclick="event.stopPropagation();editPortfolioItem('${p.id}')" style="color:#60a5fa">✎</button>
            <button class="btn-delete" onclick="event.stopPropagation();confirmThen('Видалити це вкладення?', () => deletePortfolioItem('${p.id}'), { danger: true, okText: 'Видалити' })">✕</button>
          </div>
        </div>
        <div class="p-item-actions">
          ${expectedProfit > 0 ? '<div class="p-item-profit"><div class="amount">+' + formatShort(expectedProfit) + ' грн</div><div class="label">очікуваний дохід</div>' + (p.tax && expectedProfit > 0 ? '<div style="color:#f87171;font-size:12px;margin-top:2px">−' + formatShort(expectedProfit - expectedProfitNet) + ' податок</div><div style="color:#4ade80;font-size:13px;font-weight:700">=' + formatShort(expectedProfitNet) + ' чистими</div>' : '') + '</div>' : ''}
        </div>
      </div>
    `;
  }).join(''));

  // Dashboard
  summary.style.display = 'block';
  // Hero shows net value — principal + what the user would actually get if withdrawn today (after tax).
  const totalValue = totalInvested + totalEarnedSoFarNet;
  document.getElementById('dashTotalValue').textContent = formatShort(totalValue) + ' грн';
  document.getElementById('dashDailyTotal').innerHTML =
    '<span class="dash-daily-badge">+' + formatNum(totalDailyNet) + ' грн сьогодні (чисті)</span>';
  document.getElementById('dashInvested').textContent = formatShort(totalInvested) + ' грн';
  // Earned so far — show net; include gross+tax hint when tax applies.
  const earnedEl = document.getElementById('dashEarned');
  earnedEl.textContent = '+' + formatNum(totalEarnedSoFarNet) + ' грн';
  const earnedHintId = 'dashEarnedHint';
  let earnedHint = document.getElementById(earnedHintId);
  if (totalTaxSoFar > 0.005) {
    if (!earnedHint) {
      earnedHint = document.createElement('div');
      earnedHint.id = earnedHintId;
      earnedHint.style.cssText = 'font-size:11px;color:#94a3b8;margin-top:2px';
      earnedEl.parentNode.appendChild(earnedHint);
    }
    earnedHint.textContent = 'гросс: ' + formatNum(totalEarnedSoFar) + ' грн (−' + formatNum(totalTaxSoFar) + ' податок)';
  } else if (earnedHint) {
    earnedHint.remove();
  }
  document.getElementById('dashDailyNet').textContent = '+' + formatNum(totalDailyNet) + ' грн';
  document.getElementById('dashActiveCount').textContent = activeCount;

  // Daily breakdown
  const breakdownEl = document.getElementById('dashDailyBreakdown');
  if (dailyBreakdown.length === 0) {
    breakdownEl.innerHTML = '<p style="color:#475569;font-size:13px;text-align:center;padding:12px 0">Немає активних вкладень з нарахуванням</p>';
  } else {
    breakdownEl.innerHTML = dailyBreakdown.map(d => `
      <div class="dash-breakdown-item">
        <div class="dash-breakdown-name">
          <span class="p-item-type p-type-${d.type}">${typeLabels[d.type] || d.type}</span>
          ${esc(d.name)}
        </div>
        <div class="dash-breakdown-values">
          <div class="dash-breakdown-gross">+${d.dailyGross.toFixed(2)} грн</div>
          <div class="dash-breakdown-net">${d.taxRate > 0 ? 'чисті: ' + d.dailyNet.toFixed(2) + ' грн (−' + d.taxRate + '%)' : 'без податку'}</div>
        </div>
      </div>
    `).join('');
  }

  renderPortfolioChart(activeOnly(portfolioItems));
  loadCurrencyRates(totalInvested, totalExpectedProfit, totalProfitToEOY);
  renderExpiryAlerts(portfolioItems);
}

// ---- Expiry Alerts ----
function renderExpiryAlerts(items) {
  const container = document.getElementById('expiryAlerts');
  if (!container) return;
  const notifyDays = parseInt(localStorage.getItem('notifyDays') || '3');
  const now = new Date();
  const alerts = [];

  items.forEach(p => {
    if (!p.dateEnd) return;
    const end = new Date(p.dateEnd);
    const daysLeft = Math.ceil((end - now) / 86400000);
    if (daysLeft < 0 || daysLeft > notifyDays) return;
    alerts.push({ name: p.name, daysLeft, type: p.type });
  });

  if (alerts.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = sanitize(alerts.map(a => {
    const isUrgent = a.daysLeft <= 1;
    const cls = isUrgent ? 'expiry-alert-urgent' : 'expiry-alert-warn';
    const icon = isUrgent ? '🔴' : '⚠️';
    const daysText = a.daysLeft === 0 ? 'сьогодні'
      : a.daysLeft === 1 ? 'завтра'
      : 'через ' + a.daysLeft + ' дн.';
    return `<div class="expiry-alert ${cls}">
      <span class="expiry-alert-icon">${icon}</span>
      <div class="expiry-alert-text">
        <span class="expiry-alert-name">${esc(a.name)}</span> — завершується <span class="expiry-alert-days">${daysText}</span>
      </div>
    </div>`;
  }).join(''));
}

// Notification/Telegram functions moved to telegram.js

// ---- Portfolio Chart ----
let portfolioChartInstance = null;

let portfolioChartYear = null; // null = auto (latest dateEnd)

// Snapshot of a portfolio item at a specific time, using the same model the
// detail view uses. Returns cumulative paid-in amount and NET balance/value.
function _portfolioItemSnapshot(p, curTime) {
  const s = new Date(p.dateStart).getTime();
  const e = new Date(p.dateEnd).getTime();
  if (curTime < s) return { invested: 0, value: 0 };
  const effTime = Math.min(curTime, e);
  const elapsedDays = (effTime - s) / 86400000;
  const elapsedYears = elapsedDays / 365.25;
  const ratePct = (p.rate || 0) / 100;
  const taxRate = (p.tax || 0) / 100;
  const effRate = ratePct * (1 - taxRate);
  const idxPct = (p.indexation || 0) / 100;

  if (p.type === 'insurance') {
    // Annual premium paid at start of each year, with indexation; NET interest
    // accrues on balance during the year.
    let balance = 0, paid = 0, yp = p.invested;
    const fullYears = Math.floor(elapsedYears);
    for (let y = 1; y <= fullYears; y++) {
      if (y > 1 && idxPct > 0) yp = p.invested * Math.pow(1 + idxPct, y - 1);
      balance += yp;
      paid += yp;
      balance += balance * effRate;
    }
    const frac = elapsedYears - fullYears;
    if (frac > 0) {
      const curY = fullYears + 1;
      const curYp = (curY === 1 || idxPct === 0) ? p.invested : p.invested * Math.pow(1 + idxPct, curY - 1);
      balance += curYp;
      paid += curYp;
      balance += balance * effRate * frac;
    }
    return { invested: paid, value: balance };
  }

  if (p.type === 'ovdp' && p.receivedAtMaturity && p.receivedAtMaturity > 0) {
    const totalDays = (e - s) / 86400000;
    const frac = totalDays > 0 ? Math.min(elapsedDays / totalDays, 1) : 0;
    return { invested: p.invested, value: p.invested + (p.receivedAtMaturity - p.invested) * frac };
  }

  if (p.compound) {
    // Compound deposit — NET interest reinvested yearly.
    return { invested: p.invested, value: p.invested * Math.pow(1 + effRate, elapsedYears) };
  }

  // Simple interest (deposit/OVDP/other) — NET profit.
  const profit = p.invested * ratePct * elapsedYears * (1 - taxRate);
  return { invested: p.invested, value: p.invested + Math.max(0, profit) };
}

function renderPortfolioChart(items) {
  const canvas = document.getElementById('portfolioChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (portfolioChartInstance) {
    portfolioChartInstance.destroy();
  }

  const now = new Date();
  const activeItems = items.filter(p => p.dateStart && p.dateEnd && p.rate);

  if (activeItems.length === 0) {
    canvas.parentElement.innerHTML = '<p style="text-align:center;color:#475569;padding:40px;font-size:13px">Додайте вкладення зі ставкою та датами для графіку</p>';
    document.getElementById('chartYearFilters').innerHTML = '';
    return;
  }

  // Find date range
  let minDate = new Date(activeItems[0].dateStart);
  let maxDate = new Date(activeItems[0].dateEnd);
  activeItems.forEach(p => {
    const s = new Date(p.dateStart);
    const e = new Date(p.dateEnd);
    if (s < minDate) minDate = s;
    if (e > maxDate) maxDate = e;
  });

  // Build year filter select (show chart from start up to selected year end).
  // Ascending order from today's year to maturity — intermediate views only.
  const minYear = minDate.getFullYear();
  const maxYear = maxDate.getFullYear();
  const sel = document.getElementById('chartYearFilter');
  const currentVal = portfolioChartYear === null ? 'all' : String(portfolioChartYear);
  const nowYear = now.getFullYear();
  const firstYear = Math.max(nowYear, minYear);
  let opts = '<option value="all"' + (currentVal === 'all' ? ' selected' : '') + '>До кінця (' + maxYear + ')</option>';
  for (let yr = firstYear; yr <= maxYear; yr++) {
    opts += '<option value="' + yr + '"' + (currentVal === String(yr) ? ' selected' : '') + '>До ' + yr + '</option>';
  }
  sel.innerHTML = opts;

  // Apply year filter — keep minDate, adjust maxDate
  if (portfolioChartYear !== null) {
    maxDate = new Date(portfolioChartYear, 11, 31);
  }

  const dayMs = 86400000;
  const startTime = minDate.getTime();
  const endTime = maxDate.getTime();
  const totalDays = Math.ceil((endTime - startTime) / dayMs);
  const step = totalDays > 365 ? 7 : totalDays > 180 ? 3 : 1;

  const labels = [];
  const investedLine = [];
  const valueLine = [];
  const projectedLine = [];
  const todayPointInvested = [];
  const todayPointValue = [];
  let todayIndex = -1;

  for (let d = 0; d <= totalDays; d += step) {
    const date = new Date(startTime + d * dayMs);
    labels.push(date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }));

    let inv = 0, val = 0;
    activeItems.forEach(p => {
      const snap = _portfolioItemSnapshot(p, date.getTime());
      inv += snap.invested;
      val += snap.value;
    });

    const isPast = date <= now;
    investedLine.push(inv);
    if (isPast) {
      valueLine.push(val);
      projectedLine.push(null);
    } else {
      valueLine.push(null);
      projectedLine.push(val);
    }

    // Detect today
    todayPointInvested.push(null);
    todayPointValue.push(null);
    if (todayIndex === -1 && date >= now) {
      todayIndex = labels.length - 1;
      todayPointInvested[todayIndex] = inv;
      todayPointValue[todayIndex] = valueLine[todayIndex] || projectedLine[todayIndex];
    }
  }

  // Connect projected to value at today
  if (todayIndex > 0 && todayIndex < projectedLine.length && valueLine[todayIndex - 1] != null) {
    projectedLine[todayIndex] = valueLine[todayIndex - 1];
  }

  // Summary: values at chart end date
  const lastIdx = labels.length - 1;
  const endInvested = investedLine[lastIdx] || 0;
  const endValue = (valueLine[lastIdx] || projectedLine[lastIdx]) || 0;
  const endProfit = endValue - endInvested;
  const endDateStr = maxDate.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('chartSummary').innerHTML = `
    <div class="chart-summary">
      <div class="chart-summary-date">На ${endDateStr}</div>
      <div class="chart-summary-grid">
        <div><div class="chart-summary-label">Вкладено</div><div class="chart-summary-value" style="color:#3b82f6">${formatNum(endInvested)} грн</div></div>
        <div><div class="chart-summary-label">Вартість</div><div class="chart-summary-value">${formatNum(endValue)} грн</div></div>
        <div><div class="chart-summary-label">Прибуток</div><div class="chart-summary-value" style="color:#4ade80">+${formatNum(endProfit)} грн</div></div>
      </div>
    </div>`;

  const forecastColor = '#facc15';
  portfolioChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Вкладено',
          data: investedLine,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: 'Поточна вартість',
          data: valueLine,
          borderColor: '#4ade80',
          backgroundColor: 'rgba(74,222,128,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: 'Прогноз',
          data: projectedLine,
          borderColor: forecastColor,
          borderDash: [6, 4],
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
          fill: false
        },
        {
          label: 'Сьогодні',
          data: todayPointValue,
          borderColor: '#f87171',
          backgroundColor: '#f87171',
          pointRadius: 7,
          pointHoverRadius: 9,
          pointStyle: 'circle',
          borderWidth: 2,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.raw == null) return null;
              return ctx.dataset.label + ': ' + formatShort(ctx.raw) + ' грн';
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#475569',
            maxTicksLimit: window.innerWidth < 500 ? 6 : 12,
            maxRotation: 45,
            font: { size: window.innerWidth < 500 ? 9 : 11 }
          },
          grid: { color: 'rgba(51,65,85,0.3)' }
        },
        y: {
          ticks: {
            color: '#475569',
            font: { size: 11 },
            callback: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v
          },
          grid: { color: 'rgba(51,65,85,0.3)' }
        }
      }
    }
  });
}

// ---- Currency Rates (NBU API) ----
let cachedRates = null;
let cachedRatesArray = null;
let ratesCacheTime = 0;
let dashboardCurrencies = JSON.parse(localStorage.getItem('dashboardCurrencies') || '["USD","EUR"]');

const currencySymbols = { USD:'$', EUR:'€', GBP:'£', PLN:'zł', CHF:'Fr', JPY:'¥', CAD:'C$', CZK:'Kč', SEK:'kr', CNY:'¥', TRY:'₺' };
function getCurrencySymbol(cc) { return currencySymbols[cc] || cc + ' '; }

async function loadCurrencyRates(totalInvested, totalExpectedProfit, totalProfitToEOY) {
  const container = document.getElementById('pCurrencyRow');
  const dateEl = document.getElementById('pCurrencyDate');
  if (!container) return;

  const totalValue = totalInvested + totalExpectedProfit;

  try {
    // Cache for 1 hour
    if (!cachedRates || Date.now() - ratesCacheTime > 3600000) {
      const res = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
      const data = await res.json();
      cachedRatesArray = data;
      cachedRates = {};
      data.forEach(r => { cachedRates[r.cc] = r.rate; });
      cachedRates._date = data[0]?.exchangedate || '';
      ratesCacheTime = Date.now();
    }

    let html = '';
    const eoyYear = new Date().getFullYear();
    dashboardCurrencies.forEach(cc => {
      const rate = cachedRates[cc];
      if (!rate) return;
      const sym = getCurrencySymbol(cc);
      html += `
        <div class="currency-summary">
          <div class="currency-summary-header">
            <span class="currency-summary-code">${cc}</span>
            <span class="currency-summary-rate">${rate.toFixed(2)} ₴</span>
          </div>
          <div class="currency-summary-row">
            <div class="currency-summary-cell">
              <div class="a-stat-label">Вкладено</div>
              <div class="a-stat-value">${sym}${formatNum(totalInvested / rate)}</div>
            </div>
            <div class="currency-summary-cell">
              <div class="a-stat-label">За строк</div>
              <div class="a-stat-value green">+${sym}${formatNum(totalExpectedProfit / rate)}</div>
            </div>
            <div class="currency-summary-cell">
              <div class="a-stat-label">До ${eoyYear}</div>
              <div class="a-stat-value green">+${sym}${formatNum((totalProfitToEOY || 0) / rate)}</div>
            </div>
          </div>
        </div>`;
    });
    if (!html) {
      container.innerHTML = '<p style="color:#475569;font-size:13px">Курси недоступні</p>';
      return;
    }
    container.innerHTML = html;
    dateEl.textContent = 'Курс НБУ: ' + cachedRates._date;
  } catch(e) {
    container.innerHTML = '<p style="color:#475569;font-size:13px">Не вдалося завантажити курси валют</p>';
    console.warn('Currency rates failed:', e);
  }
}

// ---- Currencies Page ----
async function loadCurrenciesPage(forceRefresh) {
  if (forceRefresh) { cachedRates = null; ratesCacheTime = 0; }
  const pinnedEl = document.getElementById('currenciesPinned');
  const listEl = document.getElementById('currencyList');
  const dateEl = document.getElementById('currenciesDate');
  if (!pinnedEl) return;

  try {
    if (!cachedRates || Date.now() - ratesCacheTime > 3600000) {
      const res = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
      const data = await res.json();
      cachedRatesArray = data;
      cachedRates = {};
      data.forEach(r => { cachedRates[r.cc] = r.rate; });
      cachedRates._date = data[0]?.exchangedate || '';
      ratesCacheTime = Date.now();
    }

    dateEl.textContent = 'НБУ: ' + (cachedRates._date || '');
    const updEl = document.getElementById('currenciesUpdatedAt');
    if (updEl) updEl.textContent = '· оновлено ' + new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

    // Pinned cards
    pinnedEl.innerHTML = dashboardCurrencies.map(cc => {
      const rate = cachedRates[cc];
      const info = cachedRatesArray ? cachedRatesArray.find(r => r.cc === cc) : null;
      if (!rate) return '';
      return `<div class="currency-pinned-card">
        <div class="currency-pinned-code">${cc}</div>
        <div class="currency-pinned-rate">${rate.toFixed(4)} грн</div>
        <div class="currency-pinned-name">${info ? info.txt : ''}</div>
      </div>`;
    }).join('');

    // Black market (PrivatBank cash rates) — same order as pinned
    const bmEl = document.getElementById('blackMarketRates');
    try {
      const bmRes = await fetch('https://darkblue-toad-531724.hostingersite.com/api/rates/black');
      const bmData = await bmRes.json();
      const bmMap = {};
      bmData.forEach(r => { bmMap[r.ccy] = r; });

      // Show in same order as pinned currencies, then any remaining
      const bmOrder = [...dashboardCurrencies.filter(cc => bmMap[cc]), ...bmData.map(r => r.ccy).filter(cc => !dashboardCurrencies.includes(cc))];

      bmEl.innerHTML = '<div class="dash-grid">' + bmOrder.map(cc => {
        const r = bmMap[cc];
        if (!r) return '';
        const nbuRate = cachedRates[r.ccy];
        const buy = parseFloat(r.buy);
        const sale = parseFloat(r.sale);
        const change = r.change !== undefined ? parseFloat(r.change) : 0;
        const diffNbu = nbuRate ? ((sale - nbuRate) / nbuRate * 100).toFixed(1) : null;
        const changeColor = change > 0 ? '#f87171' : change < 0 ? '#4ade80' : '#475569';
        const changeIcon = change > 0 ? '↑' : change < 0 ? '↓' : '→';
        const changeText = change !== 0 ? `<span style="color:${changeColor};font-size:12px;font-weight:600">${changeIcon} ${change > 0 ? '+' : ''}${change}%</span>` : '';
        const openInfo = r.open_sale ? `<div style="font-size:10px;color:#475569;margin-top:2px">Відкриття: ${r.open_sale} грн</div>` : '';
        return `<div class="currency-pinned-card">
          <div class="currency-pinned-code" style="color:#f59e0b">${r.ccy} ${changeText}</div>
          <div style="display:flex;justify-content:center;gap:16px;margin:6px 0">
            <div><div style="font-size:10px;color:#64748b">Купівля</div><div class="currency-pinned-rate">${buy.toFixed(2)} грн</div></div>
            <div><div style="font-size:10px;color:#64748b">Продаж</div><div class="currency-pinned-rate">${sale.toFixed(2)} грн</div></div>
          </div>
          ${openInfo}
          <div class="currency-pinned-name">${diffNbu !== null ? 'НБУ ' + (diffNbu > 0 ? '+' : '') + diffNbu + '%' : ''}</div>
        </div>`;
      }).join('') + '</div>';
    } catch(e) {
      bmEl.innerHTML = '<p style="color:#475569;font-size:12px">Готівковий курс недоступний</p>';
    }

    // Full list
    if (!cachedRatesArray) return;
    listEl.innerHTML = cachedRatesArray.map(r => {
      const isPinned = dashboardCurrencies.includes(r.cc);
      return `<div class="currency-row" data-cc="${r.cc}" data-name="${r.txt.toLowerCase()}">
        <span class="currency-code">${r.cc}</span>
        <span class="currency-name">${r.txt}</span>
        <span class="currency-rate">${r.rate.toFixed(4)}</span>
        <button class="currency-star${isPinned ? ' active' : ''}" onclick="toggleDashboardCurrency('${r.cc}')">${isPinned ? '★' : '☆'}</button>
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = '<p style="color:#475569;font-size:13px;text-align:center;padding:20px">' + (t('currencies.noRates') || 'Не вдалося завантажити курси') + '</p>';
    console.warn('Currencies page load failed:', e);
  }
}

function filterCurrencyList() {
  const q = document.getElementById('currencySearch').value.toLowerCase().trim();
  document.querySelectorAll('#currencyList .currency-row').forEach(row => {
    const cc = row.dataset.cc.toLowerCase();
    const name = row.dataset.name;
    row.style.display = (!q || cc.includes(q) || name.includes(q)) ? '' : 'none';
  });
}

function toggleDashboardCurrency(code) {
  const idx = dashboardCurrencies.indexOf(code);
  if (idx >= 0) {
    dashboardCurrencies.splice(idx, 1);
  } else if (dashboardCurrencies.length < 2) {
    dashboardCurrencies.push(code);
  } else {
    // Replace oldest
    dashboardCurrencies.shift();
    dashboardCurrencies.push(code);
  }
  localStorage.setItem('dashboardCurrencies', JSON.stringify(dashboardCurrencies));
  if (currentUser) saveProfileToFirestore();

  // Re-render stars on currencies page
  document.querySelectorAll('#currencyList .currency-star').forEach(btn => {
    const row = btn.closest('.currency-row');
    const cc = row.dataset.cc;
    const isPinned = dashboardCurrencies.includes(cc);
    btn.className = 'currency-star' + (isPinned ? ' active' : '');
    btn.textContent = isPinned ? '★' : '☆';
  });
  // Re-render pinned
  const pinnedEl = document.getElementById('currenciesPinned');
  if (pinnedEl && cachedRatesArray) {
    pinnedEl.innerHTML = dashboardCurrencies.map(cc => {
      const rate = cachedRates[cc];
      const info = cachedRatesArray.find(r => r.cc === cc);
      if (!rate) return '';
      return `<div class="currency-pinned-card">
        <div class="currency-pinned-code">${cc}</div>
        <div class="currency-pinned-rate">${rate.toFixed(4)} грн</div>
        <div class="currency-pinned-name">${info ? info.txt : ''}</div>
      </div>`;
    }).join('');
  }
  // Update settings page if open
  renderDashboardCurrencySettings();
}

const popularCurrencies = ['USD','EUR','PLN','GBP','CHF','CAD'];

function renderDashboardCurrencySettings() {
  const container = document.getElementById('dashboardCurrencyOptions');
  if (!container) return;
  container.innerHTML = popularCurrencies.map(cc =>
    `<button class="currency-select-btn${dashboardCurrencies.includes(cc) ? ' active' : ''}" onclick="toggleDashboardCurrency('${cc}')">${cc} ${getCurrencySymbol(cc)}</button>`
  ).join('');
}

// Portfolio/Profile Firestore functions moved to firebase.js

// ---- PIN CODE ----
const PIN_TIMEOUT = 60 * 60 * 1000; // 60 minutes
let pinVerified = false;
let lastActivityTime = Date.now();

// Track user activity
['click', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => { lastActivityTime = Date.now(); }, { passive: true });
});

// Check inactivity every minute + on tab focus
function checkPinTimeout() {
  if (pinVerified && userProfile.pin && (Date.now() - lastActivityTime > PIN_TIMEOUT)) {
    pinVerified = false;
    showPinPrompt();
  }
}
setInterval(checkPinTimeout, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkPinTimeout();
});

async function savePin() {
  const pin = document.getElementById('pinCode').value.trim();
  const confirm = document.getElementById('pinCodeConfirm').value.trim();
  const err = document.getElementById('pinError');

  if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
    err.textContent = t('profile.pinErrorFormat') || 'PIN має бути 4-6 цифр';
    err.style.display = 'block';
    return;
  }
  if (pin !== confirm) {
    err.textContent = t('profile.pinErrorMatch') || 'PIN-коди не збігаються';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';

  userProfile.pin = await hashPin(pin);
  saveProfileToFirestore();

  document.getElementById('pinCode').value = '';
  document.getElementById('pinCodeConfirm').value = '';
  updatePinStatus();

  const msg = document.getElementById('pinSuccess');
  msg.textContent = '✓ PIN збережено!';
  msg.style.display = 'block';
  msg.style.animation = 'none';
  msg.offsetHeight;
  msg.style.animation = 'fadeOut 3s forwards';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

function removePin() {
  userProfile.pin = null;
  saveProfileToFirestore();
  updatePinStatus();
}

function updatePinStatus() {
  const status = document.getElementById('pinStatus');
  const removeBtn = document.getElementById('pinRemoveBtn');
  if (userProfile.pin) {
    status.textContent = t('profile.pinActive') || 'PIN-код встановлено';
    status.style.color = '#4ade80';
    removeBtn.style.display = '';
  } else {
    status.textContent = t('profile.pinInactive') || 'PIN-код не встановлено';
    status.style.color = '#64748b';
    removeBtn.style.display = 'none';
  }
}

function checkPinOnLogin() {
  if (!userProfile.pin) {
    pinVerified = true;
    return;
  }
  // Check if PIN was verified recently (within timeout)
  const lastVerified = parseInt(sessionStorage.getItem('pinVerifiedAt') || '0');
  if (Date.now() - lastVerified < PIN_TIMEOUT) {
    pinVerified = true;
    lastActivityTime = Date.now();
    return;
  }
  pinVerified = false;
  showPinPrompt();
}

function showPinPrompt() {
  const overlay = document.createElement('div');
  overlay.id = 'pinOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.95);display:flex;align-items:center;justify-content:center;z-index:9999';
  overlay.innerHTML = `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:36px;max-width:360px;width:100%;text-align:center">
      <div style="font-size:40px;margin-bottom:16px">🔒</div>
      <h2 style="color:#f1f5f9;font-size:18px;margin-bottom:8px" data-i18n="profile.pinPromptTitle">Введіть PIN-код</h2>
      <p style="color:#64748b;font-size:13px;margin-bottom:20px" data-i18n="profile.pinPromptDesc">Для доступу до додатку введіть ваш PIN</p>
      <input type="password" id="pinInput" placeholder="••••" inputmode="numeric" maxlength="6" autocomplete="off"
        style="width:120px;text-align:center;font-size:24px;letter-spacing:8px;padding:12px;border:1px solid #334155;border-radius:10px;background:#0f172a;color:#f1f5f9;outline:none;margin:0 auto;display:block">
      <p id="pinPromptError" style="color:#f87171;font-size:13px;margin-top:8px;display:none"></p>
      <button onclick="verifyPin()" style="margin-top:16px;width:100%;padding:14px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer" data-i18n="profile.pinPromptBtn">Увійти</button>
    </div>
  `;
  document.body.appendChild(overlay);
  applyTranslations();
  document.getElementById('pinInput').focus();
  document.getElementById('pinInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyPin();
  });
}

async function verifyPin() {
  const input = document.getElementById('pinInput').value.trim();
  const inputHash = await hashPin(input);
  // Support both hashed and legacy plain-text PINs
  if (inputHash === userProfile.pin || input === userProfile.pin) {
    // Migrate plain-text PIN to hash on successful verify
    if (input === userProfile.pin && userProfile.pin.length <= 6) {
      userProfile.pin = inputHash;
      saveProfileToFirestore();
    }
    pinVerified = true;
    lastActivityTime = Date.now();
    sessionStorage.setItem('pinVerifiedAt', String(Date.now()));
    const overlay = document.getElementById('pinOverlay');
    if (overlay) overlay.remove();
  } else {
    const err = document.getElementById('pinPromptError');
    err.textContent = t('profile.pinWrong') || 'Невірний PIN-код';
    err.style.display = 'block';
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput').focus();
  }
}

// ================================================================
// ==================== DREAMS ====================================

let dreamItems = [];
let _editingDreamId = null;
let dreamsPieInstance = null;

// ---- Dream icons ----
const DREAM_ICONS = [
  '🎯', '🏠', '🏡', '🚗', '✈️', '🏖️',
  '📱', '💻', '📷', '🎮', '🚴', '🏍️',
  '🎓', '💍', '👶', '💼', '💰', '📚',
  '🎸', '🛋️', '🎁', '🐶', '⛰️', '🛥️',
];
const DEFAULT_DREAM_ICON = '🎯';

function dreamIconOf(d) { return (d && d.icon) || DEFAULT_DREAM_ICON; }

function renderDreamIconPicker() {
  const container = document.getElementById('dreamIconPicker');
  if (!container) return;
  const current = document.getElementById('dreamIcon').value || DEFAULT_DREAM_ICON;
  container.innerHTML = DREAM_ICONS.map(icon =>
    `<button type="button" class="dream-icon-btn${icon === current ? ' active' : ''}" data-icon="${icon}" onclick="selectDreamIcon('${icon}')">${icon}</button>`
  ).join('');
}

function selectDreamIcon(icon) {
  document.getElementById('dreamIcon').value = icon;
  document.querySelectorAll('#dreamIconPicker .dream-icon-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.icon === icon);
  });
}

// ---- Dream currency helpers ----
const DREAM_CUR_LABEL = { UAH: 'грн', USD: '$', EUR: '€' };
function dreamCurOf(d) { return (d && d.currency) || 'UAH'; }

// Sum of recorded deposit amounts in the dream's currency.
function _depositsSum(d) {
  return (d && d.deposits || []).reduce((s, dep) => s + (Number(dep.amount) || 0), 0);
}

// Pull d.saved up to at least sum(deposits) — handles the case where a sync
// race or stale read drifted the running total below the authoritative deposit
// history. Idempotent and safe to call before any mutation that adjusts saved
// by a delta (so the delta is applied to a consistent base).
function _reconcileDreamSaved(d) {
  if (!d) return;
  const sum = _depositsSum(d);
  const cur = Number(d.saved) || 0;
  if (cur < sum) d.saved = sum;
}

// Effective accumulated amount on a dream — explicit deposits[] PLUS the
// current value of any savings records linked to it (savingItems with
// dreamId), converted to the dream's own currency. This way editing or
// adding an earmarked saving immediately moves the dream's progress.
function _effectiveDreamSaved(d) {
  // d.saved is the running total maintained in addDreamDeposit (initial offset
  // + sum of deposits). The deposit history is append-only and authoritative;
  // if a Firestore sync race or stale read leaves d.saved below the deposit
  // sum, trust the history instead — otherwise newly added deposits would
  // visibly disappear from "Накопичено".
  const base = Math.max(Number(d.saved) || 0, _depositsSum(d));
  if (typeof savingItems === 'undefined' || !Array.isArray(savingItems)) return base;
  const dc = (dreamCurOf(d) || 'UAH').toUpperCase();
  const rates = (typeof cachedRates !== 'undefined') ? cachedRates : null;
  let extra = 0;
  for (const s of savingItems) {
    if (String(s.dreamId) !== String(d.id)) continue;
    if (typeof isExcluded === 'function' && isExcluded(s)) continue;
    const sc = (s.currency || 'UAH').toUpperCase();
    const amt = s.amount || 0;
    if (!amt) continue;
    if (sc === dc) { extra += amt; continue; }
    // Convert via UAH bridge.
    let inUah = 0;
    if (sc === 'UAH') inUah = amt;
    else if (rates && rates[sc]) inUah = amt * rates[sc];
    else continue;
    let inDream = 0;
    if (dc === 'UAH') inDream = inUah;
    else if (rates && rates[dc]) inDream = inUah / rates[dc];
    else continue;
    extra += inDream;
  }
  return base + extra;
}
function dreamCurUnitLabel(cc) { return DREAM_CUR_LABEL[cc] || cc; }
function dreamToUah(amount, cc) {
  if (!cc || cc === 'UAH') return amount;
  if (!cachedRates || !cachedRates[cc]) return null;
  return amount * cachedRates[cc];
}
function dreamUsdEquiv(amount, cc) {
  if (!cc || cc === 'UAH' || cc === 'USD') return null;
  if (!cachedRates || !cachedRates.USD || !cachedRates[cc]) return null;
  return amount * cachedRates[cc] / cachedRates.USD;
}
const CROSS_RATE_HINT = 'Орієнтовно. Крос-курс через гривню за даними НБУ';
function fmtDreamAmount(amount, cc) {
  const amt = amount || 0;
  if (!cc || cc === 'UAH') return formatNum(amt) + ' грн';
  const prefix = cc === 'USD' ? '$' : (cc === 'EUR' ? '€' : '');
  let str = (prefix ? prefix + formatNum(amt) : formatNum(amt) + ' ' + cc);
  const eq = dreamUsdEquiv(amt, cc);
  if (eq !== null) str += ' <span class="dream-equiv cross-hint" data-hint="' + CROSS_RATE_HINT + '" title="' + CROSS_RATE_HINT + '">≈ $' + formatNum(eq) + ' <span class="cross-rate-info">ⓘ</span></span>';
  return str;
}
async function ensureRates() {
  if (cachedRates && Date.now() - ratesCacheTime < 3600000) return cachedRates;
  try {
    const res = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
    const data = await res.json();
    cachedRatesArray = data;
    cachedRates = {};
    data.forEach(r => { cachedRates[r.cc] = r.rate; });
    cachedRates._date = data[0]?.exchangedate || '';
    ratesCacheTime = Date.now();
  } catch(e) { console.warn('Rates fetch failed:', e); }
  return cachedRates;
}
function onDreamCurrencyChange() {
  const sel = document.getElementById('dreamCurrency');
  if (!sel) return;
  const cc = sel.value || 'UAH';
  const label = cc === 'UAH' ? '(грн)' : '(' + dreamCurUnitLabel(cc) + ')';
  ['dreamTargetCurLabel', 'dreamSavedCurLabel', 'dreamMonthlyCurLabel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

function updateDreamsUI() {
  const auth = document.getElementById('dreamsAuth');
  const content = document.getElementById('dreamsContent');
  // Don't show auth prompt until Firebase has determined auth state
  if (typeof currentUser === 'undefined') return;
  if (currentUser) {
    auth.style.display = 'none';
    content.style.display = 'block';
    renderDreams();
    // Load rates in background so USD equivalents appear after first paint
    ensureRates().then(r => { if (r) renderDreams(); });
  } else {
    auth.style.display = 'block';
    content.style.display = 'none';
  }
}

let dreamMonthlyManual = false;

function calcDreamMonthly() {
  if (dreamMonthlyManual) return;
  const target = parseNum(document.getElementById('dreamTarget').value) || 0;
  const saved = parseNum(document.getElementById('dreamSaved').value) || 0;
  const dateEnd = document.getElementById('dreamDateEnd').value;
  if (target <= 0 || !dateEnd) return;
  const remaining = target - saved;
  if (remaining <= 0) { document.getElementById('dreamMonthly').value = '0'; return; }
  const now = new Date();
  const end = new Date(dateEnd);
  const months = Math.max(1, Math.ceil((end - now) / (30.44 * 86400000)));
  document.getElementById('dreamMonthly').value = formatShort(Math.ceil(remaining / months));
}

// Auto-calc when target, saved or dateEnd changes
['dreamTarget', 'dreamSaved'].forEach(id => {
  document.getElementById(id).addEventListener('input', calcDreamMonthly);
});
document.getElementById('dreamDateEnd').addEventListener('change', calcDreamMonthly);
// Mark manual if user edits monthly
document.getElementById('dreamMonthly').addEventListener('input', () => { dreamMonthlyManual = true; });

async function toggleDreamForm(forceOpen) {
  const card = document.getElementById('dreamFormCard');
  const btn = document.getElementById('btnToggleDreamForm');
  const isHidden = card.style.display === 'none';
  const shouldOpen = forceOpen !== undefined ? forceOpen : isHidden;

  if (!shouldOpen && typeof FormDrafts !== 'undefined' && FormDrafts.isDirty('dream.form')) {
    if (!await FormDrafts.confirmDiscard('dream.form', 'У формі мрії є незбережені зміни. Закрити без збереження?', { okText: 'Закрити', cancelText: 'Залишитись' })) {
      return;
    }
  }

  if (shouldOpen) {
    card.style.display = 'block';
    btn.textContent = '− Скасувати';
    btn.classList.remove('btn-save');
    btn.classList.add('btn-export');
    dreamMonthlyManual = false;
    if (!document.getElementById('dreamDateStart').value) {
      document.getElementById('dreamDateStart').value = new Date().toISOString().split('T')[0];
    }
    if (typeof FormDrafts !== 'undefined' && FormDrafts.hasDraft('dream.form') && !FormDrafts.isDirty('dream.form')) {
      if (await uiConfirm('Знайдено незбережену чернетку мрії. Відновити?', { okText: 'Відновити' })) {
        FormDrafts.restore('dream.form');
      } else {
        FormDrafts.clear('dream.form');
      }
    }
    onDreamCurrencyChange();
    renderDreamIconPicker();
  } else {
    card.style.display = 'none';
    btn.textContent = '+ Нова мрія';
    btn.classList.remove('btn-export');
    btn.classList.add('btn-save');
    const addBtn = document.getElementById('btnAddDream');
    addBtn.textContent = 'Додати мрію';
    addBtn.classList.remove('btn-export');
    addBtn.classList.add('btn-save');
    _editingDreamId = null;
  }
}

function addDream() {
  const name = document.getElementById('dreamName').value.trim();
  const target = parseNum(document.getElementById('dreamTarget').value);
  const saved = parseNum(document.getElementById('dreamSaved').value) || 0;
  const monthly = parseNum(document.getElementById('dreamMonthly').value) || 0;
  const dateStart = document.getElementById('dreamDateStart').value;
  const dateEnd = document.getElementById('dreamDateEnd').value;
  const notes = document.getElementById('dreamNotes').value.trim();
  const currency = (document.getElementById('dreamCurrency').value || 'UAH').toUpperCase();
  const icon = document.getElementById('dreamIcon').value || DEFAULT_DREAM_ICON;

  if (!name || isNaN(target) || target <= 0) {
    const err = document.getElementById('dreamError');
    err.textContent = 'Вкажіть назву та бажану суму';
    err.style.display = 'block';
    return;
  }
  document.getElementById('dreamError').style.display = 'none';

  const payload = { name, target, saved, monthly, dateStart, dateEnd, notes, currency, icon };

  if (_editingDreamId !== null) {
    const idx = dreamItems.findIndex(d => String(d.id) === String(_editingDreamId));
    if (idx !== -1) {
      dreamItems[idx] = { ...dreamItems[idx], ...payload };
    }
    _editingDreamId = null;
  } else {
    dreamItems.push({ id: Date.now(), ...payload, createdAt: new Date().toISOString() });
  }

  renderDreams();
  saveDreamsToFirestore();

  // Clear form
  document.getElementById('dreamName').value = '';
  document.getElementById('dreamTarget').value = '';
  document.getElementById('dreamSaved').value = '';
  document.getElementById('dreamMonthly').value = '';
  document.getElementById('dreamNotes').value = '';
  document.getElementById('dreamCurrency').value = 'UAH';
  document.getElementById('dreamIcon').value = DEFAULT_DREAM_ICON;
  onDreamCurrencyChange();
  renderDreamIconPicker();
  if (typeof FormDrafts !== 'undefined') FormDrafts.clear('dream.form');
  toggleDreamForm(false);

  const msg = document.getElementById('dreamSuccess');
  msg.textContent = '✓ Мрію додано!';
  msg.style.display = 'block';
  msg.style.animation = 'none';
  msg.offsetHeight;
  msg.style.animation = 'fadeOut 3s forwards';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

function deleteDream(id) {
  dreamItems = dreamItems.filter(d => String(d.id) !== String(id));
  // Unlink any savings that were earmarked for this dream — they become "вільні"
  // (don't delete the savings themselves, the money still exists).
  if (typeof savingItems !== 'undefined' && Array.isArray(savingItems)) {
    let anyUnlinked = false;
    savingItems.forEach(s => {
      if (String(s.dreamId) === String(id)) { s.dreamId = null; anyUnlinked = true; }
    });
    if (anyUnlinked && typeof saveSavingsToFirestore === 'function') saveSavingsToFirestore();
  }
  renderDreams();
  saveDreamsToFirestore();
}

function showDreamDeposit(id) {
  const el = document.getElementById('dreamDeposit-' + id);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  if (el.style.display === 'block') {
    const input = document.getElementById('dreamDepositAmount-' + id);
    input.value = '';
    input.focus();
    input.addEventListener('input', () => formatInput(input), { once: false });
  }
}

// Inline edit of a deposit row in the deposits history table.
function editDreamDeposit(dreamId, idx) {
  const d = dreamItems.find(x => String(x.id) === String(dreamId));
  if (!d || !d.deposits || !d.deposits[idx]) return;
  const dep = d.deposits[idx];
  const cc = dreamCurOf(d);
  const row = document.getElementById('depRow-' + dreamId + '-' + idx);
  if (!row) return;
  const dateVal = dep.date ? new Date(dep.date).toISOString().split('T')[0] : '';
  const showCc = dep.originalCurrency || cc;
  const showAmount = dep.originalCurrency ? dep.originalAmount : dep.amount;
  const opt = (v, label) => '<option value="' + v + '"' + (v === showCc ? ' selected' : '') + '>' + label + '</option>';
  row.innerHTML = sanitize(
    '<td colspan="3">' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
    '<input type="date" id="depEditDate-' + dreamId + '-' + idx + '" value="' + dateVal + '" style="padding:6px;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#f1f5f9;font-size:13px">' +
    '<select id="depEditCur-' + dreamId + '-' + idx + '" style="padding:6px;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#f1f5f9;font-size:13px">' +
      opt('UAH', 'UAH (₴)') + opt('USD', 'USD ($)') + opt('EUR', 'EUR (€)') +
    '</select>' +
    '<input type="text" id="depEditAmount-' + dreamId + '-' + idx + '" value="' + formatShort(showAmount) + '" inputmode="decimal" style="flex:1;min-width:80px;padding:6px 8px;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#f1f5f9;font-size:13px">' +
    '<button class="btn-save" onclick="saveDreamDepositEdit(\'' + dreamId + '\',' + idx + ')" style="width:auto;padding:6px 10px;margin:0;font-size:13px">✓</button>' +
    '<button class="btn-clear" onclick="openDreamDetail(\'' + dreamId + '\')" style="width:auto;padding:6px 10px;margin:0;font-size:13px">✕</button>' +
    '</div>' +
    '</td>'
  );
  const amtInput = document.getElementById('depEditAmount-' + dreamId + '-' + idx);
  if (amtInput) amtInput.addEventListener('input', () => formatInput(amtInput));
}

function saveDreamDepositEdit(dreamId, idx) {
  const d = dreamItems.find(x => String(x.id) === String(dreamId));
  if (!d || !d.deposits || !d.deposits[idx]) return;
  const dep = d.deposits[idx];
  const cc = dreamCurOf(d);
  const newDate = document.getElementById('depEditDate-' + dreamId + '-' + idx).value;
  const newCc = document.getElementById('depEditCur-' + dreamId + '-' + idx).value || cc;
  const rawAmount = parseNum(document.getElementById('depEditAmount-' + dreamId + '-' + idx).value);
  if (isNaN(rawAmount) || rawAmount <= 0) { alert('Некоректна сума'); return; }
  if (!newDate) { alert('Вкажіть дату'); return; }

  // Convert to dream's currency if needed.
  let convertedAmount = rawAmount;
  if (newCc !== cc) {
    if (!cachedRates) { alert('Курси валют ще завантажуються, спробуйте за кілька секунд.'); return; }
    const toUah = newCc === 'UAH' ? rawAmount : (cachedRates[newCc] ? rawAmount * cachedRates[newCc] : null);
    if (toUah === null) { alert('Немає курсу для ' + newCc); return; }
    const fromUahRate = cc === 'UAH' ? 1 : cachedRates[cc];
    if (!fromUahRate) { alert('Немає курсу для ' + cc); return; }
    convertedAmount = toUah / fromUahRate;
  }

  // Reconcile against the deposit history before applying the delta — if
  // d.saved drifted (e.g. a Firestore race), we want the delta to land on a
  // consistent base.
  _reconcileDreamSaved(d);
  d.saved = Math.max(0, (d.saved || 0) - dep.amount + convertedAmount);
  d.deposits[idx] = {
    amount: convertedAmount,
    date: new Date(newDate).toISOString(),
    ...(newCc !== cc ? { originalAmount: rawAmount, originalCurrency: newCc } : {}),
  };

  renderDreams();
  saveDreamsToFirestore();
  openDreamDetail(dreamId);
}

async function deleteDreamDeposit(dreamId, idx) {
  const d = dreamItems.find(x => String(x.id) === String(dreamId));
  if (!d || !d.deposits || !d.deposits[idx]) return;
  if (!await uiConfirm('Видалити цей внесок?', { danger: true, okText: 'Видалити' })) return;
  const dep = d.deposits[idx];
  _reconcileDreamSaved(d);
  d.saved = Math.max(0, (d.saved || 0) - (dep.amount || 0));
  d.deposits.splice(idx, 1);
  renderDreams();
  saveDreamsToFirestore();
  openDreamDetail(dreamId);
}

function addDreamDeposit(id) {
  const input = document.getElementById('dreamDepositAmount-' + id);
  const rawAmount = parseNum(input.value);
  if (isNaN(rawAmount) || rawAmount <= 0) return;

  const item = dreamItems.find(d => String(d.id) === String(id));
  if (!item) return;

  const dreamCc = dreamCurOf(item);
  const sel = document.getElementById('dreamDepositCurrency-' + id);
  const depositCc = sel ? (sel.value || dreamCc) : dreamCc;

  // Convert deposit amount to the dream's currency using NBU rates.
  let convertedAmount = rawAmount;
  if (depositCc !== dreamCc) {
    if (!cachedRates) {
      alert('Курси валют ще завантажуються, спробуйте за кілька секунд.');
      return;
    }
    const toUah = depositCc === 'UAH' ? rawAmount : (cachedRates[depositCc] ? rawAmount * cachedRates[depositCc] : null);
    if (toUah === null) { alert('Немає курсу для ' + depositCc); return; }
    const fromUahRate = dreamCc === 'UAH' ? 1 : cachedRates[dreamCc];
    if (!fromUahRate) { alert('Немає курсу для ' + dreamCc); return; }
    convertedAmount = toUah / fromUahRate;
  }

  // Reconcile drifted running total against the deposit history before adding
  // the new amount, so the final d.saved stays in sync with deposits[].
  _reconcileDreamSaved(item);
  item.saved = (item.saved || 0) + convertedAmount;

  // Save deposit history — keep both the dream-currency amount (for aggregation)
  // and the original amount + currency (for the "відкладено в євро" label).
  if (!item.deposits) item.deposits = [];
  const entry = { amount: convertedAmount, date: new Date().toISOString() };
  if (depositCc !== dreamCc) {
    entry.originalAmount = rawAmount;
    entry.originalCurrency = depositCc;
  }
  item.deposits.push(entry);

  renderDreams();
  saveDreamsToFirestore();
}

let dreamDetailChartInstance = null;

function openDreamDetail(id) {
  const d = dreamItems.find(x => String(x.id) === String(id));
  if (!d) return;

  const now = new Date();
  const cc = dreamCurOf(d);
  const saved = _effectiveDreamSaved(d);
  const progress = d.target > 0 ? Math.min(100, (saved / d.target) * 100) : 0;
  const remaining = Math.max(0, d.target - saved);
  const netMonthly = d.monthly || 0;
  const monthsLeft = netMonthly > 0 && remaining > 0 ? Math.ceil(remaining / netMonthly) : null;

  let deadlineInfo = '';
  if (d.dateEnd) {
    const end = new Date(d.dateEnd);
    const daysLeft = Math.ceil((end - now) / 86400000);
    if (daysLeft <= 0) deadlineInfo = 'Термін минув';
    else deadlineInfo = daysLeft + ' дн. (' + Math.ceil(daysLeft / 30) + ' міс.)';
  }

  // Deposits history with per-row edit/delete controls
  let depositsHtml = '';
  if (d.deposits && d.deposits.length) {
    depositsHtml = '<div class="a-card"><h3>Історія внесків</h3>' +
      '<div style="max-height:360px;overflow-y:auto"><table class="credit-schedule-table"><thead><tr>' +
      '<th style="text-align:left">Дата</th><th>Сума</th><th style="width:80px"></th></tr></thead><tbody>' +
      d.deposits.map((dep, idx) => {
        const mainAmount = fmtDreamAmount(dep.amount, cc);
        const origLabel = dep.originalCurrency && dep.originalCurrency !== cc
          ? ' <span style="color:#94a3b8;font-size:11px;font-weight:400">(внесено ' + (dep.originalCurrency === 'UAH' ? formatNum(dep.originalAmount) + ' грн' : (dep.originalCurrency === 'USD' ? '$' : dep.originalCurrency === 'EUR' ? '€' : dep.originalCurrency + ' ') + formatNum(dep.originalAmount)) + ')</span>'
          : '';
        return '<tr id="depRow-' + d.id + '-' + idx + '">' +
          '<td>' + new Date(dep.date).toLocaleDateString('uk-UA') + '</td>' +
          '<td style="color:#4ade80">+' + mainAmount + origLabel + '</td>' +
          '<td style="text-align:right;white-space:nowrap">' +
            '<button class="btn-delete" onclick="editDreamDeposit(\'' + d.id + '\',' + idx + ')" style="color:#60a5fa;padding:2px 6px;font-size:13px">✎</button>' +
            '<button class="btn-delete" onclick="deleteDreamDeposit(\'' + d.id + '\',' + idx + ')" style="padding:2px 6px;font-size:13px">✕</button>' +
          '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }

  document.getElementById('dreamsContent').style.display = 'none';
  document.getElementById('dreamsDashboard').style.display = 'none';
  const detail = document.getElementById('dreamDetail');
  detail.style.display = 'block';

  detail.querySelector('#dreamDetailContent').innerHTML = sanitize(`
    <div class="dash-hero">
      <div class="dash-hero-label"><span class="dream-icon-hero">${dreamIconOf(d)}</span>${esc(d.name)}</div>
      <div class="dash-hero-value">${progress.toFixed(0)}%</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:4px">${fmtDreamAmount(saved, cc)} з ${fmtDreamAmount(d.target, cc)}</div>
      <div class="detail-progress" style="margin-top:10px;width:100%"><div class="detail-progress-bar" style="width:${progress.toFixed(1)}%"></div></div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;flex-wrap:wrap">
        <button class="btn-save" onclick="depositDreamFromDetail('${d.id}')" style="width:auto;padding:8px 16px;margin:0">+ Внести кошти</button>
        <button class="btn-export" onclick="editDreamFromDetail('${d.id}')" style="width:auto;padding:8px 16px;margin:0">✎ Редагувати</button>
        <button class="btn-clear" onclick="confirmThen('Видалити мрію?', () => { deleteDream('${d.id}'); closeDreamDetail(); }, { danger: true, okText: 'Видалити' })" style="width:auto;padding:8px 16px;margin:0">✕ Видалити</button>
      </div>
    </div>

    <div style="position:relative;height:220px;margin:12px auto;max-width:280px">
      <canvas id="dreamDetailPie"></canvas>
    </div>

    <div class="detail-grid">
      <div class="detail-metric">
        <div class="detail-metric-label">Накопичено</div>
        <div class="detail-metric-value green">${fmtDreamAmount(saved, cc)}</div>
      </div>
      <div class="detail-metric">
        <div class="detail-metric-label">Залишилось</div>
        <div class="detail-metric-value" style="color:#f87171">${fmtDreamAmount(remaining, cc)}</div>
      </div>
      ${d.monthly ? '<div class="detail-metric"><div class="detail-metric-label">Внесок / міс</div><div class="detail-metric-value">' + fmtDreamAmount(d.monthly, cc) + '</div></div>' : ''}
      ${monthsLeft ? '<div class="detail-metric"><div class="detail-metric-label">До цілі</div><div class="detail-metric-value">≈ ' + monthsLeft + ' міс.</div></div>' : ''}
    </div>

    <div class="a-card">
      <h3>Деталі</h3>
      ${d.dateStart ? '<div class="detail-info-row"><span class="detail-info-label">Створено</span><span class="detail-info-value">' + formatDate(d.dateStart) + '</span></div>' : ''}
      ${d.dateEnd ? '<div class="detail-info-row"><span class="detail-info-label">Планую до</span><span class="detail-info-value">' + formatDate(d.dateEnd) + '</span></div>' : ''}
      ${deadlineInfo ? '<div class="detail-info-row"><span class="detail-info-label">Залишилось часу</span><span class="detail-info-value">' + deadlineInfo + '</span></div>' : ''}
      ${d.deposits ? '<div class="detail-info-row"><span class="detail-info-label">Внесків</span><span class="detail-info-value">' + d.deposits.length + '</span></div>' : ''}
      ${d.notes ? '<div class="detail-info-row"><span class="detail-info-label">Нотатки</span><span class="detail-info-value">' + esc(d.notes) + '</span></div>' : ''}
      ${(() => {
        if (typeof savingItems === 'undefined' || !savingItems.length) return '';
        const linked = savingItems.filter(s => String(s.dreamId) === String(d.id));
        if (!linked.length) return '';
        let uahSum = 0;
        linked.forEach(s => {
          const cc = (s.currency || 'UAH').toUpperCase();
          if (cc === 'UAH') uahSum += s.amount || 0;
          else if (typeof cachedRates !== 'undefined' && cachedRates && cachedRates[cc]) uahSum += (s.amount || 0) * cachedRates[cc];
        });
        return '<div class="detail-info-row"><span class="detail-info-label">Закріплено в заощадженнях</span><span class="detail-info-value" style="color:#93c5fd">' + linked.length + ' запис(и) · ' + formatNum(uahSum) + ' грн</span></div>';
      })()}
    </div>

    ${(() => {
      if (typeof savingItems === 'undefined' || !savingItems.length) return '';
      const linked = savingItems.filter(s => String(s.dreamId) === String(d.id));
      if (!linked.length) return '';
      const dc = (cc || 'UAH').toUpperCase();
      let totalInDream = 0;
      const rows = linked.map(s => {
        const sc = (s.currency || 'UAH').toUpperCase();
        const sym = sc === 'USD' ? '$' : sc === 'EUR' ? '€' : '';
        const native = sym ? (sym + formatNum(s.amount || 0)) : (formatNum(s.amount || 0) + ' грн');
        // Convert to dream currency for the right-hand cell.
        let inDream = 0;
        if (sc === dc) inDream = s.amount || 0;
        else {
          let inUah = 0;
          if (sc === 'UAH') inUah = s.amount || 0;
          else if (typeof cachedRates !== 'undefined' && cachedRates && cachedRates[sc]) inUah = (s.amount || 0) * cachedRates[sc];
          if (dc === 'UAH') inDream = inUah;
          else if (typeof cachedRates !== 'undefined' && cachedRates && cachedRates[dc]) inDream = inUah / cachedRates[dc];
        }
        totalInDream += inDream;
        const inDreamLabel = inDream > 0 ? fmtDreamAmount(inDream, dc) : '—';
        const conv = sc !== dc && inDream > 0
          ? ' <span style="color:#64748b;font-size:11px">≈ ' + inDreamLabel + '</span>'
          : '';
        const excludedNote = (typeof isExcluded === 'function' && isExcluded(s))
          ? ' <span style="color:#64748b;font-size:11px">(не враховується)</span>'
          : '';
        return '<tr>' +
          '<td>' + esc(s.name || '—') + excludedNote + '</td>' +
          '<td><span class="p-item-type p-type-cash">' + esc(sc) + '</span></td>' +
          '<td style="text-align:right;color:#93c5fd"><strong>' + native + '</strong>' + conv + '</td>' +
          '</tr>';
      }).join('');
      return '<div class="a-card"><h3>💰 Закріплено в заощадженнях</h3>' +
        '<table class="credit-schedule-table" style="width:100%"><thead><tr>' +
          '<th style="text-align:left">Назва</th><th>Валюта</th><th style="text-align:right">Сума</th>' +
        '</tr></thead><tbody>' + rows +
        '<tr style="font-weight:700;border-top:2px solid #334155"><td colspan="2">Всього у валюті мрії</td>' +
        '<td style="text-align:right;color:#4ade80"><strong>' + fmtDreamAmount(totalInDream, dc) + '</strong></td></tr>' +
        '</tbody></table></div>';
    })()}

    ${depositsHtml}

  `);

  // Pie chart on detail
  const pieCanvas = document.getElementById('dreamDetailPie');
  if (pieCanvas && typeof Chart !== 'undefined') {
    if (dreamDetailChartInstance) dreamDetailChartInstance.destroy();
    const _isLightT = document.documentElement.getAttribute('data-theme-effective') === 'light';
    dreamDetailChartInstance = new Chart(pieCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Накопичено', 'Залишилось'],
        datasets: [{
          data: [saved, remaining],
          backgroundColor: ['#4ade80', _isLightT ? '#cbd5e1' : '#334155'],
          borderColor: _isLightT ? '#ffffff' : '#0f172a',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => {
              const unit = cc === 'UAH' ? 'грн' : (cc === 'USD' ? '$' : cc === 'EUR' ? '€' : cc);
              const val = formatNum(ctx.raw);
              return ctx.label + ': ' + (cc === 'UAH' ? val + ' грн' : (unit === '$' || unit === '€' ? unit + val : val + ' ' + unit));
            } }
          }
        }
      }
    });
  }

  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function editDreamFromDetail(id) {
  // Close detail, show content, then edit
  document.getElementById('dreamDetail').style.display = 'none';
  document.getElementById('dreamsContent').style.display = 'block';
  if (dreamDetailChartInstance) { dreamDetailChartInstance.destroy(); dreamDetailChartInstance = null; }
  editDream(id);
}

function depositDreamFromDetail(id) {
  // Close detail, show content with list, then open deposit form
  document.getElementById('dreamDetail').style.display = 'none';
  document.getElementById('dreamsContent').style.display = 'block';
  if (dreamDetailChartInstance) { dreamDetailChartInstance.destroy(); dreamDetailChartInstance = null; }
  renderDreams();
  // Wait for DOM to update then show deposit
  setTimeout(() => showDreamDeposit(id), 50);
}

function closeDreamDetail() {
  document.getElementById('dreamDetail').style.display = 'none';
  document.getElementById('dreamsContent').style.display = 'block';
  if (dreamDetailChartInstance) { dreamDetailChartInstance.destroy(); dreamDetailChartInstance = null; }
  renderDreams();
}

function editDream(id) {
  const item = dreamItems.find(d => String(d.id) === String(id));
  if (!item) return;
  document.getElementById('dreamName').value = item.name || '';
  document.getElementById('dreamTarget').value = item.target ? formatShort(item.target) : '';
  document.getElementById('dreamSaved').value = item.saved ? formatShort(item.saved) : '';
  document.getElementById('dreamMonthly').value = item.monthly ? formatShort(item.monthly) : '';
  document.getElementById('dreamDateStart').value = item.dateStart || '';
  document.getElementById('dreamDateEnd').value = item.dateEnd || '';
  document.getElementById('dreamNotes').value = item.notes || '';
  document.getElementById('dreamCurrency').value = dreamCurOf(item);
  onDreamCurrencyChange();
  document.getElementById('dreamIcon').value = dreamIconOf(item);
  renderDreamIconPicker();

  _editingDreamId = id;

  const btn = document.getElementById('btnAddDream');
  btn.textContent = 'Зберегти зміни';
  btn.classList.remove('btn-save');
  btn.classList.add('btn-export');
  toggleDreamForm(true);
  if (typeof FormDrafts !== 'undefined') FormDrafts.setBaseline('dream.form');
}

function renderDreams() {
  const list = document.getElementById('dreamsList');
  const dashboard = document.getElementById('dreamsDashboard');

  if (dreamItems.length === 0) {
    list.innerHTML = '<div class="a-empty">Додайте свою першу фінансову мрію 🌟</div>';
    dashboard.style.display = 'none';
    return;
  }

  const now = new Date();
  let totalTargetUah = 0, totalSavedUah = 0;
  const pieLabels = [], pieData = [], pieColors = [];
  const colors = ['#3b82f6', '#4ade80', '#f59e0b', '#a855f7', '#f472b6', '#60a5fa', '#facc15', '#34d399'];

  list.innerHTML = sanitize(dreamItems.map((d, i) => {
    const target = d.target || 0;
    const saved = _effectiveDreamSaved(d);
    const cc = dreamCurOf(d);
    const progress = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
    const targetUah = dreamToUah(target, cc);
    const savedUah = dreamToUah(saved, cc);
    const include = !isExcluded(d);
    if (include && targetUah !== null) totalTargetUah += targetUah;
    if (include && savedUah !== null) totalSavedUah += savedUah;

    // Months to goal
    const netMonthly = d.monthly || 0;
    const remaining = target - saved;
    const monthsLeft = netMonthly > 0 ? Math.ceil(remaining / netMonthly) : null;
    const estimatedDate = monthsLeft ? new Date(now.getFullYear(), now.getMonth() + monthsLeft, 1) : null;

    // Deadline
    let deadlineInfo = '';
    if (d.dateEnd) {
      const end = new Date(d.dateEnd);
      const daysLeft = Math.ceil((end - now) / 86400000);
      if (daysLeft <= 0) deadlineInfo = '<span style="color:#f87171">Термін минув</span>';
      else if (daysLeft <= 30) deadlineInfo = '<span style="color:#facc15">' + daysLeft + ' дн. залишилось</span>';
      else deadlineInfo = Math.ceil(daysLeft / 30) + ' міс. залишилось';
    }

    if (include) {
      pieLabels.push(d.name);
      pieData.push(targetUah !== null ? targetUah : target);
      pieColors.push(colors[i % colors.length]);
    }

    const excludedCls = !include ? ' excluded-item' : '';
    return `<div class="p-item${excludedCls}" style="flex-wrap:wrap;cursor:pointer" onclick="if(!event.target.closest('.btn-delete')&&!event.target.closest('#dreamDeposit-${d.id}')&&!event.target.closest('input')&&!event.target.closest('.exclude-toggle'))openDreamDetail('${d.id}')">
      <div class="p-item-info" style="width:100%">
        <div class="p-item-name"><span class="dream-icon">${dreamIconOf(d)}</span>${esc(d.name)}${_exclusionCheckboxHtml('dream', d.id, !include)}</div>
        <div class="detail-progress" style="margin:8px 0"><div class="detail-progress-bar" style="width:${progress.toFixed(1)}%"></div></div>
        <div class="p-item-details">
          <span>${fmtDreamAmount(saved, cc)} з ${fmtDreamAmount(target, cc)} (${progress.toFixed(0)}%)</span>
          ${d.monthly ? '<span>Внесок: ' + fmtDreamAmount(d.monthly, cc) + '/міс</span>' : ''}
          ${monthsLeft ? '<span>≈ ' + monthsLeft + ' міс. до цілі</span>' : ''}
          ${deadlineInfo ? '<span>' + deadlineInfo + '</span>' : ''}
          ${d.deposits && d.deposits.length ? '<span>Внесків: ' + d.deposits.length + '</span>' : ''}
        </div>
        ${d.notes ? '<div class="p-item-notes">' + esc(d.notes) + '</div>' : ''}
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-delete" onclick="event.stopPropagation();showDreamDeposit('${d.id}')" style="color:#4ade80;font-size:16px" title="Внести кошти">+</button>
          <button class="btn-delete" onclick="event.stopPropagation();editDream('${d.id}')" style="color:#60a5fa">✎</button>
          <button class="btn-delete" onclick="event.stopPropagation();confirmThen('Видалити мрію?', () => deleteDream('${d.id}'), { danger: true, okText: 'Видалити' })">✕</button>
        </div>
      </div>
      <div id="dreamDeposit-${d.id}" style="display:none;width:100%;margin-top:8px;padding-top:8px;border-top:1px solid #1e293b">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="dreamDepositCurrency-${d.id}" data-dream-cc="${cc}" style="padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#f1f5f9;font-size:14px;outline:none">
            <option value="UAH"${cc === 'UAH' ? ' selected' : ''}>UAH (₴)</option>
            <option value="USD"${cc === 'USD' ? ' selected' : ''}>USD ($)</option>
            <option value="EUR"${cc === 'EUR' ? ' selected' : ''}>EUR (€)</option>
          </select>
          <input type="text" id="dreamDepositAmount-${d.id}" placeholder="Сума внеску" inputmode="decimal" style="flex:1;min-width:100px;padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#f1f5f9;font-size:14px;outline:none">
          <button class="btn-save" onclick="addDreamDeposit('${d.id}')" style="width:auto;padding:8px 16px;margin:0;white-space:nowrap">Внести</button>
          <button class="btn-clear" onclick="document.getElementById('dreamDeposit-${d.id}').style.display='none'" style="width:auto;padding:8px 12px;margin:0">✕</button>
        </div>
      </div>
    </div>`;
  }).join(''));

  // Dashboard — aggregate in UAH (mixed currencies can't sum directly)
  dashboard.style.display = 'block';
  const totalProgress = totalTargetUah > 0 ? (totalSavedUah / totalTargetUah * 100) : 0;
  document.getElementById('dreamsTotalProgress').textContent = totalProgress.toFixed(0) + '%';
  const usdRate = cachedRates && cachedRates.USD;
  document.getElementById('dreamsTotalSummary').innerHTML = sanitize(
    formatNum(totalSavedUah) + ' грн' + (usdRate ? '<span class="dream-equiv"> ≈ $' + formatNum(totalSavedUah / usdRate) + '</span>' : '') +
    ' з ' + formatNum(totalTargetUah) + ' грн' + (usdRate ? '<span class="dream-equiv"> ≈ $' + formatNum(totalTargetUah / usdRate) + '</span>' : '')
  );

  // Bar chart: saved vs remaining per dream — in UAH (for comparability)
  const canvas = document.getElementById('dreamsPieChart');
  if (canvas && typeof Chart !== 'undefined') {
    if (dreamsPieInstance) dreamsPieInstance.destroy();
    const isLight = document.documentElement.getAttribute('data-theme-effective') === 'light';
    const remainingColor = isLight ? '#cbd5e1' : '#334155';
    const savedColor = isLight ? '#22c55e' : '#4ade80';
    const legendColor = isLight ? '#334155' : '#94a3b8';
    const tickColorX = isLight ? '#64748b' : '#475569';
    const tickColorY = isLight ? '#1e293b' : '#e2e8f0';
    const gridColorX = isLight ? '#e2e8f0' : '#1e293b';
    const savedData = dreamItems.map(d => {
      const cc = dreamCurOf(d);
      const eff = _effectiveDreamSaved(d);
      const v = dreamToUah(eff, cc);
      return v !== null ? v : eff;
    });
    const remainData = dreamItems.map(d => {
      const cc = dreamCurOf(d);
      const rem = Math.max(0, (d.target || 0) - _effectiveDreamSaved(d));
      const v = dreamToUah(rem, cc);
      return v !== null ? v : rem;
    });
    dreamsPieInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: pieLabels,
        datasets: [
          { label: 'Накопичено', data: savedData, backgroundColor: savedColor, borderRadius: 4 },
          { label: 'Залишилось', data: remainData, backgroundColor: remainingColor, borderRadius: 4 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: legendColor, font: { size: 12 }, padding: 16 } },
          tooltip: { callbacks: { label: ctx => {
            const d = dreamItems[ctx.dataIndex];
            const cc = dreamCurOf(d);
            const eff = _effectiveDreamSaved(d);
            const nativeVal = ctx.dataset.label === 'Накопичено'
              ? eff
              : Math.max(0, (d.target || 0) - eff);
            let lbl = ctx.dataset.label + ': ' + formatNum(ctx.raw) + ' грн';
            if (cc !== 'UAH') lbl += ' (' + (cc === 'USD' ? '$' : cc === 'EUR' ? '€' : cc + ' ') + formatNum(nativeVal) + ')';
            return lbl;
          } } }
        },
        scales: {
          x: { stacked: true, ticks: { color: tickColorX, font: { size: 10 }, callback: v => formatShort(v) }, grid: { color: gridColorX } },
          y: { stacked: true, ticks: { color: tickColorY, font: { size: 12 } }, grid: { display: false } }
        }
      }
    });
  }
}

// Ре-рендеримо dreams chart при зміні теми, щоб backgroundColor + ticks/grid оновилися
window.addEventListener('themechange', () => {
  if (typeof dreamItems !== 'undefined' && dreamItems && dreamItems.length > 0) {
    const dreamsTab = document.getElementById('tabDreams');
    // re-render тільки якщо юзер на вкладці Мрії (щоб не чіпати приховану)
    if (dreamsTab && dreamsTab.classList.contains('active')) {
      try { renderDreams(); } catch(e) {}
    } else {
      // якщо вкладка прихована — просто знищимо поточний чарт, наступне відкриття перерендерить
      try { if (typeof dreamsPieInstance !== 'undefined' && dreamsPieInstance) { dreamsPieInstance.destroy(); dreamsPieInstance = null; } } catch(e) {}
    }
  }
});

// Once the initial Firestore load completes, this is set true.
// Saves done *before* the load are write-only (never delete remote docs),
// so dreams added locally before load + remote dreams both survive.
let dreamsLoaded = false;

async function saveDreamsToFirestore() {
  if (!firebaseReady || !currentUser) {
    console.warn('Dreams save skipped: no auth');
    return;
  }
  try {
    const uid = effectiveUid(currentUser.uid);
    const ref = db.collection('users').doc(uid).collection('dreams');
    const localIds = new Set(dreamItems.map(d => String(d.id)));
    const ops = [];

    // Only delete remote docs when we've confirmed the load succeeded.
    // Otherwise a premature save (while load is in flight) would wipe remote data.
    if (dreamsLoaded) {
      const existing = await ref.get();
      existing.forEach(doc => {
        if (!localIds.has(doc.id)) ops.push(doc.ref.delete());
      });
    }
    const clean = (typeof stripUndefined === 'function') ? stripUndefined : (x => x);
    dreamItems.forEach(d => ops.push(ref.doc(String(d.id)).set(clean(d))));
    if (ops.length) await Promise.all(ops);
    console.log('Dreams saved:', dreamItems.length, dreamsLoaded ? '(sync)' : '(write-only)');
  } catch(e) {
    console.error('Dreams save failed:', e.code, e.message);
  }
}

async function loadDreamsFromFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('dreams');
    const snapshot = await ref.get();
    const remote = [];
    snapshot.forEach(doc => remote.push(doc.data()));
    // Merge: if user added items locally while load was in flight, keep them.
    const remoteIds = new Set(remote.map(d => String(d.id)));
    const localOnly = dreamItems.filter(d => !remoteIds.has(String(d.id)));
    dreamItems = [...remote, ...localOnly];
    dreamsLoaded = true;
    renderDreams();
    // Persist any local-only additions that predated the load.
    if (localOnly.length) saveDreamsToFirestore();
  } catch(e) { console.warn('Dreams load failed:', e); }
}

// ==================== UPDATES (changelog feed) ===================
// ================================================================
// Admin-published release notes from the `changelog` Firestore collection.
// Anyone can read (open rule); the app tracks the latest entry's timestamp
// the user has seen in localStorage and shows a red badge on the tab for
// every newer entry.

let changelogEntries = [];
let _changelogLoadedOnce = false;

function _updatesLastSeen() {
  const v = parseInt(localStorage.getItem('updatesLastSeen') || '0', 10);
  return isNaN(v) ? 0 : v;
}
function _markUpdatesSeen() {
  const latest = changelogEntries.length ? new Date(changelogEntries[0].createdAt).getTime() : Date.now();
  localStorage.setItem('updatesLastSeen', String(latest));
  refreshUpdatesBadge();
}

function refreshUpdatesBadge() {
  const badge = document.getElementById('updatesBadge');
  if (!badge) return;
  const since = _updatesLastSeen();
  const unseen = changelogEntries.filter(e => new Date(e.createdAt).getTime() > since).length;
  if (unseen > 0) {
    badge.textContent = unseen > 9 ? '9+' : String(unseen);
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
    badge.textContent = '';
  }
}

async function loadChangelog(force) {
  if (_changelogLoadedOnce && !force) return;
  const seed = Array.isArray(window.CHANGELOG_SEED) ? window.CHANGELOG_SEED : [];
  const auto = Array.isArray(window.BUILT_IN_CHANGELOG) ? window.BUILT_IN_CHANGELOG : [];
  const merged = new Map();
  // Order matters: seed first, then auto (commits), then Firestore overrides both.
  [...seed, ...auto].forEach(e => { if (e && e.id) merged.set(String(e.id), e); });
  if (firebaseReady && db) {
    try {
      const snapshot = await db.collection('changelog').orderBy('createdAt', 'desc').limit(50).get();
      snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        merged.set(String(doc.id), data);
      });
    } catch(e) { console.warn('Changelog load failed:', e); }
  }
  changelogEntries = Array.from(merged.values())
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 50);
  _changelogLoadedOnce = true;
  renderUpdates();
  refreshUpdatesBadge();
}

function renderUpdates() {
  const list = document.getElementById('updatesList');
  if (!list) return;
  if (!changelogEntries.length) {
    list.innerHTML = '<div class="a-empty">Поки немає оновлень. Заходьте пізніше 🌱</div>';
    const last = document.getElementById('updatesLastViewed');
    if (last) last.textContent = '';
    return;
  }
  const sinceTs = _updatesLastSeen();
  list.innerHTML = sanitize(changelogEntries.map(e => {
    const ts = e.createdAt ? new Date(e.createdAt).getTime() : 0;
    const isNew = ts > sinceTs;
    const dateStr = e.createdAt ? new Date(e.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
    return `<div class="update-card${isNew ? ' is-new' : ''}">
      <div class="update-card-header">
        <div class="update-card-title">${isNew ? '<span class="update-new-tag">нове</span>' : ''}${esc(e.title || '')}</div>
        <div class="update-card-meta">${esc(dateStr)}</div>
      </div>
      <div class="update-card-body">${esc(e.body || '')}</div>
    </div>`;
  }).join(''));

  const last = document.getElementById('updatesLastViewed');
  if (last) {
    const latest = changelogEntries[0].createdAt ? new Date(changelogEntries[0].createdAt) : null;
    last.textContent = latest ? 'Останнє оновлення: ' + latest.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  }
}

function updateUpdatesUI() {
  loadChangelog().then(() => {
    renderUpdates();
    // Mark everything as seen after render so the badge clears.
    _markUpdatesSeen();
  });
}

// ==================== SAVINGS ====================================
// ================================================================
// Idle money that isn't invested and doesn't earn a return — cash stashes,
// safe deposit boxes, just-sitting-there money. Separate from the portfolio
// because its nature is different: no dates, no rate, no maturity.

let savingItems = [];
let savingsLoaded = false;
let _editingSavingId = null;

function updateSavingsUI() {
  const auth = document.getElementById('savingsAuth');
  const content = document.getElementById('savingsContent');
  if (typeof currentUser === 'undefined') return;
  if (currentUser) {
    auth.style.display = 'none';
    content.style.display = 'block';
    renderSavings();
    ensureRates().then(r => { if (r) renderSavings(); });
  } else {
    auth.style.display = 'block';
    content.style.display = 'none';
  }
}

function onSavingCurrencyChange() {
  const sel = document.getElementById('savingCurrency');
  if (!sel) return;
  const cc = sel.value || 'UAH';
  const label = document.getElementById('savingAmountCurLabel');
  if (label) label.textContent = cc === 'UAH' ? '(грн)' : (cc === 'USD' ? '($)' : cc === 'EUR' ? '(€)' : '(' + cc + ')');
}

// Populate the "закріплено за мрією" dropdown with current dreams.
function _populateSavingDreamSelect(currentValue) {
  const sel = document.getElementById('savingDreamId');
  if (!sel) return;
  const dreams = (typeof dreamItems !== 'undefined' && Array.isArray(dreamItems)) ? dreamItems : [];
  const opts = ['<option value="">— Вільні (не закріплені)</option>'].concat(
    dreams.map(d => '<option value="' + esc(String(d.id)) + '">' + (d.icon || '🎯') + ' ' + esc(d.name) + '</option>')
  );
  sel.innerHTML = opts.join('');
  if (currentValue != null) sel.value = String(currentValue);
}

async function toggleSavingsForm(forceOpen) {
  const card = document.getElementById('savingsFormCard');
  const btn = document.getElementById('btnToggleSavingsForm');
  const isHidden = card.style.display === 'none';
  const shouldOpen = forceOpen !== undefined ? forceOpen : isHidden;

  if (!shouldOpen && typeof FormDrafts !== 'undefined' && FormDrafts.isDirty('saving.form')) {
    if (!await FormDrafts.confirmDiscard('saving.form', 'У формі заощадження є незбережені зміни. Закрити без збереження?', { okText: 'Закрити', cancelText: 'Залишитись' })) return;
  }

  if (shouldOpen) {
    card.style.display = 'block';
    btn.textContent = '− Скасувати';
    btn.classList.remove('btn-save');
    btn.classList.add('btn-export');
    _populateSavingDreamSelect();
    if (typeof FormDrafts !== 'undefined' && FormDrafts.hasDraft('saving.form') && !FormDrafts.isDirty('saving.form')) {
      if (await uiConfirm('Знайдено незбережену чернетку заощадження. Відновити?', { okText: 'Відновити' })) FormDrafts.restore('saving.form');
      else FormDrafts.clear('saving.form');
    }
    onSavingCurrencyChange();
  } else {
    card.style.display = 'none';
    btn.textContent = '+ Нове заощадження';
    btn.classList.remove('btn-export');
    btn.classList.add('btn-save');
    const addBtn = document.getElementById('btnAddSaving');
    addBtn.textContent = 'Додати';
    addBtn.classList.remove('btn-export');
    addBtn.classList.add('btn-save');
    _editingSavingId = null;
  }
}

function addSaving() {
  const name = document.getElementById('savingName').value.trim();
  const amount = parseNum(document.getElementById('savingAmount').value);
  const currency = (document.getElementById('savingCurrency').value || 'UAH').toUpperCase();
  const notes = document.getElementById('savingNotes').value.trim();
  const dreamIdRaw = document.getElementById('savingDreamId').value;
  const dreamId = dreamIdRaw ? dreamIdRaw : null;

  if (!name || isNaN(amount) || amount <= 0) {
    const err = document.getElementById('savingError');
    err.textContent = 'Вкажіть назву та суму';
    err.style.display = 'block';
    return;
  }
  document.getElementById('savingError').style.display = 'none';

  const payload = { name, amount, currency, notes, dreamId };

  if (_editingSavingId !== null) {
    const idx = savingItems.findIndex(s => String(s.id) === String(_editingSavingId));
    if (idx !== -1) savingItems[idx] = { ...savingItems[idx], ...payload };
    _editingSavingId = null;
  } else {
    savingItems.push({ id: Date.now(), ...payload, createdAt: new Date().toISOString() });
  }

  renderSavings();
  saveSavingsToFirestore();
  // Linked savings now contribute to dream "saved" — refresh dream views.
  if (typeof renderDreams === 'function') renderDreams();

  document.getElementById('savingName').value = '';
  document.getElementById('savingAmount').value = '';
  document.getElementById('savingNotes').value = '';
  document.getElementById('savingCurrency').value = 'UAH';
  document.getElementById('savingDreamId').value = '';
  onSavingCurrencyChange();
  if (typeof FormDrafts !== 'undefined') FormDrafts.clear('saving.form');
  toggleSavingsForm(false);

  const msg = document.getElementById('savingSuccess');
  msg.textContent = '✓ Збережено!';
  msg.style.display = 'block';
  msg.style.animation = 'none'; msg.offsetHeight; msg.style.animation = 'fadeOut 3s forwards';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

function editSaving(id) {
  const item = savingItems.find(s => String(s.id) === String(id));
  if (!item) return;
  _editingSavingId = id;
  document.getElementById('savingName').value = item.name || '';
  document.getElementById('savingAmount').value = item.amount ? formatShort(item.amount) : '';
  document.getElementById('savingCurrency').value = item.currency || 'UAH';
  document.getElementById('savingNotes').value = item.notes || '';
  onSavingCurrencyChange();
  const btn = document.getElementById('btnAddSaving');
  btn.textContent = 'Зберегти зміни';
  btn.classList.remove('btn-save');
  btn.classList.add('btn-export');
  // Open form first — toggleSavingsForm calls _populateSavingDreamSelect() with
  // no args which would clear the selection. Populate with the current value
  // AFTER the form is open so the dreamId linkage is preserved on edit.
  toggleSavingsForm(true);
  _populateSavingDreamSelect(item.dreamId);
  if (typeof FormDrafts !== 'undefined') FormDrafts.setBaseline('saving.form');
}

async function deleteSaving(id) {
  if (!await uiConfirm('Видалити це заощадження?', { danger: true, okText: 'Видалити' })) return;
  savingItems = savingItems.filter(s => String(s.id) !== String(id));
  renderSavings();
  saveSavingsToFirestore();
  if (typeof renderDreams === 'function') renderDreams();
}

function _savingCurSymbol(cc) {
  return cc === 'USD' ? '$' : cc === 'EUR' ? '€' : cc === 'UAH' ? '₴' : cc;
}
function _savingFmtAmount(amount, cc) {
  if (!cc || cc === 'UAH') return formatNum(amount) + ' грн';
  const sym = cc === 'USD' ? '$' : cc === 'EUR' ? '€' : cc + ' ';
  return (sym === '$' || sym === '€') ? sym + formatNum(amount) : formatNum(amount) + ' ' + cc;
}

function renderSavings() {
  const list = document.getElementById('savingsList');
  const dashboard = document.getElementById('savingsDashboard');

  if (!savingItems.length) {
    list.innerHTML = '<div class="a-empty">Ще немає заощаджень. Додайте перше вище 💰</div>';
    dashboard.style.display = 'none';
    return;
  }

  // Aggregate: per-currency totals, total-in-UAH, and free vs per-dream allocation in UAH
  const byCurrency = {};
  let totalUah = 0;
  let freeUah = 0;
  const byDreamUah = {}; // dreamId → UAH sum
  const dreamsById = {};
  (typeof dreamItems !== 'undefined' ? dreamItems : []).forEach(d => { dreamsById[String(d.id)] = d; });

  const toUah = (amount, cc) => {
    if (cc === 'UAH') return amount;
    if (typeof cachedRates !== 'undefined' && cachedRates && cachedRates[cc]) return amount * cachedRates[cc];
    return null;
  };

  savingItems.forEach(s => {
    if (isExcluded(s)) return;
    const cc = (s.currency || 'UAH').toUpperCase();
    byCurrency[cc] = (byCurrency[cc] || 0) + (s.amount || 0);
    const uah = toUah(s.amount || 0, cc);
    if (uah != null) {
      totalUah += uah;
      if (s.dreamId && dreamsById[String(s.dreamId)]) byDreamUah[s.dreamId] = (byDreamUah[s.dreamId] || 0) + uah;
      else freeUah += uah;
    }
  });

  list.innerHTML = sanitize(savingItems.map(s => {
    const cc = (s.currency || 'UAH').toUpperCase();
    const usdEq = (cc !== 'UAH' && cc !== 'USD' && typeof cachedRates !== 'undefined' && cachedRates && cachedRates.USD && cachedRates[cc])
      ? ' <span style="color:#64748b;font-size:12px">≈ $' + formatNum(s.amount * cachedRates[cc] / cachedRates.USD) + '</span>'
      : '';
    const uahEq = (cc !== 'UAH' && typeof cachedRates !== 'undefined' && cachedRates && cachedRates[cc])
      ? ' <span style="color:#64748b;font-size:12px">≈ ' + formatNum(s.amount * cachedRates[cc]) + ' грн</span>'
      : '';
    const linkedDream = s.dreamId ? dreamsById[String(s.dreamId)] : null;
    const dreamBadge = linkedDream
      ? '<span class="p-item-type saving-badge-linked">' + (linkedDream.icon || '🎯') + ' ' + esc(linkedDream.name) + '</span>'
      : '<span class="p-item-type saving-badge-free">🆓 Вільні</span>';
    const include = !isExcluded(s);
    const excludedCls = !include ? ' excluded-item' : '';
    return `
      <div class="p-item${excludedCls}" style="flex-wrap:wrap">
        <div class="p-item-info" style="width:100%">
          <div class="p-item-name">${esc(s.name)} <span class="p-item-type p-type-cash">${esc(cc)}</span> ${dreamBadge}${_exclusionCheckboxHtml('saving', s.id, !include)}</div>
          <div class="p-item-details p-row">
            <span><strong>${_savingFmtAmount(s.amount, cc)}</strong>${uahEq}${usdEq}</span>
          </div>
          ${s.notes ? '<div class="p-item-notes">' + esc(s.notes) + '</div>' : ''}
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn-delete" onclick="editSaving('${s.id}')" style="color:#60a5fa">✎</button>
            <button class="btn-delete" onclick="deleteSaving('${s.id}')">✕</button>
          </div>
        </div>
      </div>`;
  }).join(''));

  dashboard.style.display = 'block';
  document.getElementById('savingsTotalMain').textContent = formatNum(totalUah) + ' грн';
  const usdEquiv = (typeof cachedRates !== 'undefined' && cachedRates && cachedRates.USD)
    ? '≈ $' + formatNum(totalUah / cachedRates.USD) : '';
  document.getElementById('savingsTotalEquiv').textContent = usdEquiv;

  // By-currency + allocation (free vs per-dream) cards.
  const allocHtml = (() => {
    const parts = [];
    parts.push('<div class="a-stat" style="flex:1;min-width:140px"><div class="a-stat-label">🆓 Вільні</div><div class="a-stat-value" style="color:#4ade80">' + formatNum(freeUah) + ' грн</div></div>');
    Object.entries(byDreamUah).forEach(([did, sum]) => {
      const d = dreamsById[did];
      parts.push('<div class="a-stat" style="flex:1;min-width:140px"><div class="a-stat-label">' + (d.icon || '🎯') + ' ' + esc(d.name) + '</div><div class="a-stat-value" style="color:#93c5fd">' + formatNum(sum) + ' грн</div></div>');
    });
    return parts.join('');
  })();
  const byCurHtml = Object.entries(byCurrency).map(([cc, amt]) => `
    <div class="a-stat" style="flex:1;min-width:120px">
      <div class="a-stat-label">${esc(cc)}</div>
      <div class="a-stat-value">${_savingFmtAmount(amt, cc)}</div>
    </div>`).join('');
  document.getElementById('savingsByCurrency').innerHTML = sanitize(allocHtml + byCurHtml);
}

async function saveSavingsToFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('savings');
    const localIds = new Set(savingItems.map(s => String(s.id)));
    const ops = [];
    if (savingsLoaded) {
      const existing = await ref.get();
      existing.forEach(doc => { if (!localIds.has(doc.id)) ops.push(doc.ref.delete()); });
    }
    const clean = (typeof stripUndefined === 'function') ? stripUndefined : (x => x);
    savingItems.forEach(s => ops.push(ref.doc(String(s.id)).set(clean(s))));
    if (ops.length) await Promise.all(ops);
  } catch(e) { console.warn('Savings save failed:', e); }
}

async function loadSavingsFromFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('savings');
    const snap = await ref.get();
    const remote = [];
    snap.forEach(doc => remote.push(doc.data()));
    const remoteIds = new Set(remote.map(s => String(s.id)));
    const localOnly = savingItems.filter(s => !remoteIds.has(String(s.id)));
    savingItems = [...remote, ...localOnly];
    savingsLoaded = true;
    renderSavings();
    if (localOnly.length) saveSavingsToFirestore();
  } catch(e) { console.warn('Savings load failed:', e); }
}

// ==================== PLANNED PURCHASES =========================
// ================================================================

let purchaseItems = [];
let sharedPurchaseItems = [];        // loaded from root /sharedPurchases collection
let sharedPurchasesUnsubscribe = null;
let _openPurchaseDetailId = null;    // id of purchase currently shown on detail page
// List filter / search / collapse state (persisted across renders in-memory).
let _purchasesFilter = 'all';        // 'all'|'overdue'|'current'|'future'|'done'|'shared'|'recurring'
let _purchasesSearchQuery = '';
let _purchasesCategory = 'all';      // 'all' | category label from PURCHASE_CATEGORY_LABELS
let _purchasesCategoryExpanded = false; // whether the category chip list is expanded

// Per-month income: map 'YYYY-MM' → { amount, currency }. Loaded from /users/{uid}/income.
let _monthlyIncome = {};
let _monthlyIncomeLoaded = false;

async function loadMonthlyIncome() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('income');
    const snap = await ref.get();
    _monthlyIncome = {};
    snap.forEach(doc => {
      const d = doc.data() || {};
      if (typeof d.amount === 'number' && d.amount >= 0) {
        _monthlyIncome[doc.id] = { amount: d.amount, currency: (d.currency || 'UAH').toUpperCase() };
      }
    });
    _monthlyIncomeLoaded = true;
    renderPurchases();
  } catch(e) { console.warn('Income load failed:', e); }
}

async function saveBudget() {
  const input = document.getElementById('budgetAmountInput');
  const curEl = document.getElementById('budgetCurrency');
  if (!input) return;
  const val = parseNum(input.value);
  const currency = (curEl && curEl.value) || 'UAH';
  const cm = currentMonthKey();
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('income').doc(cm);
    if (!(val > 0)) {
      await ref.delete().catch(() => {});
      delete _monthlyIncome[cm];
    } else {
      await ref.set({ amount: val, currency, updatedAt: new Date().toISOString() });
      _monthlyIncome[cm] = { amount: val, currency };
    }
    closeBudgetEditor();
    renderPurchases();
  } catch(e) { alert('Не вдалося зберегти: ' + e.message); }
}

function openBudgetEditor() {
  const view = document.getElementById('budgetView');
  const form = document.getElementById('budgetForm');
  const input = document.getElementById('budgetAmountInput');
  const curEl = document.getElementById('budgetCurrency');
  if (!view || !form || !input) return;
  const cm = currentMonthKey();
  const rec = _monthlyIncome[cm];
  input.value = rec && rec.amount ? formatShort(rec.amount) : '';
  if (curEl) curEl.value = (rec && rec.currency) || 'UAH';
  view.style.display = 'none';
  form.style.display = 'block';
  setTimeout(() => input.focus(), 50);
}

function closeBudgetEditor() {
  const view = document.getElementById('budgetView');
  const form = document.getElementById('budgetForm');
  if (view) view.style.display = 'block';
  if (form) form.style.display = 'none';
}

// Income in UAH (converted from stored currency if needed).
function _incomeUahFor(month) {
  const rec = _monthlyIncome[month];
  if (!rec || !(rec.amount > 0)) return 0;
  const cc = (rec.currency || 'UAH').toUpperCase();
  if (cc === 'UAH') return rec.amount;
  if (typeof cachedRates !== 'undefined' && cachedRates && cachedRates[cc]) {
    return rec.amount * cachedRates[cc];
  }
  return 0; // rate unknown yet — treat as no budget until rates load
}
let _purchasesSearchDebounce = null;
let _purchasesCollapsed = { overdue: false, current: false, future: false, done: true };
let _purchasesDoneMonthsOpen = {};   // { 'YYYY-MM': true }  defaults: current month open
let purchasesLoaded = false;
let _editingPurchaseId = null;

// Helper: locate a purchase across private + shared lists. Returns { item, source, index, list }.
function _findPurchase(id) {
  const sid = String(id);
  let idx = purchaseItems.findIndex(p => String(p.id) === sid);
  if (idx !== -1) return { item: purchaseItems[idx], source: 'private', index: idx, list: purchaseItems };
  idx = sharedPurchaseItems.findIndex(p => String(p.id) === sid);
  if (idx !== -1) return { item: sharedPurchaseItems[idx], source: 'shared', index: idx, list: sharedPurchaseItems };
  return null;
}

async function _saveSharedPurchase(item) {
  if (!firebaseReady || !currentUser) return;
  try {
    const clean = (typeof stripUndefined === 'function') ? stripUndefined(item) : item;
    await db.collection('sharedPurchases').doc(String(item.id)).set(clean, { merge: true });
  } catch(e) { console.warn('Shared purchase save failed:', e); }
}

async function _persistPurchase(item, source) {
  if (source === 'shared') await _saveSharedPurchase(item);
  else await savePurchasesToFirestore();
}

// Broader icon set than Dreams — covers typical shopping categories.
const PURCHASE_ICONS = [
  '🛒', '🛍️', '🎁', '👕', '👗', '👠', '👟', '👜',
  '⌚', '💍', '📱', '💻', '🖥️', '🎧', '📷', '🎮',
  '🎸', '📚', '✏️', '🖌️', '🏠', '🛋️', '🛏️', '🍳',
  '🧹', '🚗', '🛵', '🚲', '⛽', '✈️', '🏖️', '🍔',
  '💊', '🪥', '🐶', '🌱', '💡', '🔧',
];
const DEFAULT_PURCHASE_ICON = '🛒';

// Readable category labels tied to each purchase icon. Used for filter chips
// and the per-category breakdown on the purchases dashboard.
const PURCHASE_CATEGORY_LABELS = {
  '🛒': 'Продукти', '🛍️': 'Покупки', '🎁': 'Подарунки',
  '👕': 'Одяг', '👗': 'Одяг', '👠': 'Взуття', '👟': 'Взуття', '👜': 'Аксесуари',
  '⌚': 'Аксесуари', '💍': 'Прикраси',
  '📱': 'Техніка', '💻': 'Техніка', '🖥️': 'Техніка', '🎧': 'Техніка', '📷': 'Техніка', '🎮': 'Розваги',
  '🎸': 'Хобі', '📚': 'Освіта', '✏️': 'Освіта', '🖌️': 'Хобі',
  '🏠': 'Житло', '🛋️': 'Меблі', '🛏️': 'Меблі', '🍳': 'Кухня',
  '🧹': 'Побут',
  '🚗': 'Автомобіль', '🛵': 'Автомобіль', '🚲': 'Транспорт', '⛽': 'Паливо',
  '✈️': 'Відпустка', '🏖️': 'Відпустка', '🍔': 'Ресторани',
  '💊': 'Здоров\'я', '🪥': 'Здоров\'я',
  '🐶': 'Тварини', '🌱': 'Сад',
  '💡': 'Комуналка', '🔧': 'Побут'
};
const DEFAULT_PURCHASE_CATEGORY = 'Інше';

function purchaseIconOf(p) { return (p && p.icon) || DEFAULT_PURCHASE_ICON; }
function purchaseCategoryOf(p) {
  return PURCHASE_CATEGORY_LABELS[purchaseIconOf(p)] || DEFAULT_PURCHASE_CATEGORY;
}

function renderPurchaseIconPicker() {
  const container = document.getElementById('purchaseIconPicker');
  if (!container) return;
  const current = document.getElementById('purchaseIcon').value || DEFAULT_PURCHASE_ICON;
  container.innerHTML = PURCHASE_ICONS.map(icon =>
    `<button type="button" class="dream-icon-btn${icon === current ? ' active' : ''}" data-icon="${icon}" onclick="selectPurchaseIcon('${icon}')">${icon}</button>`
  ).join('');
}

function selectPurchaseIcon(icon) {
  document.getElementById('purchaseIcon').value = icon;
  document.querySelectorAll('#purchaseIconPicker .dream-icon-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.icon === icon);
  });
}

function purchaseCurOf(p) { return (p && p.currency) || 'UAH'; }

function purchaseToUah(amount, cc) {
  if (!cc || cc === 'UAH') return amount;
  if (!cachedRates || !cachedRates[cc]) return null;
  return amount * cachedRates[cc];
}

function fmtPurchaseAmount(amount, cc) {
  const amt = amount || 0;
  if (!cc || cc === 'UAH') return formatNum(amt) + ' грн';
  const prefix = cc === 'USD' ? '$' : (cc === 'EUR' ? '€' : '');
  return prefix ? prefix + formatNum(amt) : formatNum(amt) + ' ' + cc;
}

function onPurchaseCurrencyChange() {
  const cc = document.getElementById('purchaseCurrency').value;
  const label = cc === 'USD' ? '($)' : cc === 'EUR' ? '(€)' : '(грн)';
  const el = document.getElementById('purchaseAmountCurLabel');
  if (el) el.textContent = label;
}

// Month helpers — 'YYYY-MM' format throughout.
const UA_MONTHS_FULL = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
                        'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const UA_MONTHS_GENITIVE = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
                            'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const UA_MONTHS_LOCATIVE = ['січні', 'лютому', 'березні', 'квітні', 'травні', 'червні',
                            'липні', 'серпні', 'вересні', 'жовтні', 'листопаді', 'грудні'];

function formatMonthLocative(monthKey) {
  if (!monthKey) return '';
  const [y, m] = monthKey.split('-').map(Number);
  return (UA_MONTHS_LOCATIVE[m - 1] || '') + ' ' + y;
}
function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function formatMonthKey(monthKey) {
  if (!monthKey) return '—';
  const [y, m] = monthKey.split('-').map(Number);
  return UA_MONTHS_FULL[m - 1] + ' ' + y;
}

function _todayDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function _purchasePlannedDate(p) {
  if (!p) return null;
  if (p.plannedDate) return p.plannedDate;
  if (p.plannedMonth) return p.plannedMonth + '-01';
  return null;
}

function formatPurchaseWhen(p) {
  if (!p) return '—';
  if (p.plannedDate) {
    const [y, m, d] = p.plannedDate.split('-').map(Number);
    return d + ' ' + (UA_MONTHS_GENITIVE[m - 1] || '') + ' ' + y;
  }
  return formatMonthKey(p.plannedMonth);
}

function _addOneMonthDate(dateStr) {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr), m = Number(mStr), d = Number(dStr);
  // m is 1-based; new Date(y, m, 1) is the 1st of next month (JS month is 0-based).
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return ny + '-' + String(nm).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function _setPurchaseDate(dateKey) {
  const input = document.getElementById('purchaseDate');
  if (input) input.value = dateKey || _todayDateKey();
}


async function togglePurchaseForm(forceOpen) {
  const card = document.getElementById('purchaseFormCard');
  const btn = document.getElementById('btnTogglePurchaseForm');
  const isHidden = card.style.display === 'none';
  const shouldOpen = forceOpen !== undefined ? forceOpen : isHidden;

  if (!shouldOpen && typeof FormDrafts !== 'undefined' && FormDrafts.isDirty('purchase.form')) {
    if (!await FormDrafts.confirmDiscard('purchase.form', 'У формі витрати є незбережені зміни. Закрити без збереження?', { okText: 'Закрити', cancelText: 'Залишитись' })) return;
  }

  if (shouldOpen) {
    card.style.display = 'block';
    btn.textContent = '− Скасувати';
    btn.classList.remove('btn-save');
    btn.classList.add('btn-export');
    const dateInput = document.getElementById('purchaseDate');
    if (dateInput && !dateInput.value) dateInput.value = _todayDateKey();
    renderPurchaseIconPicker();
    onPurchaseCurrencyChange();
    if (typeof FormDrafts !== 'undefined' && FormDrafts.hasDraft('purchase.form') && !FormDrafts.isDirty('purchase.form') && !_editingPurchaseId) {
      if (await uiConfirm('Знайдено незбережену чернетку витрати. Відновити?', { okText: 'Відновити' })) FormDrafts.restore('purchase.form');
      else FormDrafts.clear('purchase.form');
    }
    // Baseline the form so the "unsaved changes" confirm only fires if the
    // user actually types — without this, any field value is treated as dirty.
    if (typeof FormDrafts !== 'undefined') FormDrafts.setBaseline('purchase.form');
  } else {
    card.style.display = 'none';
    btn.textContent = '+ Нова витрата';
    btn.classList.remove('btn-export');
    btn.classList.add('btn-save');
    const addBtn = document.getElementById('btnAddPurchase');
    addBtn.textContent = 'Запланувати';
    addBtn.classList.remove('btn-export');
    addBtn.classList.add('btn-save');
    const recordBtn = document.getElementById('btnRecordPurchase');
    if (recordBtn) recordBtn.style.display = '';
    _editingPurchaseId = null;
  }
}

function _clearPurchaseForm() {
  document.getElementById('purchaseName').value = '';
  document.getElementById('purchaseAmount').value = '';
  document.getElementById('purchaseCurrency').value = 'UAH';
  _setPurchaseDate(_todayDateKey());
  document.getElementById('purchaseLink').value = '';
  document.getElementById('purchaseNotes').value = '';
  document.getElementById('purchaseRecurring').checked = false;
  document.getElementById('purchaseIcon').value = DEFAULT_PURCHASE_ICON;
  renderPurchaseIconPicker();
  onPurchaseCurrencyChange();
}

function addPurchase(mode) {
  const recordNow = mode === 'record';
  const name = document.getElementById('purchaseName').value.trim();
  const amount = parseNum(document.getElementById('purchaseAmount').value);
  const currency = document.getElementById('purchaseCurrency').value || 'UAH';
  const dateInput = document.getElementById('purchaseDate');
  const plannedDate = (dateInput && dateInput.value) ? dateInput.value : _todayDateKey();
  const month = plannedDate.slice(0, 7);
  const link = document.getElementById('purchaseLink').value.trim();
  const notes = document.getElementById('purchaseNotes').value.trim();
  const icon = document.getElementById('purchaseIcon').value || DEFAULT_PURCHASE_ICON;
  const recurring = !!document.getElementById('purchaseRecurring').checked;
  const err = document.getElementById('purchaseError');
  err.textContent = '';

  if (!name) { err.textContent = 'Вкажіть назву'; return; }
  if (!(amount > 0)) { err.textContent = 'Вкажіть суму більше 0'; return; }
  if (link && !/^https?:\/\//i.test(link)) { err.textContent = 'Посилання має починатися з http:// або https://'; return; }

  const payload = { name, icon, amount, currency, plannedDate, plannedMonth: month, link, notes, recurring };

  if (_editingPurchaseId) {
    const found = _findPurchase(_editingPurchaseId);
    if (found) {
      const updated = { ...found.item, ...payload };
      found.list[found.index] = updated;
      _editingPurchaseId = null;
      _clearPurchaseForm();
      if (typeof FormDrafts !== 'undefined') FormDrafts.clear('purchase.form');
      togglePurchaseForm(false);
      renderPurchases();
      _persistPurchase(updated, found.source);
      const success = document.getElementById('purchaseSuccess');
      success.textContent = '✓ Збережено';
      setTimeout(() => { success.textContent = ''; }, 2000);
      return;
    }
    _editingPurchaseId = null;
  } else {
    const newItem = {
      id: Date.now(),
      ...payload,
      bought: !!recordNow,
      deferCount: 0,
      createdAt: new Date().toISOString()
    };
    if (recordNow) {
      newItem.boughtAt = new Date().toISOString();
      newItem.boughtAmount = amount;
    }
    purchaseItems.push(newItem);

    // Recurring + record: spawn next-month copy preserving day-of-month.
    if (recordNow && recurring) {
      const nextDate = _addOneMonthDate(plannedDate);
      const nextMonth = nextDate.slice(0, 7);
      const alreadyExists = purchaseItems.some(p =>
        !p.bought
        && (p.plannedMonth || '') === nextMonth
        && String(p.name || '').trim() === name
        && p.recurring
      );
      if (!alreadyExists) {
        purchaseItems.push({
          ...payload,
          plannedDate: nextDate,
          plannedMonth: nextMonth,
          id: Date.now() + Math.floor(Math.random() * 1000),
          bought: false,
          deferCount: 0,
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  _clearPurchaseForm();
  if (typeof FormDrafts !== 'undefined') FormDrafts.clear('purchase.form');
  togglePurchaseForm(false);
  renderPurchases();
  savePurchasesToFirestore();
  const success = document.getElementById('purchaseSuccess');
  success.textContent = recordNow ? '✓ Внесено' : '✓ Заплановано';
  setTimeout(() => { success.textContent = ''; }, 2000);
}

function editPurchase(id) {
  const found = _findPurchase(id);
  if (!found) return;
  const item = found.item;
  _editingPurchaseId = id;
  const btn = document.getElementById('btnAddPurchase');
  btn.textContent = 'Зберегти зміни';
  btn.classList.remove('btn-save');
  btn.classList.add('btn-export');
  const recordBtn = document.getElementById('btnRecordPurchase');
  if (recordBtn) recordBtn.style.display = 'none';
  // Open the form first so togglePurchaseForm doesn't re-populate from scratch
  // after we set the fields. Populate fields AFTER opening.
  togglePurchaseForm(true);
  document.getElementById('purchaseName').value = item.name || '';
  document.getElementById('purchaseAmount').value = item.amount ? formatShort(item.amount) : '';
  document.getElementById('purchaseCurrency').value = item.currency || 'UAH';
  _setPurchaseDate(_purchasePlannedDate(item) || _todayDateKey());
  document.getElementById('purchaseLink').value = item.link || '';
  document.getElementById('purchaseNotes').value = item.notes || '';
  document.getElementById('purchaseRecurring').checked = !!item.recurring;
  document.getElementById('purchaseIcon').value = item.icon || DEFAULT_PURCHASE_ICON;
  renderPurchaseIconPicker();
  onPurchaseCurrencyChange();
  if (typeof FormDrafts !== 'undefined') FormDrafts.setBaseline('purchase.form');
  // Scroll to form — on mobile the form is at the top, far from the edit
  // button in the list below.
  const card = document.getElementById('purchaseFormCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const nameField = document.getElementById('purchaseName');
  if (nameField) setTimeout(() => nameField.focus({ preventScroll: true }), 300);
}

async function deletePurchase(id) {
  const found = _findPurchase(id);
  if (!found) return;
  const item = found.item;
  if (found.source === 'shared') {
    const members = item.members || [];
    if (members.length <= 1) {
      if (!await uiConfirm('Видалити «' + item.name + '»? Ви єдиний учасник — витрата видалиться повністю.', { danger: true, okText: 'Видалити' })) return;
      db.collection('sharedPurchases').doc(String(id)).delete().catch(e => alert('Помилка: ' + e.message));
    } else {
      if (!await uiConfirm('Покинути спільну витрату «' + item.name + '»? Інші учасники продовжать її бачити.', { okText: 'Покинути' })) return;
      const emailUpdate = {};
      emailUpdate['memberEmails.' + currentUser.uid] = firebase.firestore.FieldValue.delete();
      db.collection('sharedPurchases').doc(String(id)).update({
        members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
        ...emailUpdate
      }).catch(e => alert('Помилка: ' + e.message));
    }
    return;
  }
  if (!await uiConfirm('Видалити ' + item.name + '?', { danger: true, okText: 'Видалити' })) return;
  purchaseItems = purchaseItems.filter(p => String(p.id) !== String(id));
  renderPurchases();
  savePurchasesToFirestore();
}

async function markPurchaseBought(id) {
  const found = _findPurchase(id);
  if (!found) return;
  const item = found.item;
  const sym = item.currency === 'USD' ? '$' : item.currency === 'EUR' ? '€' : 'грн';
  const raw = await uiPrompt('Фактична сума витрати (' + sym + '). Залиште порожнім, щоб зберегти заплановану:', {
    title: '✓ Відмітити як здійснену',
    placeholder: formatShort(item.amount || 0),
    okText: 'Зберегти'
  });
  if (raw === null) return;
  let actual = item.amount;
  if (raw && raw.trim()) {
    const parsed = parseNum(raw);
    if (!isNaN(parsed) && parsed > 0) actual = parsed;
  }
  const updated = {
    ...item,
    bought: true,
    boughtAt: new Date().toISOString(),
    boughtAmount: actual
  };
  found.list[found.index] = updated;
  renderPurchases();
  _persistPurchase(updated, found.source);
  // Recurring: spawn a clean copy for the next month (if not already present).
  if (item.recurring && found.source === 'private') {
    const baseDate = item.plannedDate || ((item.plannedMonth || currentMonthKey()) + '-01');
    const nextDate = _addOneMonthDate(baseDate);
    const nextMonth = nextDate.slice(0, 7);
    const alreadyExists = purchaseItems.some(p =>
      !p.bought
      && (p.plannedMonth || '') === nextMonth
      && String(p.name || '').trim() === String(item.name || '').trim()
      && p.recurring
    );
    if (!alreadyExists) {
      const { id, bought, boughtAt, boughtAmount, deferCount, ...rest } = item;
      purchaseItems.push({
        ...rest,
        id: Date.now() + Math.floor(Math.random() * 1000),
        plannedDate: nextDate,
        plannedMonth: nextMonth,
        bought: false,
        deferCount: 0,
        createdAt: new Date().toISOString(),
        recurring: true
      });
      renderPurchases();
      savePurchasesToFirestore();
    }
  }
}

async function unmarkPurchaseBought(id) {
  const found = _findPurchase(id);
  if (!found) return;
  if (!await uiConfirm('Скасувати позначку «здійснено»?', { okText: 'Скасувати' })) return;
  const { boughtAt, boughtAmount, ...rest } = found.item;
  // For Firestore, explicitly clear the fields in shared documents.
  if (found.source === 'shared' && firebaseReady) {
    db.collection('sharedPurchases').doc(String(id)).update({
      bought: false,
      boughtAt: firebase.firestore.FieldValue.delete(),
      boughtAmount: firebase.firestore.FieldValue.delete()
    }).catch(e => console.warn('Unmark failed:', e));
    return;
  }
  const updated = { ...rest, bought: false };
  found.list[found.index] = updated;
  renderPurchases();
  _persistPurchase(updated, found.source);
}

function deferPurchase(id) {
  const found = _findPurchase(id);
  if (!found) return;
  const baseDate = found.item.plannedDate || ((found.item.plannedMonth || currentMonthKey()) + '-01');
  const nextDate = _addOneMonthDate(baseDate);
  const updated = {
    ...found.item,
    plannedDate: nextDate,
    plannedMonth: nextDate.slice(0, 7),
    deferCount: (found.item.deferCount || 0) + 1
  };
  found.list[found.index] = updated;
  renderPurchases();
  _persistPurchase(updated, found.source);
}

function sharePurchase(id) {
  const found = _findPurchase(id);
  if (!found) return;
  const item = found.item;
  const cc = purchaseCurOf(item);
  const icon = purchaseIconOf(item);
  const lines = [
    icon + ' ' + item.name,
    '💰 ' + fmtPurchaseAmount(item.amount, cc),
    '📅 ' + formatPurchaseWhen(item)
  ];
  if (item.link) lines.push('🔗 ' + item.link);
  if (item.notes) lines.push('📝 ' + item.notes);
  if (item.bought) lines.push('✅ Здійснено' + (item.boughtAmount ? ' за ' + fmtPurchaseAmount(item.boughtAmount, cc) : ''));
  const text = lines.join('\n');
  const title = item.name;
  // Pass url separately when available — Web Share API and Telegram use it
  // as the primary link (shows preview).
  const shareData = { title, text };
  if (item.link) shareData.url = item.link;

  // Prefer the native share sheet on mobile. Fall back to a custom menu.
  if (navigator.share) {
    navigator.share(shareData).catch(err => {
      if (err && err.name !== 'AbortError') _showShareMenu(text, title, item.link);
    });
    return;
  }
  _showShareMenu(text, title, item.link);
}

function _showShareMenu(text, title, url) {
  const existing = document.getElementById('shareMenuBackdrop');
  if (existing) existing.remove();

  const encoded = encodeURIComponent(text);
  const encodedSubject = encodeURIComponent(title || 'Запланована витрата');
  const encodedUrl = url ? encodeURIComponent(url) : '';

  const backdrop = document.createElement('div');
  backdrop.id = 'shareMenuBackdrop';
  backdrop.className = 'share-menu-backdrop';
  backdrop.innerHTML = `
    <div class="share-menu" onclick="event.stopPropagation()">
      <h3 style="margin:0 0 4px;font-size:16px">Поділитись</h3>
      <pre class="share-menu-preview">${text.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>
      <div class="share-menu-grid">
        <a href="https://t.me/share/url?url=${encodedUrl || encoded}&text=${encoded}" target="_blank" rel="noopener" class="share-menu-btn share-tg">
          <span class="share-ico">✈️</span><span>Telegram</span>
        </a>
        <a href="https://wa.me/?text=${encoded}" target="_blank" rel="noopener" class="share-menu-btn share-wa">
          <span class="share-ico">💬</span><span>WhatsApp</span>
        </a>
        <a href="viber://forward?text=${encoded}" class="share-menu-btn share-viber">
          <span class="share-ico">📞</span><span>Viber</span>
        </a>
        <a href="mailto:?subject=${encodedSubject}&body=${encoded}" class="share-menu-btn share-email">
          <span class="share-ico">✉️</span><span>Email</span>
        </a>
        <button type="button" class="share-menu-btn share-copy" data-text="${text.replace(/"/g, '&quot;').replace(/\n/g, '&#10;')}" onclick="_copyShareText(this)">
          <span class="share-ico">📋</span><span>Копіювати</span>
        </button>
      </div>
      <button type="button" class="share-menu-close" onclick="document.getElementById('shareMenuBackdrop').remove()">Закрити</button>
    </div>
  `;
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}

function _copyShareText(btn) {
  const text = (btn.dataset.text || '').replace(/&#10;/g, '\n').replace(/&quot;/g, '"');
  const finish = () => {
    btn.innerHTML = '<span class="share-ico">✓</span><span>Скопійовано</span>';
    setTimeout(() => {
      const bd = document.getElementById('shareMenuBackdrop');
      if (bd) bd.remove();
    }, 900);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(finish).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); finish(); } catch(e) {}
      ta.remove();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); finish(); } catch(e) {}
    ta.remove();
  }
}

function updatePurchasesUI() {
  const auth = document.getElementById('purchasesAuth');
  const content = document.getElementById('purchasesContent');
  if (!auth || !content) return;
  if (!currentUser) {
    auth.style.display = 'block';
    content.style.display = 'none';
  } else {
    auth.style.display = 'none';
    content.style.display = 'block';
    renderPurchases();
  }
}

function renderPurchases() {
  const list = document.getElementById('purchasesList');
  const dashboard = document.getElementById('purchasesDashboard');
  if (!list || !dashboard) return;

  // Merge private + shared with source marker so actions know which doc to update.
  const allItems = [
    ...purchaseItems.map(p => ({ ...p, _source: 'private' })),
    ...sharedPurchaseItems.map(p => ({ ...p, _source: 'shared' }))
  ];

  if (!allItems.length) {
    list.innerHTML = '<div class="a-empty">Ще немає запланованих витрат. Додайте першу вище 🛒</div>';
    dashboard.style.display = 'none';
    const toolbar = document.getElementById('purchasesToolbar');
    if (toolbar) toolbar.style.display = 'none';
    return;
  }

  // Dashboard mirrors the calendar's selected month so users can review any
  // month's totals by navigating ‹‹ ‹ › ›› — defaults to the actual current
  // month until they navigate.
  const cm = _activePurchaseCalendarMonth();
  const realCm = currentMonthKey();
  const groups = { overdue: [], current: [], future: [], done: [] };
  allItems.forEach(p => {
    if (p.bought) groups.done.push(p);
    else if ((p.plannedMonth || cm) < cm) groups.overdue.push(p);
    else if ((p.plannedMonth || cm) === cm) groups.current.push(p);
    else groups.future.push(p);
  });

  // Dashboard totals (in UAH for aggregation) — excluded items skipped.
  let totalPlannedCmUah = 0;
  let totalBoughtCmUah = 0;
  groups.current.forEach(p => {
    if (isExcluded(p)) return;
    const v = purchaseToUah(p.amount, purchaseCurOf(p));
    if (v != null) totalPlannedCmUah += v;
  });
  groups.done.forEach(p => {
    if (isExcluded(p)) return;
    if ((p.plannedMonth || '').slice(0, 7) !== cm && (p.boughtAt || '').slice(0, 7) !== cm) return;
    const v = purchaseToUah(p.boughtAmount || p.amount, purchaseCurOf(p));
    if (v != null) totalBoughtCmUah += v;
  });

  const usdRate = cachedRates && cachedRates.USD;
  // Hero shows the full monthly outflow plan: not-yet-spent (totalPlannedCmUah)
  // plus already-spent (totalBoughtCmUah) — together they form the month's
  // committed budget. Sub-tiles split it back into "spent" and "remaining".
  const totalMonthUah = totalPlannedCmUah + totalBoughtCmUah;
  const monthLower = formatMonthKey(cm).toLowerCase();
  const isCurrentMonth = cm === realCm;
  document.getElementById('purchasesHeroLabel').textContent = 'Заплановано витрат на ' + monthLower;
  document.getElementById('purchasesTotalPlanned').textContent = formatShort(totalMonthUah) + ' грн';
  document.getElementById('purchasesHeroHint').textContent = usdRate ? '≈ $' + formatNum(totalMonthUah / usdRate) : '';
  document.getElementById('purchasesBoughtValue').textContent = formatShort(totalBoughtCmUah) + ' грн';
  document.getElementById('purchasesRemainingValue').textContent = formatShort(totalPlannedCmUah) + ' грн';
  const boughtLabelEl = document.getElementById('purchasesBoughtLabel');
  if (boughtLabelEl) boughtLabelEl.textContent = isCurrentMonth ? 'Витрачено цього місяця' : ('Витрачено у ' + formatMonthLocative(cm));
  document.getElementById('purchasesOverdueCount').textContent = String(groups.overdue.length);
  document.getElementById('purchasesFutureCount').textContent = String(groups.future.length);
  dashboard.style.display = 'block';

  // Calendar view of expenses (navigable; defaults to current month).
  _renderPurchaseCalendar();
  // Budget (income) indicator for current month.
  _renderBudget(cm, totalPlannedCmUah, totalBoughtCmUah);
  // Category breakdown for current month.
  _renderCategoryBreakdown(cm, groups.current, groups.done);

  const sortByMonthAsc = (a, b) => (a.plannedMonth || '').localeCompare(b.plannedMonth || '');
  const sortByBoughtDesc = (a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || '');
  groups.overdue.sort(sortByMonthAsc);
  groups.current.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  groups.future.sort(sortByMonthAsc);
  groups.done.sort(sortByBoughtDesc);

  const renderItem = (p, opts = {}) => {
    const cc = purchaseCurOf(p);
    const amountStr = fmtPurchaseAmount(p.amount, cc);
    const uahEq = (cc !== 'UAH' && purchaseToUah(p.amount, cc) !== null)
      ? ' <span style="color:#64748b;font-size:12px">≈ ' + formatNum(purchaseToUah(p.amount, cc)) + ' грн</span>'
      : '';
    const actions = [];
    const linkHtml = p.link
      ? '<div class="p-item-details"><a href="' + esc(p.link) + '" target="_blank" rel="noopener noreferrer" class="purchase-link" onclick="event.stopPropagation()">🔗 ' + esc(p.link.length > 60 ? p.link.slice(0, 57) + '…' : p.link) + '</a></div>'
      : '';
    const isShared = p._source === 'shared';
    const memberCount = isShared && Array.isArray(p.members) ? p.members.length : 0;
    const memberEmails = isShared && p.memberEmails ? Object.values(p.memberEmails).filter(Boolean).join(', ') : '';
    const sharedBadge = isShared
      ? '<span class="p-item-type" style="background:rgba(168,85,247,0.15);color:#c084fc" title="' + esc(memberEmails) + '">👥 Спільна (' + memberCount + ')</span>'
      : '';
    const recurringBadge = p.recurring
      ? '<span class="p-item-type" style="background:rgba(96,165,250,0.15);color:#60a5fa" title="Повторюється щомісяця">🔁 щомісяця</span>'
      : '';
    if (p.bought) {
      const boughtStr = p.boughtAmount && p.boughtAmount !== p.amount
        ? 'Здійснено за ' + fmtPurchaseAmount(p.boughtAmount, cc)
        : 'Здійснено';
      actions.push('<button class="btn-delete purchase-action-icon" title="Деталі" onclick="event.stopPropagation();openPurchaseDetail(\'' + p.id + '\')" style="color:#60a5fa">📋</button>');
      if (isShared) actions.push('<button class="btn-delete purchase-action-icon" title="Запросити ще учасника" onclick="event.stopPropagation();invitePurchaseByEmail(\'' + p.id + '\')" style="color:#60a5fa">👥</button>');
      actions.push('<button class="btn-delete purchase-action-icon" title="Поділитись" onclick="event.stopPropagation();sharePurchase(\'' + p.id + '\')" style="color:#60a5fa">↗</button>');
      actions.push('<button class="btn-delete purchase-action-icon" title="Скасувати позначку" onclick="event.stopPropagation();unmarkPurchaseBought(\'' + p.id + '\')" style="color:#f59e0b">↺</button>');
      actions.push('<button class="btn-delete purchase-action-icon" title="' + (isShared ? 'Покинути спільну' : 'Видалити') + '" onclick="event.stopPropagation();deletePurchase(\'' + p.id + '\')">✕</button>');
      const excludedClsDone = isExcluded(p) ? ' excluded-item' : '';
      return `<div class="p-item${excludedClsDone}" style="opacity:0.75;cursor:pointer" onclick="if(!event.target.closest('button')&&!event.target.closest('a')&&!event.target.closest('.exclude-toggle'))openPurchaseDetail('${p.id}')">
        <div class="p-item-info" style="width:100%">
          <div class="p-item-name">
            <span class="dream-icon">${purchaseIconOf(p)}</span>${esc(p.name)}
            ${sharedBadge}
            ${recurringBadge}
            <span class="p-item-type" style="background:rgba(74,222,128,0.15);color:#4ade80">✓ ${boughtStr}</span>
            ${_exclusionCheckboxHtml('purchase', p.id, isExcluded(p))}
          </div>
          <div class="p-item-details">
            <span>${amountStr}${uahEq}</span>
            <span>${formatPurchaseWhen(p)}</span>
            ${p.boughtAt ? '<span style="color:#64748b">Позначено: ' + new Date(p.boughtAt).toLocaleDateString('uk-UA') + '</span>' : ''}
          </div>
          ${linkHtml}
          ${p.notes ? '<div class="p-item-notes" style="white-space:pre-wrap">' + esc(p.notes) + '</div>' : ''}
          <div class="purchase-actions">${actions.join('')}</div>
        </div>
      </div>`;
    }

    const isOverdue = opts.isOverdue;
    const deferBadge = p.deferCount ? '<span class="p-item-type" style="background:rgba(251,191,36,0.15);color:#fbbf24">перенесено ×' + p.deferCount + '</span>' : '';
    const nextDateLabel = (() => {
      const base = p.plannedDate || ((p.plannedMonth || cm) + '-01');
      const next = _addOneMonthDate(base);
      return p.plannedDate ? formatPurchaseWhen({ plannedDate: next }) : formatMonthKey(next.slice(0, 7));
    })();
    actions.push('<button class="btn-save purchase-action" title="Відмітити як здійснену" onclick="event.stopPropagation();markPurchaseBought(\'' + p.id + '\')">✓ Відмітити</button>');
    actions.push('<button class="btn-clear purchase-action" onclick="event.stopPropagation();deferPurchase(\'' + p.id + '\')" title="Перенести на ' + nextDateLabel + '">📅 +міс</button>');
    actions.push('<button class="btn-delete purchase-action-icon" title="Деталі" onclick="event.stopPropagation();openPurchaseDetail(\'' + p.id + '\')" style="color:#60a5fa">📋</button>');
    if (isShared) {
      actions.push('<button class="btn-delete purchase-action-icon" title="Запросити ще учасника" onclick="event.stopPropagation();invitePurchaseByEmail(\'' + p.id + '\')" style="color:#60a5fa">👥</button>');
    } else {
      actions.push('<button class="btn-delete purchase-action-icon" title="Зробити спільною (поділитись з іншим користувачем)" onclick="event.stopPropagation();promptMakeShared(\'' + p.id + '\')" style="color:#60a5fa">👥</button>');
    }
    actions.push('<button class="btn-delete purchase-action-icon" title="Поділитись" onclick="event.stopPropagation();sharePurchase(\'' + p.id + '\')" style="color:#60a5fa">↗</button>');
    actions.push('<button class="btn-delete purchase-action-icon" title="Редагувати" onclick="event.stopPropagation();editPurchase(\'' + p.id + '\')" style="color:#60a5fa">✎</button>');
    actions.push('<button class="btn-delete purchase-action-icon" title="' + (isShared ? 'Покинути спільну' : 'Видалити') + '" onclick="event.stopPropagation();deletePurchase(\'' + p.id + '\')">✕</button>');

    const excludedClsActive = isExcluded(p) ? ' excluded-item' : '';
    return `<div class="p-item${excludedClsActive}" style="flex-wrap:wrap;cursor:pointer${isOverdue ? ';border-color:#7f1d1d' : ''}" onclick="if(!event.target.closest('button')&&!event.target.closest('a')&&!event.target.closest('.exclude-toggle'))openPurchaseDetail('${p.id}')">
      <div class="p-item-info" style="width:100%">
        <div class="p-item-name">
          <span class="dream-icon">${purchaseIconOf(p)}</span>${esc(p.name)}
          ${sharedBadge}
          ${recurringBadge}
          ${isOverdue ? '<span class="p-item-type" style="background:rgba(248,113,113,0.15);color:#f87171">прострочено</span>' : ''}
          ${deferBadge}
          ${_exclusionCheckboxHtml('purchase', p.id, isExcluded(p))}
        </div>
        <div class="p-item-details">
          <span><strong>${amountStr}</strong>${uahEq}</span>
          <span>${formatPurchaseWhen(p)}</span>
        </div>
        ${linkHtml}
        ${p.notes ? '<div class="p-item-notes" style="white-space:pre-wrap">' + esc(p.notes) + '</div>' : ''}
        <div class="purchase-actions">${actions.join('')}</div>
      </div>
    </div>`;
  };

  // Toolbar chips — counts reflect raw category sizes (ignoring search),
  // so the user sees the real distribution when switching filters.
  const sharedCount = allItems.filter(p => p._source === 'shared').length;
  const recurringCount = allItems.filter(p => p.recurring).length;
  // Per-category counts across ALL items (so chips show the full picture).
  const categoryCounts = {};
  allItems.forEach(p => {
    const c = purchaseCategoryOf(p);
    categoryCounts[c] = (categoryCounts[c] || 0) + 1;
  });
  _renderPurchasesToolbar({
    all: allItems.length,
    overdue: groups.overdue.length,
    current: groups.current.length,
    future: groups.future.length,
    done: groups.done.length,
    shared: sharedCount,
    recurring: recurringCount
  }, categoryCounts);

  // Apply filter + search + category to produce the visible set per group.
  const q = _purchasesSearchQuery.trim().toLowerCase();
  const matchesQuery = p => {
    if (!q) return true;
    return String(p.name || '').toLowerCase().includes(q)
      || String(p.notes || '').toLowerCase().includes(q)
      || String(p.link || '').toLowerCase().includes(q);
  };
  const matchesFilter = (p, groupKey) => {
    if (_purchasesFilter === 'all') return true;
    if (_purchasesFilter === 'shared') return p._source === 'shared';
    if (_purchasesFilter === 'recurring') return !!p.recurring;
    return _purchasesFilter === groupKey;
  };
  const matchesCategory = p => _purchasesCategory === 'all' || purchaseCategoryOf(p) === _purchasesCategory;
  const keep = (p, groupKey) => matchesFilter(p, groupKey) && matchesQuery(p) && matchesCategory(p);
  const vis = {
    overdue: groups.overdue.filter(p => keep(p, 'overdue')),
    current: groups.current.filter(p => keep(p, 'current')),
    future:  groups.future.filter(p => keep(p, 'future')),
    done:    groups.done.filter(p => keep(p, 'done'))
  };

  // If search is active, auto-open groups so results aren't hidden behind a caret.
  const forceOpen = !!q;

  const sections = [];

  const pushGroup = (key, label, color, items, body, opts = {}) => {
    if (!items.length && !opts.alwaysShow) return;
    const collapsed = !forceOpen && _purchasesCollapsed[key];
    const effectiveBody = body || '<div class="p-group-empty">Цього місяця ще немає витрат. Додайте першу вище.</div>';
    sections.push(
      '<div class="p-group-header' + (collapsed ? ' collapsed' : '') + '" onclick="_togglePurchaseGroup(\'' + key + '\')" title="Натисніть, щоб згорнути/розгорнути">' +
        '<span class="p-group-title"' + (color ? ' style="color:' + color + '"' : '') + '>' + label + ' (' + items.length + ')</span>' +
        '<span class="p-group-hint"></span>' +
        '<span class="caret">▾</span>' +
      '</div>' +
      '<div class="p-group-body' + (collapsed ? ' collapsed' : '') + '">' + effectiveBody + '</div>'
    );
  };

  // Current month — always on top, always visible even when empty (primary view).
  pushGroup('current', '📅 Цей місяць · ' + formatMonthKey(cm), '', vis.current,
    vis.current.map(p => renderItem(p)).join(''), { alwaysShow: true });

  pushGroup('overdue', '⚠ Прострочено', '#f87171', vis.overdue,
    vis.overdue.map(p => renderItem(p, { isOverdue: true })).join(''));

  pushGroup('future', '🔜 На майбутнє', '#94a3b8', vis.future,
    vis.future.map(p => renderItem(p)).join(''));

  // Done group — archive by month, newest first.
  if (vis.done.length) {
    const byMonth = {};
    vis.done.forEach(p => {
      const mk = (p.boughtAt || p.plannedMonth || '').slice(0, 7) || '—';
      (byMonth[mk] = byMonth[mk] || []).push(p);
    });
    const monthKeys = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
    const monthsHtml = monthKeys.map(mk => {
      const items = byMonth[mk];
      // Current month expanded by default; older months collapsed unless user opened them.
      const opened = forceOpen || (_purchasesDoneMonthsOpen[mk] !== undefined ? _purchasesDoneMonthsOpen[mk] : mk === cm);
      const header = '<div class="p-done-month-header' + (opened ? '' : ' collapsed') + '" onclick="_toggleDoneMonth(\'' + mk + '\')" title="Натисніть, щоб згорнути/розгорнути">' +
        '<span>📆 ' + (mk === '—' ? 'Без дати' : formatMonthKey(mk)) + ' (' + items.length + ')</span>' +
        '<span class="caret">▾</span>' +
        '</div>';
      const body = '<div class="p-done-month-body' + (opened ? '' : ' collapsed') + '">' +
        items.map(p => renderItem(p)).join('') +
        '</div>';
      return header + body;
    }).join('');
    pushGroup('done', '✓ Здійснено', '#4ade80', vis.done, monthsHtml);
  }

  if (!sections.length) {
    const hasFilter = _purchasesFilter !== 'all' || q;
    list.innerHTML = sanitize(hasFilter
      ? '<div class="p-no-results">Нічого не знайдено за поточними фільтрами. <a href="#" onclick="event.preventDefault();_purchasesResetFilters()" style="color:#60a5fa">Скинути</a></div>'
      : '<div class="a-empty">Ще немає запланованих витрат. Додайте першу вище 🛒</div>'
    );
    return;
  }

  list.innerHTML = sanitize(sections.join(''));
}

let _selectedPurchaseCalendarDate = null;
let _purchaseCalendarMonth = null; // YYYY-MM, null = follow current month

function _activePurchaseCalendarMonth() {
  return _purchaseCalendarMonth || currentMonthKey();
}

function _navPurchaseCalendar(direction) {
  const cur = _activePurchaseCalendarMonth();
  _purchaseCalendarMonth = addMonths(cur, direction);
  _selectedPurchaseCalendarDate = null;
  renderPurchases();
}

function _navPurchaseCalendarToday() {
  _purchaseCalendarMonth = null;
  _selectedPurchaseCalendarDate = null;
  renderPurchases();
}

function _renderPurchaseCalendar() {
  const card = document.getElementById('purchaseCalendarCard');
  const grid = document.getElementById('purchaseCalendarGrid');
  const weekdays = document.getElementById('purchaseCalendarWeekdays');
  const monthLabel = document.getElementById('purchaseCalendarMonth');
  const detailEl = document.getElementById('purchaseCalendarDetail');
  if (!card || !grid || !weekdays) return;

  const allItems = [
    ...(typeof purchaseItems !== 'undefined' ? purchaseItems : []),
    ...(typeof sharedPurchaseItems !== 'undefined' ? sharedPurchaseItems : [])
  ];
  if (!allItems.length) {
    card.style.display = 'none';
    return;
  }

  const cm = _activePurchaseCalendarMonth();
  monthLabel.textContent = formatMonthKey(cm).toLowerCase();

  // Build weekday headers (Monday-first, Ukrainian short names).
  const wdNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  weekdays.innerHTML = wdNames.map((n, i) =>
    '<span' + (i >= 5 ? ' class="is-weekend"' : '') + '>' + n + '</span>'
  ).join('');

  const [yStr, mStr] = cm.split('-');
  const y = Number(yStr), m = Number(mStr);
  // First day of month (Mon=0..Sun=6).
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayKey = _todayDateKey();

  // Group items by ISO date.
  const byDay = {};
  allItems.forEach(p => {
    const cc = purchaseCurOf(p);
    const uah = purchaseToUah(p.boughtAmount || p.amount, cc);
    let dateKey;
    if (p.plannedDate) dateKey = p.plannedDate;
    else if (p.bought && p.boughtAt) dateKey = p.boughtAt.slice(0, 10);
    else if (p.plannedMonth) dateKey = p.plannedMonth + '-01';
    else return;
    if (dateKey.slice(0, 7) !== cm) return;
    if (!byDay[dateKey]) byDay[dateKey] = { items: [], totalUah: 0, hasPlanned: false, hasDone: false };
    byDay[dateKey].items.push(p);
    if (uah != null) byDay[dateKey].totalUah += uah;
    if (p.bought) byDay[dateKey].hasDone = true;
    else byDay[dateKey].hasPlanned = true;
  });

  const cells = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push('<div class="purchase-calendar-day is-empty"></div>');
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const data = byDay[key];
    const isToday = key === todayKey;
    const isSelected = _selectedPurchaseCalendarDate === key;
    const cls = ['purchase-calendar-day'];
    if (isToday) cls.push('is-today');
    if (isSelected) cls.push('is-selected');
    if (data) cls.push('is-active');
    let dotClass = '';
    if (data) {
      if (data.hasPlanned && data.hasDone) dotClass = 'is-mixed';
      else if (data.hasDone) dotClass = 'is-done';
      else dotClass = 'is-planned';
    }
    const icons = data
      ? data.items.slice(0, 3).map(it => '<span>' + esc(purchaseIconOf(it)) + '</span>').join('')
      + (data.items.length > 3 ? '<span style="color:#94a3b8">+' + (data.items.length - 3) + '</span>' : '')
      : '';
    const amount = data ? '<div class="purchase-calendar-day-amount' + (data.hasDone ? ' has-done' : '') + '">' + formatShort(data.totalUah) + '</div>' : '';
    const dot = dotClass ? '<span class="purchase-calendar-day-dot ' + dotClass + '"></span>' : '';
    const onclick = data ? ' onclick="_selectPurchaseCalendarDay(\'' + key + '\')"' : '';
    cells.push(
      '<div class="' + cls.join(' ') + '"' + onclick + '>' +
        dot +
        '<span class="purchase-calendar-day-num">' + d + '</span>' +
        (icons ? '<div class="purchase-calendar-day-icons">' + icons + '</div>' : '') +
        amount +
      '</div>'
    );
  }

  grid.innerHTML = sanitize(cells.join(''));
  card.style.display = 'block';

  // Render detail panel for the selected day, if it still has items.
  if (_selectedPurchaseCalendarDate && byDay[_selectedPurchaseCalendarDate]) {
    _renderCalendarDayDetail(_selectedPurchaseCalendarDate, byDay[_selectedPurchaseCalendarDate]);
  } else {
    _selectedPurchaseCalendarDate = null;
    if (detailEl) { detailEl.style.display = 'none'; detailEl.innerHTML = ''; }
  }
}

function _renderCalendarDayDetail(dayKey, data) {
  const detailEl = document.getElementById('purchaseCalendarDetail');
  if (!detailEl) return;
  const [y, mo, d] = dayKey.split('-').map(Number);
  const title = d + ' ' + (UA_MONTHS_GENITIVE[mo - 1] || '') + ' ' + y;
  const rows = data.items.map(p => {
    const cc = purchaseCurOf(p);
    const amt = fmtPurchaseAmount(p.boughtAmount || p.amount, cc);
    const cls = 'pcal-item' + (p.bought ? ' is-done' : '');
    return '<div class="' + cls + '" onclick="openPurchaseDetail(\'' + p.id + '\')">' +
      '<span style="font-size:18px">' + esc(purchaseIconOf(p)) + '</span>' +
      '<span class="pcal-item-name">' + esc(p.name || '') + (p.bought ? ' · ✓' : '') + '</span>' +
      '<span class="pcal-item-amount">' + esc(amt) + '</span>' +
    '</div>';
  }).join('');
  detailEl.innerHTML = sanitize('<h4>' + title + '</h4>' + rows);
  detailEl.style.display = 'block';
}

function _selectPurchaseCalendarDay(dayKey) {
  _selectedPurchaseCalendarDate = (_selectedPurchaseCalendarDate === dayKey) ? null : dayKey;
  _renderPurchaseCalendar();
  if (_selectedPurchaseCalendarDate) {
    const detail = document.getElementById('purchaseCalendarDetail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function _renderBudget(cm, totalPlannedUah, totalBoughtUah) {
  const monthLabel = document.getElementById('budgetMonthLabel');
  const amountEl = document.getElementById('budgetAmount');
  const wrap = document.getElementById('budgetProgressWrap');
  const hint = document.getElementById('budgetHint');
  const bar = document.getElementById('budgetProgressBar');
  const stats = document.getElementById('budgetStats');
  if (!monthLabel || !amountEl) return;
  const monthIdx = Number((cm || '').split('-')[1]) - 1;
  monthLabel.textContent = UA_MONTHS_FULL[monthIdx] || formatMonthKey(cm);
  const rec = _monthlyIncome[cm];
  const incomeUah = _incomeUahFor(cm);
  if (!rec || rec.amount <= 0) {
    amountEl.textContent = '— не вказано —';
    amountEl.style.color = '#64748b';
    wrap.style.display = 'none';
    hint.style.display = 'block';
    return;
  }
  const cc = (rec.currency || 'UAH').toUpperCase();
  const sym = cc === 'USD' ? '$' : cc === 'EUR' ? '€' : '';
  const native = sym ? (sym + formatNum(rec.amount)) : (formatNum(rec.amount) + ' грн');
  const uahEq = (cc !== 'UAH' && incomeUah > 0)
    ? ' <span style="color:#94a3b8;font-size:14px;font-weight:500">≈ ' + formatNum(incomeUah) + ' грн</span>'
    : '';
  amountEl.innerHTML = native + uahEq;
  amountEl.style.color = '#4ade80';
  hint.style.display = 'none';
  wrap.style.display = 'block';

  // If rate unknown yet for non-UAH currency, show warning instead of wrong %.
  if (incomeUah <= 0) {
    bar.style.width = '0%';
    bar.classList.remove('warn', 'danger');
    stats.innerHTML = '<span style="color:#94a3b8">Курс НБУ завантажується…</span>';
    return;
  }

  // Total "consumed" = already bought + still planned for this month.
  // Both reduce the available budget, so the bar must reflect their sum.
  const consumedUah = totalPlannedUah + totalBoughtUah;
  const consumedPct = incomeUah > 0 ? Math.min(150, (consumedUah / incomeUah) * 100) : 0;
  const remaining = incomeUah - consumedUah;
  bar.style.width = Math.min(100, consumedPct) + '%';
  bar.classList.remove('warn', 'danger');
  if (consumedPct >= 95) bar.classList.add('danger');
  else if (consumedPct >= 75) bar.classList.add('warn');
  stats.innerHTML =
    '<span>Використано: <strong>' + formatNum(consumedUah) + ' грн</strong> (' + consumedPct.toFixed(0) + '%)</span>' +
    '<span>Витрачено: <strong style="color:#4ade80">' + formatNum(totalBoughtUah) + ' грн</strong> · Заплановано: <strong>' + formatNum(totalPlannedUah) + ' грн</strong></span>' +
    '<span>' + (remaining >= 0 ? 'Залишиться: <strong>' : 'Перевищення: <strong style="color:#f87171">') +
      formatNum(Math.abs(remaining)) + ' грн</strong></span>';
}

function _renderCategoryBreakdown(cm, currentItems, doneItems) {
  const card = document.getElementById('categoryBreakdownCard');
  const list = document.getElementById('categoryBreakdownList');
  const monthEl = document.getElementById('categoryBreakdownMonth');
  if (!card || !list) return;
  monthEl.textContent = '· ' + formatMonthKey(cm);

  const by = {}; // category → { icon, planned, bought }
  const pickIcon = catName => {
    for (const [ico, lbl] of Object.entries(PURCHASE_CATEGORY_LABELS)) {
      if (lbl === catName) return ico;
    }
    return '🏷';
  };
  const addPlanned = p => {
    if (isExcluded(p)) return;
    const cat = purchaseCategoryOf(p);
    const v = purchaseToUah(p.amount, purchaseCurOf(p));
    if (v == null) return;
    if (!by[cat]) by[cat] = { icon: pickIcon(cat), planned: 0, bought: 0 };
    by[cat].planned += v;
  };
  const addBought = p => {
    if (isExcluded(p)) return;
    if ((p.plannedMonth || '').slice(0, 7) !== cm && (p.boughtAt || '').slice(0, 7) !== cm) return;
    const cat = purchaseCategoryOf(p);
    const v = purchaseToUah(p.boughtAmount || p.amount, purchaseCurOf(p));
    if (v == null) return;
    if (!by[cat]) by[cat] = { icon: pickIcon(cat), planned: 0, bought: 0 };
    by[cat].bought += v;
  };
  currentItems.forEach(addPlanned);
  doneItems.forEach(p => { addBought(p); addPlanned(p); });

  const entries = Object.entries(by).sort(([, a], [, b]) => (b.planned + b.bought) - (a.planned + a.bought));
  if (!entries.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  const maxTotal = Math.max(1, ...entries.map(([, v]) => Math.max(v.planned, v.bought)));
  list.innerHTML = sanitize(entries.map(([name, v]) => {
    const pct = maxTotal > 0 ? (Math.max(v.planned, v.bought) / maxTotal) * 100 : 0;
    return '<div class="cat-row">' +
      '<div class="cat-row-icon">' + v.icon + '</div>' +
      '<div>' +
        '<div class="cat-row-name">' + esc(name) + '</div>' +
        '<div class="cat-row-progress"><div class="cat-row-progress-bar" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '</div>' +
      '<div class="cat-row-amounts">' +
        (v.bought > 0 ? '<span class="bought">' + formatShort(v.bought) + '</span> / ' : '') +
        formatShort(v.planned) + ' грн' +
      '</div>' +
    '</div>';
  }).join(''));
}

function _renderPurchasesToolbar(counts, categoryCounts) {
  const toolbar = document.getElementById('purchasesToolbar');
  const chipsEl = document.getElementById('purchasesChips');
  if (!toolbar || !chipsEl) return;
  toolbar.style.display = 'block';
  const chips = [
    { key: 'all',       label: 'Усі' },
    { key: 'overdue',   label: '⚠ Прострочено' },
    { key: 'current',   label: '📅 Цей місяць' },
    { key: 'future',    label: '🔜 Майбутнє' },
    { key: 'done',      label: '✓ Здійснено' },
    { key: 'shared',    label: '👥 Спільні' },
    { key: 'recurring', label: '🔁 Повторювані' }
  ];
  chipsEl.innerHTML = chips.map(c => {
    const n = counts[c.key] || 0;
    if (c.key !== 'all' && n === 0) return '';
    const active = _purchasesFilter === c.key;
    return '<button type="button" class="purchases-chip' + (active ? ' active' : '') + '" onclick="_setPurchasesFilter(\'' + c.key + '\')">' +
      c.label +
      (n ? '<span class="purchases-chip-count">' + n + '</span>' : '') +
      '</button>';
  }).join('');

  // Second row — category chips. Collapsed by default; "Категорії" toggles expansion.
  const catChipsEl = document.getElementById('purchasesCategoryChips');
  if (catChipsEl && categoryCounts) {
    const cats = Object.keys(categoryCounts).sort((a, b) => (categoryCounts[b] - categoryCounts[a]));
    if (cats.length) {
      const pickedIcon = name => {
        for (const [ico, lbl] of Object.entries(PURCHASE_CATEGORY_LABELS)) {
          if (lbl === name) return ico;
        }
        return '🏷';
      };
      const isAll = _purchasesCategory === 'all';
      const expanded = _purchasesCategoryExpanded;
      const caret = expanded ? '▴' : '▾';
      const buttons = [];
      // Main toggle button — always visible.
      buttons.push(
        '<button type="button" class="purchases-chip' + (isAll && !expanded ? ' active' : '') + '" onclick="_togglePurchasesCategoryList()">🏷 Категорії ' + caret + '</button>'
      );
      // When collapsed and a category is active, show it as a pill with ✕ to clear.
      if (!expanded && !isAll) {
        buttons.push(
          '<button type="button" class="purchases-chip active" onclick="_setPurchasesCategory(\'all\')" title="Зняти фільтр">' +
            pickedIcon(_purchasesCategory) + ' ' + esc(_purchasesCategory) +
            ' <span style="opacity:0.7;margin-left:4px">✕</span>' +
          '</button>'
        );
      }
      // Expanded list — "Усі категорії" + per-category.
      if (expanded) {
        buttons.push(
          '<button type="button" class="purchases-chip' + (isAll ? ' active' : '') + '" onclick="_setPurchasesCategory(\'all\')">Усі категорії</button>'
        );
        cats.forEach(name => {
          buttons.push(
            '<button type="button" class="purchases-chip' + (_purchasesCategory === name ? ' active' : '') + '" onclick="_setPurchasesCategory(\'' + name.replace(/'/g, '\\\'') + '\')">' +
              pickedIcon(name) + ' ' + esc(name) +
              '<span class="purchases-chip-count">' + categoryCounts[name] + '</span>' +
            '</button>'
          );
        });
      }
      catChipsEl.innerHTML = buttons.join('');
      catChipsEl.style.display = '';
    } else {
      catChipsEl.style.display = 'none';
    }
  }

  // Sync input value + clear-btn visibility (without stealing focus).
  const input = document.getElementById('purchasesSearchInput');
  if (input && input.value !== _purchasesSearchQuery && document.activeElement !== input) {
    input.value = _purchasesSearchQuery;
  }
  const clearBtn = document.getElementById('purchasesSearchClear');
  if (clearBtn) clearBtn.style.display = _purchasesSearchQuery ? '' : 'none';
}

function _purchasesOnSearchInput() {
  const input = document.getElementById('purchasesSearchInput');
  if (!input) return;
  const val = input.value;
  if (_purchasesSearchDebounce) clearTimeout(_purchasesSearchDebounce);
  _purchasesSearchDebounce = setTimeout(() => {
    _purchasesSearchQuery = val;
    renderPurchases();
  }, 120);
}

function _purchasesClearSearch() {
  _purchasesSearchQuery = '';
  const input = document.getElementById('purchasesSearchInput');
  if (input) { input.value = ''; input.focus(); }
  renderPurchases();
}

function _setPurchasesFilter(name) {
  _purchasesFilter = name;
  renderPurchases();
}

function _setPurchasesCategory(name) {
  _purchasesCategory = name;
  _purchasesCategoryExpanded = false; // collapse after a choice is made
  renderPurchases();
}

function _togglePurchasesCategoryList() {
  _purchasesCategoryExpanded = !_purchasesCategoryExpanded;
  renderPurchases();
}

function _togglePurchaseGroup(key) {
  _purchasesCollapsed[key] = !_purchasesCollapsed[key];
  renderPurchases();
}

function _toggleDoneMonth(mk) {
  const cm = currentMonthKey();
  // If not yet explicitly toggled, initialize to the default (current month open).
  if (_purchasesDoneMonthsOpen[mk] === undefined) _purchasesDoneMonthsOpen[mk] = (mk === cm);
  _purchasesDoneMonthsOpen[mk] = !_purchasesDoneMonthsOpen[mk];
  renderPurchases();
}

function _purchasesResetFilters() {
  _purchasesFilter = 'all';
  _purchasesSearchQuery = '';
  _purchasesCategory = 'all';
  _purchasesCategoryExpanded = false;
  const input = document.getElementById('purchasesSearchInput');
  if (input) input.value = '';
  renderPurchases();
}

async function savePurchasesToFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('purchases');
    const localIds = new Set(purchaseItems.map(p => String(p.id)));
    const ops = [];
    if (purchasesLoaded) {
      const existing = await ref.get();
      existing.forEach(doc => { if (!localIds.has(doc.id)) ops.push(doc.ref.delete()); });
    }
    const clean = (typeof stripUndefined === 'function') ? stripUndefined : (x => x);
    purchaseItems.forEach(p => ops.push(ref.doc(String(p.id)).set(clean(p))));
    if (ops.length) await Promise.all(ops);
  } catch(e) { console.warn('Purchases save failed:', e); }
}

async function loadPurchasesFromFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(effectiveUid(currentUser.uid)).collection('purchases');
    const snap = await ref.get();
    const remote = [];
    snap.forEach(doc => remote.push(doc.data()));
    const remoteIds = new Set(remote.map(p => String(p.id)));
    const localOnly = purchaseItems.filter(p => !remoteIds.has(String(p.id)));
    purchaseItems = [...remote, ...localOnly];
    purchasesLoaded = true;
    renderPurchases();
    if (localOnly.length) savePurchasesToFirestore();
  } catch(e) { console.warn('Purchases load failed:', e); }
}

// Shared purchases live in a root collection /sharedPurchases and use the
// REAL uid (not the dev suffix) because collaboration is cross-user.
function startSharedPurchasesListener() {
  if (!firebaseReady || !currentUser) return;
  stopSharedPurchasesListener();
  try {
    const q = db.collection('sharedPurchases').where('members', 'array-contains', currentUser.uid);
    sharedPurchasesUnsubscribe = q.onSnapshot(snap => {
      sharedPurchaseItems = [];
      snap.forEach(doc => sharedPurchaseItems.push({ ...doc.data(), id: doc.id }));
      renderPurchases();
      // If detail page is open for a shared purchase, re-render so newly
      // accepted invites or added members show up live.
      if (_openPurchaseDetailId) {
        const still = sharedPurchaseItems.some(x => String(x.id) === String(_openPurchaseDetailId));
        const detail = document.getElementById('purchaseDetail');
        if (still && detail && detail.style.display !== 'none') {
          openPurchaseDetail(_openPurchaseDetailId);
        }
      }
    }, err => console.warn('Shared purchases listener failed:', err));
  } catch(e) { console.warn('Shared purchases listener setup failed:', e); }
}

function stopSharedPurchasesListener() {
  if (sharedPurchasesUnsubscribe) {
    try { sharedPurchasesUnsubscribe(); } catch(_) {}
    sharedPurchasesUnsubscribe = null;
  }
  sharedPurchaseItems = [];
}

// Convert a private purchase into a shared document. Returns share URL on success.
async function makePurchaseShared(id) {
  if (!firebaseReady || !currentUser) return null;
  const idx = purchaseItems.findIndex(p => String(p.id) === String(id));
  if (idx === -1) return null;
  const item = purchaseItems[idx];
  const myUid = currentUser.uid;
  const myEmail = currentUser.email || '';
  const newId = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 8);
  const sharedData = {
    ...item,
    id: newId,
    members: [myUid],
    memberEmails: { [myUid]: myEmail },
    ownerUid: myUid,
    sharedAt: new Date().toISOString()
  };
  try {
    const clean = (typeof stripUndefined === 'function') ? stripUndefined(sharedData) : sharedData;
    await db.collection('sharedPurchases').doc(newId).set(clean);
    // Remove from private list and persist
    purchaseItems.splice(idx, 1);
    await savePurchasesToFirestore();
    return window.location.origin + window.location.pathname + '?share=' + newId;
  } catch(e) {
    console.warn('Share failed:', e);
    alert('Не вдалося створити спільну витрату: ' + e.message);
    return null;
  }
}

// Accept an invite from URL ?share=<id>
async function acceptShareInvite(shareId) {
  if (!firebaseReady || !currentUser) {
    alert('Увійдіть у свій акаунт, щоб прийняти спільну витрату.');
    return;
  }
  try {
    const docRef = db.collection('sharedPurchases').doc(shareId);
    const doc = await docRef.get();
    if (!doc.exists) { alert('Посилання недійсне або спільну витрату видалено.'); return; }
    const data = doc.data();
    const members = data.members || [];
    const myEmail = (currentUser.email || '').toLowerCase();
    // Mark any pending invitation for this email as accepted by this user
    const existingInvites = Array.isArray(data.invitations) ? data.invitations : [];
    const updatedInvites = existingInvites.map(inv => {
      if (!inv || inv.status === 'accepted') return inv;
      if (String(inv.email || '').toLowerCase() !== myEmail) return inv;
      return { ...inv, status: 'accepted', acceptedAt: new Date().toISOString(), acceptedByUid: currentUser.uid };
    });
    const invitesChanged = JSON.stringify(existingInvites) !== JSON.stringify(updatedInvites);
    if (members.includes(currentUser.uid)) {
      // Already a member — still sync invitation status if it was pending
      if (invitesChanged) {
        try { await docRef.update({ invitations: updatedInvites }); } catch(_) {}
      }
      alert('Ви вже учасник цієї витрати.');
    } else {
      const ownerEmail = (data.memberEmails && data.memberEmails[data.ownerUid]) || 'іншого користувача';
      if (!await uiConfirm(`${ownerEmail} запрошує вас до спільної витрати:\n\n${data.icon || '🛒'} ${data.name}\n\nПрийняти?`, { okText: 'Прийняти' })) return;
      const update = {
        members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      };
      update['memberEmails.' + currentUser.uid] = currentUser.email || '';
      if (invitesChanged) update.invitations = updatedInvites;
      await docRef.update(update);
      alert('✓ Спільну витрату додано до вашого списку.');
    }
  } catch(e) {
    console.warn('Accept invite failed:', e);
    alert('Не вдалося прийняти: ' + e.message);
  }
  // Clean the URL
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    window.history.replaceState({}, '', url.toString());
  } catch(_) {}
  // Switch to purchases tab
  const btn = document.querySelector('.main-tab[onclick*="\'purchases\'"]');
  if (btn && typeof switchMainTab === 'function') switchMainTab('purchases', btn);
}

// Process ?share= query param once on auth bootstrap.
let _shareInviteProcessed = false;
function processShareInviteOnBoot() {
  if (_shareInviteProcessed) return;
  try {
    const url = new URL(window.location.href);
    const shareId = url.searchParams.get('share');
    if (!shareId) return;
    _shareInviteProcessed = true;
    // Delay slightly so auth + UI finish bootstrap
    setTimeout(() => acceptShareInvite(shareId), 800);
  } catch(_) {}
}

// Convert private → shared and open the invite dialog in one action.
async function promptMakeShared(id) {
  const found = _findPurchase(id);
  if (!found || found.source !== 'private') return;
  if (!await uiConfirm('Зробити «' + found.item.name + '» спільною витратою?\n\nІнші користувачі зможуть її бачити і редагувати за посиланням.', { okText: 'Зробити спільною' })) return;
  const shareUrl = await makePurchaseShared(id);
  if (!shareUrl) return;
  // Wait a moment for onSnapshot to deliver the new shared doc into the list.
  setTimeout(() => {
    const shareId = shareUrl.split('?share=')[1];
    invitePurchaseByEmail(shareId);
  }, 400);
}

// Invite flow: collect target email, call backend to dispatch via Telegram or email.
async function invitePurchaseByEmail(shareId) {
  const found = _findPurchase(shareId);
  if (!found || found.source !== 'shared') { alert('Витрата не є спільною.'); return; }
  const item = found.item;
  const emailRaw = await uiPrompt('Email учасника для запрошення:', {
    title: '👥 Запросити до спільної витрати',
    placeholder: 'name@example.com',
    okText: 'Запросити'
  });
  if (emailRaw === null) return;
  const email = String(emailRaw).trim();
  if (!email) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Некоректний email.'); return; }
  const shareUrl = window.location.origin + window.location.pathname + '?share=' + shareId;
  try {
    const res = await adminlikeApiFetch('/invite/purchase', {
      email,
      share_url: shareUrl,
      purchase_name: item.name,
      purchase_icon: item.icon || '🛒',
      sender_name: (currentUser && currentUser.displayName) || '',
      sender_email: (currentUser && currentUser.email) || ''
    });
    const body = await res.json().catch(() => ({}));
    if (body && body.ok) {
      const ch = body.channel === 'telegram' ? 'Telegram' : 'Email';
      await _recordPurchaseInvitation(shareId, email, body.channel || 'email');
      alert('✓ Запрошення надіслано через ' + ch + '.');
    } else {
      const msg = (body && body.description) || 'Користувача з таким email не знайдено на платформі.';
      if (await uiConfirm(msg + '\n\nСкопіювати посилання і надіслати вручну?', { okText: 'Копіювати' })) {
        await _recordPurchaseInvitation(shareId, email, 'manual');
        _copyToClipboard(shareUrl);
        alert('Посилання скопійовано.');
      }
    }
  } catch(e) {
    if (await uiConfirm('Сервер недоступний. Скопіювати посилання і надіслати вручну?', { okText: 'Копіювати' })) {
      await _recordPurchaseInvitation(shareId, email, 'manual');
      _copyToClipboard(shareUrl);
      alert('Посилання скопійовано.');
    }
  }
}

// Append an invitation record to /sharedPurchases/{shareId}.invitations[].
// Keeps one entry per email — resends refresh sentAt/channel instead of duplicating.
async function _recordPurchaseInvitation(shareId, email, channel) {
  if (!firebaseReady || !currentUser) return;
  try {
    const docRef = db.collection('sharedPurchases').doc(String(shareId));
    const snap = await docRef.get();
    if (!snap.exists) return;
    const data = snap.data();
    const existing = Array.isArray(data.invitations) ? data.invitations.slice() : [];
    const normalized = String(email || '').trim().toLowerCase();
    const idx = existing.findIndex(inv => inv && String(inv.email || '').toLowerCase() === normalized);
    const nowIso = new Date().toISOString();
    if (idx === -1) {
      existing.push({
        email,
        sentAt: nowIso,
        channel: channel || 'email',
        status: 'pending',
        invitedByUid: currentUser.uid,
        invitedByEmail: currentUser.email || ''
      });
    } else if (existing[idx].status !== 'accepted') {
      existing[idx] = {
        ...existing[idx],
        email,
        sentAt: nowIso,
        channel: channel || existing[idx].channel || 'email',
        invitedByUid: existing[idx].invitedByUid || currentUser.uid,
        invitedByEmail: existing[idx].invitedByEmail || currentUser.email || ''
      };
    }
    await docRef.update({ invitations: existing });
  } catch(e) { console.warn('Record invitation failed:', e); }
}

function adminlikeApiFetch(path, data) {
  const apiBase = typeof NOTIFY_API_BASE !== 'undefined' ? NOTIFY_API_BASE : '';
  const apiKey = typeof NOTIFY_API_KEY !== 'undefined' ? NOTIFY_API_KEY : '';
  return fetch(apiBase + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(data)
  });
}

function _copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(_) {}
    ta.remove();
  }
}

// Open a detail page for a shared or private purchase. Shows full info,
// member list with acceptance state, and invitation log with statuses.
function openPurchaseDetail(id) {
  const found = _findPurchase(id);
  if (!found) return;
  const p = found.item;
  const isShared = found.source === 'shared';
  const cc = purchaseCurOf(p);
  const amountStr = fmtPurchaseAmount(p.amount, cc);
  const uahEq = (cc !== 'UAH' && purchaseToUah(p.amount, cc) !== null)
    ? ' <span style="color:#64748b;font-size:12px">≈ ' + formatNum(purchaseToUah(p.amount, cc)) + ' грн</span>'
    : '';

  // Members section (shared only)
  let membersHtml = '';
  if (isShared) {
    const members = Array.isArray(p.members) ? p.members : [];
    const emails = p.memberEmails || {};
    const ownerUid = p.ownerUid;
    const rows = members.map(uid => {
      const email = emails[uid] || '(без email)';
      const isOwner = uid === ownerUid;
      const isMe = currentUser && uid === currentUser.uid;
      const badges = [];
      if (isOwner) badges.push('<span style="background:rgba(168,85,247,0.15);color:#c084fc;padding:2px 8px;border-radius:10px;font-size:11px">автор</span>');
      if (isMe && !isOwner) badges.push('<span style="background:rgba(96,165,250,0.15);color:#60a5fa;padding:2px 8px;border-radius:10px;font-size:11px">це ви</span>');
      return '<div class="detail-info-row">' +
        '<span class="detail-info-label">👤 ' + esc(email) + '</span>' +
        '<span class="detail-info-value">' + badges.join(' ') + '</span>' +
        '</div>';
    }).join('');
    membersHtml = '<div class="a-card"><h3>Учасники (' + members.length + ')</h3>' +
      (rows || '<p style="color:#94a3b8;font-size:13px">Поки лише ви</p>') + '</div>';
  }

  // Invitations section (shared only)
  let invitesHtml = '';
  if (isShared) {
    const invites = Array.isArray(p.invitations) ? p.invitations.slice() : [];
    // Hide invitations that were accepted by someone already in members list AND shown above —
    // but keep them visible so the inviter can see history. We show all but mark accepted.
    invites.sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
    if (invites.length) {
      const chLabel = c => c === 'telegram' ? 'Telegram' : (c === 'manual' ? 'вручну' : 'Email');
      const rows = invites.map(inv => {
        const when = inv.sentAt ? new Date(inv.sentAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        let badge;
        if (inv.status === 'accepted') {
          const accWhen = inv.acceptedAt ? new Date(inv.acceptedAt).toLocaleDateString('uk-UA') : '';
          badge = '<span style="background:rgba(74,222,128,0.15);color:#4ade80;padding:2px 8px;border-radius:10px;font-size:11px">✓ прийняв' + (accWhen ? ' · ' + accWhen : '') + '</span>';
        } else {
          badge = '<span style="background:rgba(251,191,36,0.15);color:#fbbf24;padding:2px 8px;border-radius:10px;font-size:11px">⏳ очікує</span>';
        }
        return '<div style="padding:10px 0;border-bottom:1px solid #1e293b">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
            '<span style="color:#e2e8f0">📨 ' + esc(inv.email || '') + '</span>' +
            badge +
          '</div>' +
          '<div style="color:#64748b;font-size:12px;margin-top:4px">' + esc(chLabel(inv.channel)) + ' · ' + when + '</div>' +
          '</div>';
      }).join('');
      invitesHtml = '<div class="a-card"><h3>Запрошення (' + invites.length + ')</h3>' + rows + '</div>';
    } else {
      invitesHtml = '<div class="a-card"><h3>Запрошення</h3><p style="color:#94a3b8;font-size:13px;margin:0">Ще нікого не запрошено.</p></div>';
    }
  }

  // Status line
  let statusBadge;
  if (p.bought) {
    const accStr = p.boughtAmount && p.boughtAmount !== p.amount
      ? 'Здійснено за ' + fmtPurchaseAmount(p.boughtAmount, cc)
      : 'Здійснено';
    const boughtDate = p.boughtAt ? ' · ' + new Date(p.boughtAt).toLocaleDateString('uk-UA') : '';
    statusBadge = '<span class="p-item-type" style="background:rgba(74,222,128,0.15);color:#4ade80">✓ ' + esc(accStr) + esc(boughtDate) + '</span>';
  } else {
    const cm = currentMonthKey();
    const pm = p.plannedMonth || cm;
    if (pm < cm) statusBadge = '<span class="p-item-type" style="background:rgba(248,113,113,0.15);color:#f87171">прострочено</span>';
    else if (pm === cm) statusBadge = '<span class="p-item-type" style="background:rgba(96,165,250,0.15);color:#60a5fa">цей місяць</span>';
    else statusBadge = '<span class="p-item-type" style="background:rgba(148,163,184,0.15);color:#94a3b8">на майбутнє</span>';
  }
  const deferBadge = p.deferCount ? '<span class="p-item-type" style="background:rgba(251,191,36,0.15);color:#fbbf24;margin-left:6px">перенесено ×' + p.deferCount + '</span>' : '';

  // Action buttons: primary actions in one row, the destructive action on its
  // own subtle row so the layout reads as "intentional" rather than wrapped.
  const primaryActions = [];
  if (!p.bought) {
    primaryActions.push('<button class="btn-save" onclick="markPurchaseBought(\'' + p.id + '\');closePurchaseDetail()" style="width:auto;padding:8px 16px;margin:0">✓ Відмітити</button>');
  } else {
    primaryActions.push('<button class="btn-export" onclick="unmarkPurchaseBought(\'' + p.id + '\');closePurchaseDetail()" style="width:auto;padding:8px 16px;margin:0">↺ Скасувати позначку</button>');
  }
  if (isShared) {
    primaryActions.push('<button class="btn-export" onclick="invitePurchaseByEmail(\'' + p.id + '\')" style="width:auto;padding:8px 16px;margin:0">👥 Запросити</button>');
  } else {
    primaryActions.push('<button class="btn-export" onclick="promptMakeShared(\'' + p.id + '\')" style="width:auto;padding:8px 16px;margin:0">👥 Зробити спільною</button>');
  }
  primaryActions.push('<button class="btn-export" onclick="sharePurchase(\'' + p.id + '\')" style="width:auto;padding:8px 16px;margin:0">↗ Поділитись</button>');
  if (!p.bought) {
    primaryActions.push('<button class="btn-export" onclick="editPurchaseFromDetail(\'' + p.id + '\')" style="width:auto;padding:8px 16px;margin:0">✎ Редагувати</button>');
  }
  const dangerAction = '<button class="btn-clear" onclick="confirmThen(\'' + (isShared ? 'Покинути спільну витрату?' : 'Видалити витрату?') + '\', () => { deletePurchase(\'' + p.id + '\'); closePurchaseDetail(); }, { danger: true, okText: \'' + (isShared ? 'Покинути' : 'Видалити') + '\' })" style="width:auto;padding:8px 16px;margin:0">✕ ' + (isShared ? 'Покинути' : 'Видалити') + '</button>';

  _openPurchaseDetailId = String(p.id);
  document.getElementById('purchasesContent').style.display = 'none';
  const detail = document.getElementById('purchaseDetail');
  detail.style.display = 'block';

  const sharedBadge = isShared
    ? '<span class="p-item-type" style="background:rgba(168,85,247,0.15);color:#c084fc;margin-left:6px">👥 Спільна (' + (Array.isArray(p.members) ? p.members.length : 0) + ')</span>'
    : '';

  detail.querySelector('#purchaseDetailContent').innerHTML = sanitize(`
    <div class="dash-hero">
      <div class="dash-hero-label"><span class="dream-icon-hero">${purchaseIconOf(p)}</span>${esc(p.name)}</div>
      <div class="dash-hero-value">${amountStr}</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:4px">${uahEq}</div>
      <div style="margin-top:10px">${statusBadge}${deferBadge}${sharedBadge}</div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;flex-wrap:wrap">
        ${primaryActions.join('')}
      </div>
      <div style="display:flex;justify-content:center;margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,0.15)">
        ${dangerAction}
      </div>
    </div>

    <div class="a-card">
      <h3>Деталі</h3>
      <div class="detail-info-row"><span class="detail-info-label">Сума</span><span class="detail-info-value">${amountStr}${uahEq}</span></div>
      <div class="detail-info-row"><span class="detail-info-label">${p.plannedDate ? 'Запланована дата' : 'Запланований місяць'}</span><span class="detail-info-value">${formatPurchaseWhen(p)}</span></div>
      ${p.deferCount ? '<div class="detail-info-row"><span class="detail-info-label">Перенесень</span><span class="detail-info-value">' + p.deferCount + '</span></div>' : ''}
      ${p.bought && p.boughtAt ? '<div class="detail-info-row"><span class="detail-info-label">Позначено як здійснена</span><span class="detail-info-value">' + new Date(p.boughtAt).toLocaleDateString('uk-UA') + '</span></div>' : ''}
      ${p.bought && p.boughtAmount && p.boughtAmount !== p.amount ? '<div class="detail-info-row"><span class="detail-info-label">Фактична сума</span><span class="detail-info-value">' + fmtPurchaseAmount(p.boughtAmount, cc) + '</span></div>' : ''}
      ${p.link ? '<div class="detail-info-row"><span class="detail-info-label">Посилання</span><span class="detail-info-value"><a href="' + esc(p.link) + '" target="_blank" rel="noopener noreferrer" class="purchase-link">🔗 ' + esc(p.link.length > 50 ? p.link.slice(0, 47) + '…' : p.link) + '</a></span></div>' : ''}
      ${isShared && p.sharedAt ? '<div class="detail-info-row"><span class="detail-info-label">Створено як спільна</span><span class="detail-info-value">' + new Date(p.sharedAt).toLocaleDateString('uk-UA') + '</span></div>' : ''}
      ${p.notes ? '<div class="detail-info-row" style="flex-direction:column;align-items:flex-start;gap:6px"><span class="detail-info-label">Нотатки</span><span class="detail-info-value" style="white-space:pre-wrap;text-align:left">' + esc(p.notes) + '</span></div>' : ''}
    </div>

    ${membersHtml}
    ${invitesHtml}
  `);

  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closePurchaseDetail() {
  _openPurchaseDetailId = null;
  const detail = document.getElementById('purchaseDetail');
  if (detail) detail.style.display = 'none';
  const content = document.getElementById('purchasesContent');
  if (content) content.style.display = 'block';
  renderPurchases();
}

function editPurchaseFromDetail(id) {
  closePurchaseDetail();
  editPurchase(id);
}

// ==================== CREDIT CALCULATOR =========================
// ================================================================

let creditChartInstance = null;

function calculateCredit() {
  const amount = parseNum(document.getElementById('creditAmount').value);
  const rate = parseNum(document.getElementById('creditRate').value);
  const months = parseInt(document.getElementById('creditMonths').value);
  const down = parseNum(document.getElementById('creditDown').value) || 0;

  if (isNaN(amount) || amount <= 0 || isNaN(rate) || rate <= 0 || isNaN(months) || months <= 0) return;

  const principal = amount - down;
  if (principal <= 0) return;

  const monthlyRate = rate / 100 / 12;

  // Annuity formula: M = P * r * (1+r)^n / ((1+r)^n - 1)
  const pow = Math.pow(1 + monthlyRate, months);
  const monthly = principal * monthlyRate * pow / (pow - 1);
  const totalPay = monthly * months;
  const overpay = totalPay - principal;
  const effRate = (overpay / principal) * 100;

  document.getElementById('creditMonthly').textContent = formatNum(monthly) + ' грн';
  document.getElementById('creditTotalPay').textContent = formatNum(totalPay) + ' грн';
  document.getElementById('creditOverpay').textContent = '+' + formatNum(overpay) + ' грн';
  document.getElementById('creditEffRate').textContent = effRate.toFixed(1) + '%';
  document.getElementById('creditResults').style.display = 'block';

  // Build schedule
  const schedule = [];
  let balance = principal;
  let totalInterest = 0;
  let totalPrincipal = 0;
  const labels = [];
  const principalLine = [];
  const interestLine = [];
  const balanceLine = [];

  for (let i = 1; i <= months; i++) {
    const interest = balance * monthlyRate;
    const princPart = monthly - interest;
    balance -= princPart;
    if (balance < 0) balance = 0;
    totalInterest += interest;
    totalPrincipal += princPart;

    schedule.push({
      month: i,
      payment: monthly,
      principal: princPart,
      interest: interest,
      balance: balance
    });

    labels.push(i);
    principalLine.push(Math.round(princPart));
    interestLine.push(Math.round(interest));
    balanceLine.push(Math.round(balance));
  }

  // Chart
  const canvas = document.getElementById('creditChart');
  if (canvas && typeof Chart !== 'undefined') {
    if (creditChartInstance) creditChartInstance.destroy();
    const _isLightCr = document.documentElement.getAttribute('data-theme-effective') === 'light';
    const _gridCr = _isLightCr ? '#e2e8f0' : '#1e293b';
    const _tickCr = _isLightCr ? '#475569' : '#64748b';
    const _legCr = _isLightCr ? '#334155' : '#94a3b8';
    const _titleCr = _isLightCr ? '#334155' : '#475569';
    creditChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Тіло кредиту',
            data: principalLine,
            backgroundColor: '#3b82f6',
            borderRadius: 2,
          },
          {
            label: 'Відсотки',
            data: interestLine,
            backgroundColor: '#f87171',
            borderRadius: 2,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: _legCr, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label + ': ' + formatShort(ctx.raw) + ' грн'
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: _tickCr, font: { size: 10 } },
            grid: { display: false },
            title: { display: true, text: 'Місяць', color: _titleCr, font: { size: 11 } }
          },
          y: {
            stacked: true,
            ticks: { color: _tickCr, font: { size: 10 }, callback: v => formatShort(v) },
            grid: { color: _gridCr }
          }
        }
      }
    });
  }

  // Schedule table
  const scheduleEl = document.getElementById('creditSchedule');
  scheduleEl.innerHTML = `<table class="credit-schedule-table">
    <thead><tr>
      <th>Міс.</th><th>Платіж</th><th>Тіло</th><th>Відсотки</th><th>Залишок</th>
    </tr></thead>
    <tbody>${schedule.map(s => `<tr>
      <td>${s.month}</td>
      <td>${formatNum(s.payment)}</td>
      <td class="cr-principal">${formatNum(s.principal)}</td>
      <td class="cr-interest">${formatNum(s.interest)}</td>
      <td class="cr-balance">${formatNum(s.balance)}</td>
    </tr>`).join('')}
    <tr style="font-weight:700;border-top:2px solid #334155">
      <td>Всього</td>
      <td>${formatNum(totalPay)}</td>
      <td class="cr-principal">${formatNum(totalPrincipal)}</td>
      <td class="cr-interest">${formatNum(totalInterest)}</td>
      <td>—</td>
    </tr></tbody></table>`;
}

function clearCredit() {
  document.getElementById('creditAmount').value = '';
  document.getElementById('creditRate').value = '';
  document.getElementById('creditMonths').value = '';
  document.getElementById('creditDown').value = '';
  document.getElementById('creditResults').style.display = 'none';
  if (creditChartInstance) { creditChartInstance.destroy(); creditChartInstance = null; }
}

function toggleCreditSchedule() {
  const el = document.getElementById('creditSchedule');
  const btn = document.getElementById('btnCreditSchedule');
  if (el.style.display === 'none') {
    el.style.display = 'block';
    btn.textContent = 'Сховати';
  } else {
    el.style.display = 'none';
    btn.textContent = 'Показати';
  }
}

function updateCreditCalcVisibility() {
  const section = document.getElementById('creditCalcSection');
  if (section) {
    section.style.display = (typeof currentUser !== 'undefined' && currentUser) ? 'block' : 'none';
  }
}

// ================================================================
// ==================== INITIALIZATION ============================
// ================================================================

// Set default dates for portfolio form
(function() {
  const t = new Date();
  const pds = document.getElementById('pDateStart');
  const pde = document.getElementById('pDateEnd');
  if (pds) pds.value = t.toISOString().split('T')[0];
  if (pde) {
    const f = new Date(t); f.setMonth(f.getMonth() + 3);
    pde.value = f.toISOString().split('T')[0];
  }
})();

// loadFromStorage called here, Firebase init happens in firebase.js after it loads
loadFromStorage();

// Initialize calculator type-dependent field visibility
if (document.getElementById('calcType')) toggleCalcTypeFields();

// ---- Form draft registration ----
// Register every form once. FormDrafts will auto-persist user input and
// protect against losing unsaved edits when the user switches tabs, closes
// the form, or reloads the page.
if (typeof FormDrafts !== 'undefined') {
  FormDrafts.register('portfolio.form', [
    'pName', 'pType', 'pBondPrice', 'pBondCount', 'pInvested', 'pRate',
    'pIndex', 'pDateStart', 'pDateEnd', 'pTax', 'pBank', 'pNotes', 'pCompound',
    'pReceivedAtMaturity', 'pCashCurrency'
  ]);
  FormDrafts.register('dream.form', [
    'dreamName', 'dreamTarget', 'dreamSaved', 'dreamMonthly',
    'dreamDateStart', 'dreamDateEnd', 'dreamNotes', 'dreamCurrency', 'dreamIcon'
  ]);
  FormDrafts.register('saving.form', [
    'savingName', 'savingAmount', 'savingCurrency', 'savingNotes', 'savingDreamId'
  ]);
  FormDrafts.register('purchase.form', [
    'purchaseName', 'purchaseAmount', 'purchaseCurrency', 'purchaseDate',
    'purchaseLink', 'purchaseNotes', 'purchaseIcon'
  ]);
  FormDrafts.register('profile', [
    'profileDisplayName', 'profileContactEmail', 'profilePhone'
  ]);
  FormDrafts.register('calc', [
    'calcType', 'bondName', 'bondPrice', 'bondCount', 'invested', 'annualRateInput',
    'dateStart', 'dateEnd', 'received', 'diffAmount', 'bonusPercent',
    'compoundCheck', 'compoundRate', 'compoundTax', 'compoundYears', 'compoundIndex'
  ]);
  FormDrafts.register('credit', [
    'creditAmount', 'creditRate', 'creditMonths', 'creditDown'
  ]);
}

// Restore last active tab
(function() {
  const saved = localStorage.getItem('activeTab');
  if (!saved) return;
  const btn = document.querySelector('.main-tab[onclick*="\'' + saved + '\'"]');
  if (btn) switchMainTab(saved, btn);
  else if (saved === 'profile') switchMainTab('profile', null);
})();
