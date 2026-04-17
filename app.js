// ============ SHARED GLOBALS (used across app.js, firebase.js, telegram.js) ============
var _skipFirestoreSync = false;

// ============ GLOBAL SEARCH ============
function onGlobalSearch() {
  const q = document.getElementById('globalSearchInput').value.toLowerCase().trim();
  const resultsEl = document.getElementById('globalSearchResults');
  const clearBtn = document.getElementById('globalSearchClear');

  clearBtn.style.display = q ? 'block' : 'none';

  if (!q || q.length < 2) {
    resultsEl.style.display = 'none';
    return;
  }

  const results = [];

  // Search portfolio items
  if (typeof portfolioItems !== 'undefined') {
    portfolioItems.forEach(p => {
      const match = (p.name || '').toLowerCase().includes(q) ||
                    (p.bank || '').toLowerCase().includes(q) ||
                    (p.notes || '').toLowerCase().includes(q);
      if (match) {
        results.push({
          icon: '💼',
          title: p.name,
          sub: formatShort(p.invested) + ' грн · ' + (p.dateEnd || ''),
          badge: 'Портфель',
          badgeClass: 'search-badge-portfolio',
          action: () => { goToTab('portfolio'); openInvestmentDetail(String(p.id)); clearGlobalSearch(); }
        });
      }
    });
  }

  // Search saved records (calculation history)
  if (typeof savedRecords !== 'undefined') {
    savedRecords.forEach(r => {
      const match = (r.name || '').toLowerCase().includes(q);
      if (match) {
        results.push({
          icon: '📊',
          title: r.name,
          sub: formatShort(r.invested) + ' → ' + formatShort(r.received) + ' грн · ' + r.annualRate.toFixed(1) + '%',
          badge: 'Історія',
          badgeClass: 'search-badge-history',
          action: () => { goToTab('calc'); loadRecordToForm(r); clearGlobalSearch(); }
        });
      }
    });
  }

  // Search currencies
  if (cachedRatesArray) {
    cachedRatesArray.forEach(r => {
      const match = r.cc.toLowerCase().includes(q) || r.txt.toLowerCase().includes(q);
      if (match && results.filter(x => x.badgeClass === 'search-badge-currency').length < 5) {
        results.push({
          icon: '💱',
          title: r.cc + ' — ' + r.txt,
          sub: r.rate.toFixed(4) + ' грн',
          badge: 'Валюта',
          badgeClass: 'search-badge-currency',
          action: () => { goToTab('currencies'); clearGlobalSearch(); }
        });
      }
    });
  }

  // Navigation shortcuts
  const navItems = [
    { keywords: ['портфель', 'portfolio', 'вклад', 'інвест'], title: 'Портфель', icon: '💼', tab: 'portfolio' },
    { keywords: ['калькулятор', 'calculator', 'розрах'], title: 'Калькулятор', icon: '🧮', tab: 'calc' },
    { keywords: ['аналітик', 'analytics', 'рейтинг', 'комбін'], title: 'Аналітика', icon: '📈', tab: 'analytics' },
    { keywords: ['валют', 'курс', 'dollar', 'євро', 'usd', 'eur', 'currency'], title: 'Валюти', icon: '💱', tab: 'currencies' },
    { keywords: ['профіль', 'profile', 'налашт', 'settings', 'telegram', 'мова'], title: 'Профіль', icon: '⚙️', tab: 'profile' },
  ];
  navItems.forEach(nav => {
    if (nav.keywords.some(k => k.includes(q) || q.includes(k))) {
      results.push({
        icon: nav.icon,
        title: nav.title,
        sub: 'Перейти до розділу',
        badge: 'Розділ',
        badgeClass: 'search-badge-nav',
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
    // Store action callbacks
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
  if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html, { ADD_ATTR: ['onclick', 'style', 'data-cc', 'data-name'] });
  return html;
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin + '_invest_ua_salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ TAB SWITCHING ============
function switchMainTab(tab, btn) {
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
  localStorage.setItem('activeTab', tab);
  if (tab === 'analytics') checkAnalyticsReady();
  if (tab === 'portfolio') updatePortfolioUI();
  if (tab === 'currencies') loadCurrenciesPage();
  if (tab === 'dreams') updateDreamsUI();
  if (tab === 'profile') { updateProfileUI(); renderDashboardCurrencySettings(); }
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
 'creditAmount', 'creditRate', 'creditDown'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => formatInput(el));
});

// ============ PORTFOLIO BOND FIELDS REACTIVE ============
['pBondPrice', 'pBondCount'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const price = parseNum(document.getElementById('pBondPrice').value);
    const count = parseNum(document.getElementById('pBondCount').value);
    if (!isNaN(price) && !isNaN(count) && price > 0 && count > 0) {
      document.getElementById('pInvested').value = formatNum(price * count);
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
      setAutoVal('invested', price * count);
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

  // Hide bond-specific fields in compound mode
  const bondFields = ['fieldBondName', 'fieldBondPrice', 'fieldBondCount', 'fieldReceived', 'fieldDiff'];
  bondFields.forEach(id => {
    document.getElementById(id).style.display = isCompound ? 'none' : '';
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
              borderColor: '#f59e0b',
              borderDash: [6, 3],
              pointRadius: 2,
              pointBackgroundColor: '#f59e0b',
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
            legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' + formatShort(ctx.raw) + ' грн'
              }
            }
          },
          scales: {
            x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } },
            y: {
              ticks: {
                color: '#64748b',
                font: { size: 10 },
                callback: v => formatShort(v)
              },
              grid: { color: '#1e293b' }
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

  const record = {
    id: Date.now(),
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
        alert('Не вдалося знайти заголовки таблиці у файлі');
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

      const msg = document.getElementById('successMsg');
      msg.textContent = '✓ Імпортовано ' + imported + ' записів з файлу!';
      msg.style.display = 'block';
      msg.style.animation = 'none';
      msg.offsetHeight;
      msg.style.animation = 'fadeOut 3s forwards';
      setTimeout(() => { msg.style.display = 'none'; msg.textContent = '✓ Запис збережено!'; }, 3000);

    } catch (err) {
      alert('Помилка при читанні файлу: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

// ============ CLEAR ============
function clearAll() {
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
  document.getElementById('compoundCheck').checked = false;
  document.getElementById('compoundRate').value = '';
  document.getElementById('compoundTax').value = '';
  document.getElementById('compoundIndex').value = '';
  toggleCompoundOptions();
  document.getElementById('compoundSection').style.display = 'none';
  document.getElementById('compoundFullWidth').style.display = 'none';
  if (compoundChartInstance) { compoundChartInstance.destroy(); compoundChartInstance = null; }
  const t = new Date();
  document.getElementById('dateStart').value = t.toISOString().split('T')[0];
  const f = new Date(t);
  f.setMonth(f.getMonth() + 3);
  document.getElementById('dateEnd').value = f.toISOString().split('T')[0];
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
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
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
    const dailyProfit = r.profit / days;

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
  html += '</tr></thead><tbody>';

  sorted.forEach(b => {
    const best = b.name === bestName;
    html += `<tr class="${best ? 'a-best' : ''}">`;
    cols.forEach(c => {
      let val = c.fmt(b[c.key]);
      if (c.key === 'effAnnual' && best) val += ' <span class="a-badge a-badge-green">ТОП</span>';
      html += `<td>${val}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';

  document.getElementById('aRankTable').innerHTML = html;
  window._aBonds = bonds;
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

function togglePortfolioForm(forceOpen) {
  const card = document.getElementById('portfolioFormCard');
  const toggleBtn = document.getElementById('btnTogglePortfolioForm');
  const isHidden = card.style.display === 'none';
  const shouldOpen = forceOpen !== undefined ? forceOpen : isHidden;
  if (shouldOpen) {
    card.style.display = 'block';
    toggleBtn.textContent = '− ' + (t('portfolio.cancel') || 'Скасувати');
    toggleBtn.classList.remove('btn-save');
    toggleBtn.classList.add('btn-export');
    togglePortfolioTypeFields();
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
  }
}

function togglePortfolioTypeFields() {
  const type = document.getElementById('pType').value;
  const isOvdp = type === 'ovdp';
  const isDeposit = type === 'deposit';
  const isInsurance = type === 'insurance';

  // Bond fields — only ОВДП
  document.getElementById('pBondPriceField').style.display = isOvdp ? '' : 'none';
  document.getElementById('pBondCountField').style.display = isOvdp ? '' : 'none';

  // Rate — show for all types
  document.getElementById('pRate').closest('.field').style.display = '';

  // Tax — deposit and other
  document.getElementById('pTaxField').style.display = (isDeposit || type === 'other') ? '' : 'none';

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

  const isCompound = document.getElementById('pCompound').checked;

  if (!name || isNaN(invested) || invested <= 0) {
    const err = document.getElementById('pError');
    err.textContent = 'Вкажіть назву та суму вкладення';
    err.style.display = 'block';
    return;
  }
  document.getElementById('pError').style.display = 'none';

  portfolioItems.push({
    id: Date.now(),
    name, type, invested, rate: isNaN(rate) ? null : rate,
    bondPrice: type === 'ovdp' && !isNaN(bondPrice) && bondPrice > 0 ? bondPrice : null,
    bondCount: type === 'ovdp' && !isNaN(bondCount) && bondCount > 0 ? Math.floor(bondCount) : null,
    tax: isNaN(tax) ? null : tax,
    dateStart, dateEnd, bank, notes,
    indexation: !isNaN(indexation) && indexation > 0 ? indexation : null,
    compound: isCompound,
    createdAt: new Date().toISOString()
  });

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

  document.getElementById('pNotes').value = '';
  document.getElementById('pIndex').value = '';
  document.getElementById('pCompound').checked = false;
  togglePortfolioTypeFields();
  const now = new Date();
  document.getElementById('pDateStart').value = now.toISOString().split('T')[0];
  const f = new Date(now); f.setMonth(f.getMonth() + 3);
  document.getElementById('pDateEnd').value = f.toISOString().split('T')[0];

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
  const typeLabels = { ovdp: 'ОВДП', deposit: 'Депозит', compound: 'Складний %', insurance: 'Страхування', other: 'Інше' };
  const typeColors = { ovdp: 'p-type-ovdp', deposit: 'p-type-deposit', other: 'p-type-other' };
  const isActive = item.dateEnd ? new Date(item.dateEnd) > now : true;

  let days = 0, elapsed = 0, progress = 0, expectedProfit = 0, earnedSoFar = 0, dailyGross = 0, dailyNet = 0, daysLeft = 0;
  if (item.dateStart && item.dateEnd) {
    const start = new Date(item.dateStart);
    const end = new Date(item.dateEnd);
    days = Math.round((end - start) / 86400000);
    elapsed = Math.max(0, Math.round((now - start) / 86400000));
    daysLeft = Math.max(0, Math.round((end - now) / 86400000));
    progress = days > 0 ? Math.min(100, (elapsed / days) * 100) : 0;

    if (item.rate && days > 0) {
      const totalYears = days / 365.25;
      const elapsedYears = Math.min(elapsed, days) / 365.25;

      if (item.compound) {
        // Compound: balance = invested * (1 + rate)^years
        expectedProfit = item.invested * Math.pow(1 + item.rate / 100, totalYears) - item.invested;
        earnedSoFar = item.invested * Math.pow(1 + item.rate / 100, elapsedYears) - item.invested;
        earnedSoFar = Math.min(earnedSoFar, expectedProfit);
      } else {
        // Simple interest
        expectedProfit = item.invested * (item.rate / 100) * totalYears;
        earnedSoFar = item.invested * (item.rate / 100) * elapsedYears;
        earnedSoFar = Math.min(earnedSoFar, expectedProfit);
      }
      dailyGross = item.invested * (item.rate / 100) / 365.25;
      const taxRate = item.tax ? item.tax / 100 : 0;
      dailyNet = dailyGross * (1 - taxRate);
    }
  }

  const taxAmount = item.tax && expectedProfit > 0 ? expectedProfit * item.tax / 100 : 0;
  const netProfit = expectedProfit - taxAmount;

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
      <div class="detail-status" style="color:${isActive ? '#4ade80' : '#64748b'}">${isActive ? '● Активна' : '○ Завершена'}${item.compound ? ' · <span style="color:#a855f7">реінвестування</span>' : ''}</div>
      ${days > 0 ? `<div class="detail-progress"><div class="detail-progress-bar" style="width:${progress.toFixed(1)}%"></div></div>
      <div style="font-size:11px;color:#475569;margin-top:4px">${elapsed} з ${days} днів (${progress.toFixed(0)}%)</div>` : ''}
    </div>

    <div class="detail-grid">
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
        <div class="detail-metric-value yellow">${item.rate || '—'}%</div>
      </div>
    </div>

    ${item.compound && item.rate && days > 0 ? (() => {
      const totalYears = Math.ceil(days / 365.25);
      const r = item.rate / 100;
      const finalBalance = item.invested * Math.pow(1 + r, totalYears);
      const compProfit = finalBalance - item.invested;
      const simpleProfit = item.invested * r * totalYears;
      const advantage = compProfit - simpleProfit;
      return `<div class="a-card">
        <h3>Складний відсоток</h3>
        <div class="detail-info-row"><span class="detail-info-label">Ставка</span><span class="detail-info-value">${item.rate}% річних</span></div>
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
      ${item.indexation ? `<div class="detail-info-row"><span class="detail-info-label">Індексація внеску</span><span class="detail-info-value">${item.indexation}% / рік</span></div>` : ''}
      <div class="detail-info-row"><span class="detail-info-label">Дата початку</span><span class="detail-info-value">${item.dateStart ? formatDate(item.dateStart) : '—'}</span></div>
      <div class="detail-info-row"><span class="detail-info-label">Дата завершення</span><span class="detail-info-value">${item.dateEnd ? formatDate(item.dateEnd) : '—'}</span></div>
      <div class="detail-info-row"><span class="detail-info-label">Термін</span><span class="detail-info-value">${days > 0 ? formatTerm(days) : '—'}</span></div>
      ${item.bank ? `<div class="detail-info-row"><span class="detail-info-label">Банк</span><span class="detail-info-value">${esc(item.bank)}</span></div>` : ''}
      ${item.notes ? `<div class="detail-info-row"><span class="detail-info-label">Нотатки</span><span class="detail-info-value">${esc(item.notes)}</span></div>` : ''}
      ${item.createdAt ? `<div class="detail-info-row"><span class="detail-info-label">Створено</span><span class="detail-info-value">${new Date(item.createdAt).toLocaleDateString('uk-UA')}</span></div>` : ''}
    </div>

    ${(() => {
      // Yearly schedule for insurance (with indexation) or compound deposits
      if (!item.dateStart || !item.dateEnd || days <= 0) return '';
      const totalYears = Math.ceil(days / 365.25);
      if (totalYears < 1) return '';

      const isIns = item.type === 'insurance';
      const isCmp = !!item.compound;
      if (!isIns && !isCmp) return '';

      let rows = '';
      let yearlyPayment = item.invested;
      const idxPct = item.indexation ? item.indexation / 100 : 0;
      const ratePct = item.rate ? item.rate / 100 : 0;
      let balance = 0;
      let totalPaid = 0;

      if (isIns) {
        // Insurance: yearly table with calendar year, payment, indexation, interest, balance
        const hasIdx = idxPct > 0;
        const startYear = item.dateStart ? new Date(item.dateStart).getFullYear() : new Date().getFullYear();
        let totalInterest = 0;
        for (let y = 1; y <= totalYears; y++) {
          if (y > 1 && hasIdx) yearlyPayment = item.invested * Math.pow(1 + idxPct, y - 1);
          const idxAmount = y > 1 && hasIdx ? yearlyPayment - item.invested * Math.pow(1 + idxPct, y - 2) : 0;
          const interest = balance * ratePct;
          balance += yearlyPayment + interest;
          totalPaid += yearlyPayment;
          totalInterest += interest;
          rows += '<tr><td>' + y + '</td><td>' + (startYear + y - 1) + '</td><td>' + formatNum(yearlyPayment) + '</td>' +
            (hasIdx ? '<td style="color:#f59e0b">' + (idxAmount > 0 ? '+' + formatNum(idxAmount) : '—') + '</td>' : '') +
            '<td style="color:#4ade80">' + (interest > 0 ? '+' + formatNum(interest) : '—') + '</td>' +
            '<td><strong>' + formatNum(balance) + '</strong></td></tr>';
        }
        return '<div class="a-card"><h3>Графік внесків по роках</h3>' +
          '<div style="max-height:400px;overflow-y:auto"><table class="credit-schedule-table"><thead><tr>' +
          '<th style="text-align:left">№</th><th>Рік</th><th>Внесок</th>' +
          (hasIdx ? '<th>Індексація</th>' : '') +
          '<th>Відсотки</th><th>Баланс</th>' +
          '</tr></thead><tbody>' + rows +
          '<tr style="font-weight:700;border-top:2px solid #334155"><td></td><td>Всього</td><td>' + formatNum(totalPaid) + '</td>' +
          (hasIdx ? '<td>—</td>' : '') +
          '<td style="color:#4ade80">' + (totalInterest > 0 ? '+' + formatNum(totalInterest) : '—') + '</td>' +
          '<td><strong>' + formatNum(balance) + '</strong></td></tr>' +
          '</tbody></table></div></div>';
      } else {
        // Compound deposit: balance on start, interest, balance on end
        balance = item.invested;
        let totalInterest = 0;
        for (let y = 1; y <= totalYears; y++) {
          const balStart = balance;
          const interest = balance * ratePct;
          balance += interest;
          totalInterest += interest;
          rows += '<tr><td>' + y + '</td><td>' + formatNum(balStart) + '</td><td style="color:#4ade80">+' +
            formatNum(interest) + '</td><td><strong>' + formatNum(balance) + '</strong></td></tr>';
        }
        return '<div class="a-card"><h3>Графік нарахувань по роках</h3>' +
          '<div style="max-height:400px;overflow-y:auto"><table class="credit-schedule-table"><thead><tr>' +
          '<th style="text-align:left">Рік</th><th>Баланс (поч.)</th><th>Нараховано</th><th>Баланс (кін.)</th>' +
          '</tr></thead><tbody>' + rows +
          '<tr style="font-weight:700;border-top:2px solid #334155"><td>Всього</td><td>' + formatNum(item.invested) +
          '</td><td style="color:#4ade80">+' + formatNum(totalInterest) + '</td><td><strong>' + formatNum(balance) + '</strong></td></tr>' +
          '</tbody></table></div></div>';
      }
    })()}

    <div class="detail-actions">
      <button class="btn-export" onclick="closeInvestmentDetail(); editPortfolioItem('${item.id}')">✎ Редагувати</button>
      <button class="btn-clear" onclick="if(confirm('Видалити це вкладення?')){deletePortfolioItem('${item.id}'); closeInvestmentDetail();}">✕ Видалити</button>
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

function editPortfolioItem(id) {
  const item = portfolioItems.find(p => String(p.id) === String(id));
  if (!item) return;

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

  // Compound fields
  // If saved as compound, set type to compound
  document.getElementById('pIndex').value = item.indexation || '';
  document.getElementById('pCompound').checked = !!item.compound;
  togglePortfolioCompound();

  // Remove old item
  portfolioItems = portfolioItems.filter(p => String(p.id) !== String(id));
  renderPortfolio();
  savePortfolioToFirestore();

  // Change button text
  const btn = document.getElementById('btnAddPortfolio');
  btn.textContent = t('portfolio.update') || 'Зберегти зміни';
  btn.classList.remove('btn-save');
  btn.classList.add('btn-export');

  // Open form and scroll to it
  togglePortfolioForm(true);
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
  let totalInvested = 0, totalExpectedProfit = 0, totalEarnedSoFar = 0, activeCount = 0;
  let totalDailyGross = 0, totalDailyNet = 0, totalProfitToEOY = 0;
  const dailyBreakdown = [];

  const typeLabels = { ovdp: 'ОВДП', deposit: 'Депозит', compound: 'Складний %', insurance: 'Страхування', other: 'Інше' };

  list.innerHTML = sanitize(portfolioItems.map(p => {
    const isActive = p.dateEnd ? new Date(p.dateEnd) > now : true;
    if (isActive) activeCount++;
    totalInvested += p.invested;

    let days = 0, elapsed = 0, progress = 0, daysLeft = 0;
    let expectedProfit = 0, dailyGross = 0, dailyNet = 0, earnedSoFar = 0;
    if (p.dateStart && p.dateEnd) {
      days = Math.round((new Date(p.dateEnd) - new Date(p.dateStart)) / 86400000);
      elapsed = Math.max(0, Math.round((now - new Date(p.dateStart)) / 86400000));
      daysLeft = Math.max(0, Math.round((new Date(p.dateEnd) - now) / 86400000));
      progress = days > 0 ? Math.min(100, (elapsed / days) * 100) : 0;
      if (p.rate && days > 0) {
        const totalYears = days / 365.25;
        if (p.compound) {
          expectedProfit = p.invested * Math.pow(1 + p.rate / 100, totalYears) - p.invested;
        } else {
          expectedProfit = p.invested * (p.rate / 100) * totalYears;
        }
        totalExpectedProfit += expectedProfit;

        // Daily earnings (only for active investments)
        if (isActive && new Date(p.dateStart) <= now) {
          dailyGross = p.invested * (p.rate / 100) / 365.25;
          const taxRate = p.tax ? p.tax / 100 : 0;
          dailyNet = dailyGross * (1 - taxRate);
          totalDailyGross += dailyGross;
          totalDailyNet += dailyNet;

          // Earned so far
          const elapsedDays = (now - new Date(p.dateStart)) / 86400000;
          const elapsedYears = elapsedDays / 365.25;
          if (p.compound) {
            earnedSoFar = p.invested * Math.pow(1 + p.rate / 100, elapsedYears) - p.invested;
          } else {
            earnedSoFar = p.invested * (p.rate / 100) * elapsedYears;
          }
          earnedSoFar = Math.min(earnedSoFar, expectedProfit);
          totalEarnedSoFar += earnedSoFar;

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

    return `
      <div class="p-item" onclick="if(!event.target.closest('.btn-delete'))openInvestmentDetail('${p.id}')" style="cursor:pointer">
        <div class="p-item-info">
          <div class="p-item-name">
            ${esc(p.name)}
            <span class="p-item-type p-type-${esc(p.type)}">${esc(typeLabels[p.type] || p.type)}</span>
            <span class="${isActive ? 'p-status-active' : 'p-status-ended'}" style="font-size:11px">${isActive ? '● Активна' : '○ Завершена'}</span>
            ${p.compound ? '<span class="p-item-type p-type-compound" style="font-size:10px">реінвест.</span>' : ''}
          </div>
          ${days > 0 ? '<div class="detail-progress" style="margin:6px 0"><div class="detail-progress-bar" style="width:' + progress.toFixed(1) + '%"></div></div><div style="display:flex;justify-content:space-between;font-size:10px;color:#475569;margin-bottom:4px"><span>' + (isActive ? elapsed + ' з ' + days + ' дн. (' + progress.toFixed(0) + '%)' : 'Завершено') + '</span><span>' + (daysLeft > 0 ? daysLeft + ' дн. залишилось' : '') + '</span></div>' : ''}
          <div class="p-item-details">
            <span>Вкладено: <strong>${formatNum(p.invested)} грн</strong></span>
            ${p.bondPrice ? '<span>' + formatShort(p.bondPrice) + ' грн × ' + p.bondCount + ' шт.</span>' : ''}
            ${p.rate ? '<span>Ставка: <strong>' + p.rate + '%</strong></span>' : ''}
            ${p.tax ? '<span>Податок: <strong>' + p.tax + '%</strong></span>' : ''}
            ${days > 0 ? '<span>Строк: <strong>' + days + ' дн.</strong></span>' : ''}
            ${p.dateStart ? '<span>' + formatDate(p.dateStart) + ' → ' + (p.dateEnd ? formatDate(p.dateEnd) : '...') + '</span>' : ''}
          </div>
          ${p.bank ? '<div class="p-item-details" style="margin-top:4px"><span>Банк: <strong>' + esc(p.bank) + '</strong></span></div>' : ''}
          ${p.notes ? '<div class="p-item-notes">' + esc(p.notes) + '</div>' : ''}
        </div>
        <div class="p-item-actions">
          ${expectedProfit > 0 ? '<div class="p-item-profit"><div class="amount">+' + formatShort(expectedProfit) + ' грн</div><div class="label">очікуваний дохід</div>' + (p.tax && expectedProfit > 0 ? '<div style="color:#f87171;font-size:12px;margin-top:2px">−' + formatShort(expectedProfit * p.tax / 100) + ' податок</div><div style="color:#4ade80;font-size:13px;font-weight:700">=' + formatShort(expectedProfit - expectedProfit * p.tax / 100) + ' чистими</div>' : '') + '</div>' : ''}
          <button class="btn-delete" onclick="editPortfolioItem('${p.id}')" style="color:#60a5fa">✎</button>
          <button class="btn-delete" onclick="deletePortfolioItem('${p.id}')">✕</button>
        </div>
      </div>
    `;
  }).join(''));

  // Dashboard
  summary.style.display = 'block';
  const totalValue = totalInvested + totalEarnedSoFar;
  document.getElementById('dashTotalValue').textContent = formatShort(totalValue) + ' грн';
  document.getElementById('dashDailyTotal').innerHTML =
    '<span class="dash-daily-badge">+' + formatNum(totalDailyNet) + ' грн сьогодні (чисті)</span>';
  document.getElementById('dashInvested').textContent = formatShort(totalInvested) + ' грн';
  document.getElementById('dashEarned').textContent = '+' + formatNum(totalEarnedSoFar) + ' грн';
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

  renderPortfolioChart(portfolioItems);
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

  // Build year filter select (show chart from start up to selected year end)
  const minYear = minDate.getFullYear();
  const maxYear = maxDate.getFullYear();
  const sel = document.getElementById('chartYearFilter');
  const currentVal = portfolioChartYear === null ? 'all' : String(portfolioChartYear);
  const extendedMaxYear = minYear + 60;
  let opts = '<option value="all"' + (currentVal === 'all' ? ' selected' : '') + '>До кінця (' + maxYear + ')</option>';
  for (let yr = extendedMaxYear; yr >= minYear; yr--) {
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
      const s = new Date(p.dateStart).getTime();
      const e = new Date(p.dateEnd).getTime();
      const curTime = date.getTime();
      if (curTime >= s) {
        inv += p.invested;
        const elapsed = Math.min(curTime, e) - s;
        const elapsedDays = elapsed / dayMs;
        const profit = p.invested * (p.rate / 100) * (elapsedDays / 365.25);
        val += p.invested + Math.max(0, profit);
      }
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
          borderColor: '#facc15',
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
        <div class="a-stat">
          <div class="a-stat-label">Вкладено в ${cc} (курс ${sym}${rate.toFixed(2)})</div>
          <div class="a-stat-value">${sym}${formatNum(totalInvested / rate)}</div>
        </div>
        <div class="a-stat">
          <div class="a-stat-label">Очікуваний дохід за весь строк (${cc})</div>
          <div class="a-stat-value green">+${sym}${formatNum(totalExpectedProfit / rate)}</div>
        </div>
        <div class="a-stat">
          <div class="a-stat-label">Очікуваний дохід до кінця ${eoyYear} (${cc})</div>
          <div class="a-stat-value green">+${sym}${formatNum((totalProfitToEOY || 0) / rate)}</div>
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
let dreamsPieInstance = null;

function updateDreamsUI() {
  const auth = document.getElementById('dreamsAuth');
  const content = document.getElementById('dreamsContent');
  // Don't show auth prompt until Firebase has determined auth state
  if (typeof currentUser === 'undefined') return;
  if (currentUser) {
    auth.style.display = 'none';
    content.style.display = 'block';
    renderDreams();
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

function toggleDreamForm(forceOpen) {
  const card = document.getElementById('dreamFormCard');
  const btn = document.getElementById('btnToggleDreamForm');
  const isHidden = card.style.display === 'none';
  const shouldOpen = forceOpen !== undefined ? forceOpen : isHidden;
  if (shouldOpen) {
    card.style.display = 'block';
    btn.textContent = '− Скасувати';
    btn.classList.remove('btn-save');
    btn.classList.add('btn-export');
    dreamMonthlyManual = false;
    if (!document.getElementById('dreamDateStart').value) {
      document.getElementById('dreamDateStart').value = new Date().toISOString().split('T')[0];
    }
  } else {
    card.style.display = 'none';
    btn.textContent = '+ Нова мрія';
    btn.classList.remove('btn-export');
    btn.classList.add('btn-save');
    const addBtn = document.getElementById('btnAddDream');
    addBtn.textContent = 'Додати мрію';
    addBtn.classList.remove('btn-export');
    addBtn.classList.add('btn-save');
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

  if (!name || isNaN(target) || target <= 0) {
    const err = document.getElementById('dreamError');
    err.textContent = 'Вкажіть назву та бажану суму';
    err.style.display = 'block';
    return;
  }
  document.getElementById('dreamError').style.display = 'none';

  dreamItems.push({
    id: Date.now(), name, target, saved, monthly,
    dateStart, dateEnd, notes,
    createdAt: new Date().toISOString()
  });

  renderDreams();
  saveDreamsToFirestore();

  // Clear form
  document.getElementById('dreamName').value = '';
  document.getElementById('dreamTarget').value = '';
  document.getElementById('dreamSaved').value = '';
  document.getElementById('dreamMonthly').value = '';
  document.getElementById('dreamNotes').value = '';
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

function addDreamDeposit(id) {
  const input = document.getElementById('dreamDepositAmount-' + id);
  const amount = parseNum(input.value);
  if (isNaN(amount) || amount <= 0) return;

  const item = dreamItems.find(d => String(d.id) === String(id));
  if (!item) return;

  item.saved = (item.saved || 0) + amount;

  // Save deposit history
  if (!item.deposits) item.deposits = [];
  item.deposits.push({ amount, date: new Date().toISOString() });

  renderDreams();
  saveDreamsToFirestore();
}

let dreamDetailChartInstance = null;

function openDreamDetail(id) {
  const d = dreamItems.find(x => String(x.id) === String(id));
  if (!d) return;

  const now = new Date();
  const progress = d.target > 0 ? Math.min(100, ((d.saved || 0) / d.target) * 100) : 0;
  const remaining = Math.max(0, d.target - (d.saved || 0));
  const netMonthly = d.monthly || 0;
  const monthsLeft = netMonthly > 0 && remaining > 0 ? Math.ceil(remaining / netMonthly) : null;

  let deadlineInfo = '';
  if (d.dateEnd) {
    const end = new Date(d.dateEnd);
    const daysLeft = Math.ceil((end - now) / 86400000);
    if (daysLeft <= 0) deadlineInfo = 'Термін минув';
    else deadlineInfo = daysLeft + ' дн. (' + Math.ceil(daysLeft / 30) + ' міс.)';
  }

  // Deposits history
  let depositsHtml = '';
  if (d.deposits && d.deposits.length) {
    depositsHtml = '<div class="a-card"><h3>Історія внесків</h3>' +
      '<div style="max-height:300px;overflow-y:auto"><table class="credit-schedule-table"><thead><tr>' +
      '<th style="text-align:left">Дата</th><th>Сума</th></tr></thead><tbody>' +
      d.deposits.map(dep => '<tr><td>' + new Date(dep.date).toLocaleDateString('uk-UA') + '</td><td style="color:#4ade80">+' + formatNum(dep.amount) + ' грн</td></tr>').join('') +
      '</tbody></table></div></div>';
  }

  document.getElementById('dreamsContent').style.display = 'none';
  document.getElementById('dreamsDashboard').style.display = 'none';
  const detail = document.getElementById('dreamDetail');
  detail.style.display = 'block';

  detail.querySelector('#dreamDetailContent').innerHTML = sanitize(`
    <div class="dash-hero">
      <div class="dash-hero-label">${esc(d.name)}</div>
      <div class="dash-hero-value">${progress.toFixed(0)}%</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:4px">${formatNum(d.saved || 0)} з ${formatNum(d.target)} грн</div>
      <div class="detail-progress" style="margin-top:10px;width:100%"><div class="detail-progress-bar" style="width:${progress.toFixed(1)}%"></div></div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;flex-wrap:wrap">
        <button class="btn-save" onclick="depositDreamFromDetail('${d.id}')" style="width:auto;padding:8px 16px;margin:0">+ Внести кошти</button>
        <button class="btn-export" onclick="editDreamFromDetail('${d.id}')" style="width:auto;padding:8px 16px;margin:0">✎ Редагувати</button>
        <button class="btn-clear" onclick="if(confirm('Видалити мрію?')){deleteDream('${d.id}');closeDreamDetail();}" style="width:auto;padding:8px 16px;margin:0">✕ Видалити</button>
      </div>
    </div>

    <div style="position:relative;height:220px;margin:12px auto;max-width:280px">
      <canvas id="dreamDetailPie"></canvas>
    </div>

    <div class="detail-grid">
      <div class="detail-metric">
        <div class="detail-metric-label">Накопичено</div>
        <div class="detail-metric-value green">${formatNum(d.saved || 0)} грн</div>
      </div>
      <div class="detail-metric">
        <div class="detail-metric-label">Залишилось</div>
        <div class="detail-metric-value" style="color:#f87171">${formatNum(remaining)} грн</div>
      </div>
      ${d.monthly ? '<div class="detail-metric"><div class="detail-metric-label">Внесок / міс</div><div class="detail-metric-value">' + formatNum(d.monthly) + ' грн</div></div>' : ''}
      ${monthsLeft ? '<div class="detail-metric"><div class="detail-metric-label">До цілі</div><div class="detail-metric-value">≈ ' + monthsLeft + ' міс.</div></div>' : ''}
    </div>

    <div class="a-card">
      <h3>Деталі</h3>
      ${d.dateStart ? '<div class="detail-info-row"><span class="detail-info-label">Створено</span><span class="detail-info-value">' + formatDate(d.dateStart) + '</span></div>' : ''}
      ${d.dateEnd ? '<div class="detail-info-row"><span class="detail-info-label">Планую до</span><span class="detail-info-value">' + formatDate(d.dateEnd) + '</span></div>' : ''}
      ${deadlineInfo ? '<div class="detail-info-row"><span class="detail-info-label">Залишилось часу</span><span class="detail-info-value">' + deadlineInfo + '</span></div>' : ''}
      ${d.deposits ? '<div class="detail-info-row"><span class="detail-info-label">Внесків</span><span class="detail-info-value">' + d.deposits.length + '</span></div>' : ''}
      ${d.notes ? '<div class="detail-info-row"><span class="detail-info-label">Нотатки</span><span class="detail-info-value">' + esc(d.notes) + '</span></div>' : ''}
    </div>

    ${depositsHtml}

  `);

  // Pie chart on detail
  const pieCanvas = document.getElementById('dreamDetailPie');
  if (pieCanvas && typeof Chart !== 'undefined') {
    if (dreamDetailChartInstance) dreamDetailChartInstance.destroy();
    dreamDetailChartInstance = new Chart(pieCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Накопичено', 'Залишилось'],
        datasets: [{
          data: [d.saved || 0, remaining],
          backgroundColor: ['#4ade80', '#334155'],
          borderColor: '#0f172a',
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
            callbacks: { label: ctx => ctx.label + ': ' + formatNum(ctx.raw) + ' грн' }
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

  dreamItems = dreamItems.filter(d => String(d.id) !== String(id));
  renderDreams();
  saveDreamsToFirestore();

  const btn = document.getElementById('btnAddDream');
  btn.textContent = 'Зберегти зміни';
  btn.classList.remove('btn-save');
  btn.classList.add('btn-export');
  toggleDreamForm(true);
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
  let totalTarget = 0, totalSaved = 0;
  const pieLabels = [], pieData = [], pieColors = [];
  const colors = ['#3b82f6', '#4ade80', '#f59e0b', '#a855f7', '#f472b6', '#60a5fa', '#facc15', '#34d399'];

  list.innerHTML = sanitize(dreamItems.map((d, i) => {
    const target = d.target || 0;
    const saved = d.saved || 0;
    const progress = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
    totalTarget += target;
    totalSaved += saved;

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

    pieLabels.push(d.name);
    pieData.push(d.target);
    pieColors.push(colors[i % colors.length]);

    return `<div class="p-item" style="flex-wrap:wrap;cursor:pointer" onclick="if(!event.target.closest('.btn-delete')&&!event.target.closest('#dreamDeposit-${d.id}')&&!event.target.closest('input'))openDreamDetail('${d.id}')">
      <div class="p-item-info" style="width:100%">
        <div class="p-item-name">${esc(d.name)}</div>
        <div class="detail-progress" style="margin:8px 0"><div class="detail-progress-bar" style="width:${progress.toFixed(1)}%"></div></div>
        <div class="p-item-details">
          <span>${formatNum(saved)} з ${formatNum(target)} грн (${progress.toFixed(0)}%)</span>
          ${d.monthly ? '<span>Внесок: ' + formatNum(d.monthly) + '/міс</span>' : ''}
          ${monthsLeft ? '<span>≈ ' + monthsLeft + ' міс. до цілі</span>' : ''}
          ${deadlineInfo ? '<span>' + deadlineInfo + '</span>' : ''}
          ${d.deposits && d.deposits.length ? '<span>Внесків: ' + d.deposits.length + '</span>' : ''}
        </div>
        ${d.notes ? '<div class="p-item-notes">' + esc(d.notes) + '</div>' : ''}
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-delete" onclick="event.stopPropagation();showDreamDeposit('${d.id}')" style="color:#4ade80;font-size:16px" title="Внести кошти">+</button>
          <button class="btn-delete" onclick="event.stopPropagation();editDream('${d.id}')" style="color:#60a5fa">✎</button>
          <button class="btn-delete" onclick="event.stopPropagation();if(confirm('Видалити мрію?'))deleteDream('${d.id}')">✕</button>
        </div>
      </div>
      <div id="dreamDeposit-${d.id}" style="display:none;width:100%;margin-top:8px;padding-top:8px;border-top:1px solid #1e293b">
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="dreamDepositAmount-${d.id}" placeholder="Сума внеску" inputmode="decimal" style="flex:1;padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#f1f5f9;font-size:14px;outline:none">
          <button class="btn-save" onclick="addDreamDeposit('${d.id}')" style="width:auto;padding:8px 16px;margin:0;white-space:nowrap">Внести</button>
          <button class="btn-clear" onclick="document.getElementById('dreamDeposit-${d.id}').style.display='none'" style="width:auto;padding:8px 12px;margin:0">✕</button>
        </div>
      </div>
    </div>`;
  }).join(''));

  // Dashboard
  dashboard.style.display = 'block';
  const totalProgress = totalTarget > 0 ? (totalSaved / totalTarget * 100) : 0;
  document.getElementById('dreamsTotalProgress').textContent = totalProgress.toFixed(0) + '%';
  document.getElementById('dreamsTotalSummary').textContent =
    formatNum(totalSaved) + ' з ' + formatNum(totalTarget) + ' грн';

  // Bar chart: saved vs remaining per dream
  const canvas = document.getElementById('dreamsPieChart');
  if (canvas && typeof Chart !== 'undefined') {
    if (dreamsPieInstance) dreamsPieInstance.destroy();
    dreamsPieInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: pieLabels,
        datasets: [
          { label: 'Накопичено', data: dreamItems.map(d => d.saved || 0), backgroundColor: '#4ade80', borderRadius: 4 },
          { label: 'Залишилось', data: dreamItems.map(d => Math.max(0, d.target - (d.saved || 0))), backgroundColor: '#334155', borderRadius: 4 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 12 }, padding: 16 } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + formatNum(ctx.raw) + ' грн' } }
        },
        scales: {
          x: { stacked: true, ticks: { color: '#475569', font: { size: 10 }, callback: v => formatShort(v) }, grid: { color: '#1e293b' } },
          y: { stacked: true, ticks: { color: '#e2e8f0', font: { size: 12 } }, grid: { display: false } }
        }
      }
    });
  }
}

async function saveDreamsToFirestore() {
  if (!firebaseReady || !currentUser) {
    console.warn('Dreams save skipped: no auth');
    return;
  }
  try {
    const uid = currentUser.uid;
    const ref = db.collection('users').doc(uid).collection('dreams');

    // Delete existing docs
    const existing = await ref.get();
    const delPromises = [];
    existing.forEach(doc => delPromises.push(doc.ref.delete()));
    if (delPromises.length) await Promise.all(delPromises);

    // Write new docs
    const writePromises = dreamItems.map(d => ref.doc(String(d.id)).set(d));
    if (writePromises.length) await Promise.all(writePromises);

    console.log('Dreams saved:', dreamItems.length);
  } catch(e) {
    console.error('Dreams save failed:', e.code, e.message);
  }
}

async function loadDreamsFromFirestore() {
  if (!firebaseReady || !currentUser) return;
  try {
    const ref = db.collection('users').doc(currentUser.uid).collection('dreams');
    const snapshot = await ref.get();
    if (!snapshot.empty) {
      dreamItems = [];
      snapshot.forEach(doc => dreamItems.push(doc.data()));
      renderDreams();
    }
  } catch(e) { console.warn('Dreams load failed:', e); }
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
          legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label + ': ' + formatShort(ctx.raw) + ' грн'
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: '#64748b', font: { size: 10 } },
            grid: { display: false },
            title: { display: true, text: 'Місяць', color: '#475569', font: { size: 11 } }
          },
          y: {
            stacked: true,
            ticks: { color: '#64748b', font: { size: 10 }, callback: v => formatShort(v) },
            grid: { color: '#1e293b' }
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

// Restore last active tab
(function() {
  const saved = localStorage.getItem('activeTab');
  if (saved) {
    const btn = document.querySelector('.main-tab[onclick*="\'' + saved + '\'"]');
    if (btn) switchMainTab(saved, btn);
  }
})();
