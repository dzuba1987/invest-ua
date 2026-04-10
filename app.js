// ============ TAB SWITCHING ============
function switchMainTab(tab, btn) {
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
  if (tab === 'analytics') checkAnalyticsReady();
  if (tab === 'portfolio') updatePortfolioUI();
  if (tab === 'profile') updateProfileUI();
}

// ============ STATE ============
let activeField = null;
let savedRecords = [];

// ============ HELPERS ============
function formatNum(n) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatShort(n) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

// ============ CALCULATE & DISPLAY ============
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

  var ph = document.getElementById('resultsPlaceholder');
  if (ph) ph.style.display = 'none';
  resultsEl.classList.add('show');
}

// ============ SAVE RECORD ============
function saveRecord() {
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

  if (isNaN(invested) || invested <= 0 || isNaN(received) || received <= 0) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = 'Заповніть дані для збереження';
    errorEl.style.display = 'block';
    return;
  }

  const profit = received - invested;
  const periodRate = (profit / invested) * 100;
  const annualRate = !isNaN(diffDays) && diffDays > 0 ? periodRate / diffDays * 365.25 : 0;

  const taxPct = getVal('bonusPercent');
  const hasTax = !isNaN(taxPct) && taxPct > 0;
  const taxAmount = hasTax ? profit * taxPct / 100 : 0;

  const record = {
    id: Date.now(),
    name: document.getElementById('bondName').value.trim() || '—',
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
    netAfterTax: profit - taxAmount
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
    tr.innerHTML = `
      <td>${r.name}</td>
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

let _skipFirestoreSync = false;
const origRenderSaved = renderSaved;
renderSaved = function() {
  origRenderSaved();
  saveToStorage();
  if (!_skipFirestoreSync) saveToFirestore();
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

// ================================================================
// ==================== FIREBASE AUTH + FIRESTORE =================
// ================================================================

let firebaseReady = false;
let currentUser = null;
let db = null;

function initFirebase() {
  if (!FIREBASE_CONFIG.apiKey) {
    document.getElementById('firebaseNotice').classList.add('show');
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
    document.getElementById('firebaseNotice').classList.add('show');
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
    }
  } catch(e) {
    console.warn('User meta save failed:', e);
  }
}

// ============ TELEGRAM BOT ============
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
  if (!config || !config.botToken || !config.chatId) return;

  let text = '';
  if (event === 'newUser') {
    text = `🆕 *Новий користувач Invest UA*\n\n` +
      `👤 ${user.displayName || 'Без імені'}\n` +
      `📧 ${user.email || '—'}\n` +
      `🕐 ${new Date().toLocaleString('uk-UA')}\n` +
      `🔑 Provider: ${user.providerData[0]?.providerId || 'unknown'}`;
  }

  if (!text) return;

  try {
    await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
  } catch(e) {
    console.warn('Telegram notify failed:', e);
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
  // Only clear UI and local storage, NOT Firestore (signOut is async,
  // currentUser is still set — calling saveToFirestore would erase cloud data)
  origRenderSaved();
  saveToStorage();
  updateProfileUI();
  updatePortfolioUI();
}

async function saveToFirestore() {
  if (!firebaseReady || !currentUser) return;
  if (savedRecords.length === 0) return;
  try {
    const ref = db.collection('users').doc(currentUser.uid).collection('records');

    // Delete existing docs
    const existing = await ref.get();
    const deletePromises = [];
    existing.forEach(doc => deletePromises.push(doc.ref.delete()));
    await Promise.all(deletePromises);

    // Write all records
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
      // Render and save to local storage, but skip writing back to Firestore
      _skipFirestoreSync = true;
      renderSaved();
      _skipFirestoreSync = false;
    } else if (savedRecords.length > 0) {
      // First login — push local records to cloud
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

// ================================================================
// ==================== ANALYTICS ENGINE ==========================
// ================================================================

let aComboTab = 'efficiency';

function checkAnalyticsReady() {
  const authGate = document.getElementById('analyticsAuth');
  const empty = document.getElementById('analyticsEmpty');
  const content = document.getElementById('analyticsContent');

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

function updatePortfolioUI() {
  const auth = document.getElementById('portfolioAuth');
  const content = document.getElementById('portfolioContent');
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
  const invested = parseNum(document.getElementById('pInvested').value);
  const rate = parseNum(document.getElementById('pRate').value);
  const tax = parseNum(document.getElementById('pTax').value);
  const dateStart = document.getElementById('pDateStart').value;
  const dateEnd = document.getElementById('pDateEnd').value;
  const bank = document.getElementById('pBank').value.trim();
  const card = document.getElementById('pCard').value.trim();
  const notes = document.getElementById('pNotes').value.trim();

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
    tax: isNaN(tax) ? null : tax,
    dateStart, dateEnd, bank, card, notes,
    createdAt: new Date().toISOString()
  });

  renderPortfolio();
  savePortfolioToFirestore();

  // Clear form
  document.getElementById('pName').value = '';
  document.getElementById('pInvested').value = '';
  document.getElementById('pRate').value = '';
  document.getElementById('pTax').value = '';
  document.getElementById('pBank').value = '';
  document.getElementById('pCard').value = '';
  document.getElementById('pNotes').value = '';
  const t = new Date();
  document.getElementById('pDateStart').value = t.toISOString().split('T')[0];
  const f = new Date(t); f.setMonth(f.getMonth() + 3);
  document.getElementById('pDateEnd').value = f.toISOString().split('T')[0];

  const msg = document.getElementById('pSuccess');
  msg.textContent = '✓ Додано до портфеля!';
  msg.style.display = 'block';
  msg.style.animation = 'none';
  msg.offsetHeight;
  msg.style.animation = 'fadeOut 3s forwards';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

function deletePortfolioItem(id) {
  portfolioItems = portfolioItems.filter(p => p.id !== id);
  renderPortfolio();
  savePortfolioToFirestore();
}

function editPortfolioItem(id) {
  const item = portfolioItems.find(p => p.id === id);
  if (!item) return;

  document.getElementById('pName').value = item.name || '';
  document.getElementById('pType').value = item.type || 'ovdp';
  document.getElementById('pInvested').value = item.invested ? Math.round(item.invested).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '';
  document.getElementById('pRate').value = item.rate || '';
  document.getElementById('pTax').value = item.tax || '';
  document.getElementById('pDateStart').value = item.dateStart || '';
  document.getElementById('pDateEnd').value = item.dateEnd || '';
  document.getElementById('pBank').value = item.bank || '';
  document.getElementById('pCard').value = item.card || '';
  document.getElementById('pNotes').value = item.notes || '';

  // Remove old item
  portfolioItems = portfolioItems.filter(p => p.id !== id);
  renderPortfolio();
  savePortfolioToFirestore();

  // Scroll to form
  document.getElementById('pName').focus();
  document.getElementById('pName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderPortfolio() {
  const list = document.getElementById('portfolioList');
  const summary = document.getElementById('portfolioSummary');

  if (portfolioItems.length === 0) {
    list.innerHTML = '<div class="a-empty">Ще немає інвестицій у портфелі.<br>Додайте першу вище.</div>';
    summary.style.display = 'none';
    return;
  }

  const now = new Date();
  let totalInvested = 0, totalExpectedProfit = 0, activeCount = 0;

  const typeLabels = { ovdp: 'ОВДП', deposit: 'Депозит', other: 'Інше' };

  list.innerHTML = portfolioItems.map(p => {
    const isActive = p.dateEnd ? new Date(p.dateEnd) > now : true;
    if (isActive) activeCount++;
    totalInvested += p.invested;

    let days = 0, expectedProfit = 0;
    if (p.dateStart && p.dateEnd) {
      days = Math.round((new Date(p.dateEnd) - new Date(p.dateStart)) / 86400000);
      if (p.rate && days > 0) {
        expectedProfit = p.invested * (p.rate / 100) * (days / 365.25);
        totalExpectedProfit += expectedProfit;
      }
    }

    return `
      <div class="p-item">
        <div class="p-item-info">
          <div class="p-item-name">
            ${p.name}
            <span class="p-item-type p-type-${p.type}">${typeLabels[p.type] || p.type}</span>
            <span class="${isActive ? 'p-status-active' : 'p-status-ended'}" style="font-size:11px">${isActive ? '● Активна' : '○ Завершена'}</span>
          </div>
          <div class="p-item-details">
            <span>Вкладено: <strong>${formatShort(p.invested)} грн</strong></span>
            ${p.rate ? '<span>Ставка: <strong>' + p.rate + '%</strong></span>' : ''}
            ${p.tax ? '<span>Податок: <strong>' + p.tax + '%</strong></span>' : ''}
            ${days > 0 ? '<span>Строк: <strong>' + days + ' дн.</strong></span>' : ''}
            ${p.dateStart ? '<span>' + formatDate(p.dateStart) + ' → ' + (p.dateEnd ? formatDate(p.dateEnd) : '...') + '</span>' : ''}
          </div>
          ${p.bank || p.card ? '<div class="p-item-details" style="margin-top:4px"><span>Виведення: <strong>' + (p.bank || '') + (p.bank && p.card ? ' · ' : '') + (p.card || '') + '</strong></span></div>' : ''}
          ${p.notes ? '<div class="p-item-notes">' + p.notes + '</div>' : ''}
        </div>
        <div class="p-item-actions">
          ${expectedProfit > 0 ? '<div class="p-item-profit"><div class="amount">+' + formatShort(expectedProfit) + ' грн</div><div class="label">очікуваний дохід</div>' + (p.tax && expectedProfit > 0 ? '<div style="color:#f87171;font-size:12px;margin-top:2px">−' + formatShort(expectedProfit * p.tax / 100) + ' податок</div><div style="color:#4ade80;font-size:13px;font-weight:700">=' + formatShort(expectedProfit - expectedProfit * p.tax / 100) + ' чистими</div>' : '') + '</div>' : ''}
          <button class="btn-delete" onclick="editPortfolioItem(${p.id})" style="color:#60a5fa">✎</button>
          <button class="btn-delete" onclick="deletePortfolioItem(${p.id})">✕</button>
        </div>
      </div>
    `;
  }).join('');

  // Summary
  summary.style.display = 'block';
  document.getElementById('pSummaryRow').innerHTML = `
    <div class="a-stat"><div class="a-stat-label">Всього інвестицій</div><div class="a-stat-value">${portfolioItems.length}</div></div>
    <div class="a-stat"><div class="a-stat-label">Активних</div><div class="a-stat-value">${activeCount}</div></div>
    <div class="a-stat"><div class="a-stat-label">Вкладено</div><div class="a-stat-value">${formatShort(totalInvested)} грн</div></div>
    <div class="a-stat"><div class="a-stat-label">Очікуваний дохід</div><div class="a-stat-value green">+${formatShort(totalExpectedProfit)} грн</div></div>
  `;

  renderPortfolioChart(portfolioItems);
  loadCurrencyRates(totalInvested, totalExpectedProfit);
}

// ---- Portfolio Chart ----
let portfolioChartInstance = null;

function renderPortfolioChart(items) {
  const canvas = document.getElementById('portfolioChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (portfolioChartInstance) {
    portfolioChartInstance.destroy();
  }

  const now = new Date();
  const activeItems = items.filter(p => p.dateStart && p.dateEnd && p.rate);

  if (activeItems.length === 0) {
    canvas.parentElement.innerHTML = '<p style="text-align:center;color:#475569;padding:40px;font-size:13px">Додайте інвестиції зі ставкою та датами для графіку</p>';
    return;
  }

  // Find date range — start from earliest investment date
  let minDate = new Date(activeItems[0].dateStart);
  let maxDate = new Date(activeItems[0].dateEnd);
  activeItems.forEach(p => {
    const s = new Date(p.dateStart);
    const e = new Date(p.dateEnd);
    if (s < minDate) minDate = s;
    if (e > maxDate) maxDate = e;
  });

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
    labels.push(date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }));

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
          ticks: { color: '#475569', maxTicksLimit: 12, font: { size: 11 } },
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
let ratesCacheTime = 0;

async function loadCurrencyRates(totalInvested, totalExpectedProfit) {
  const container = document.getElementById('pCurrencyRow');
  const dateEl = document.getElementById('pCurrencyDate');
  if (!container) return;

  const totalValue = totalInvested + totalExpectedProfit;

  try {
    // Cache for 1 hour
    if (!cachedRates || Date.now() - ratesCacheTime > 3600000) {
      const res = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
      const data = await res.json();
      cachedRates = {};
      data.forEach(r => { cachedRates[r.cc] = r.rate; });
      cachedRates._date = data[0]?.exchangedate || '';
      ratesCacheTime = Date.now();
    }

    const usd = cachedRates['USD'];
    const eur = cachedRates['EUR'];

    if (!usd || !eur) {
      container.innerHTML = '<p style="color:#475569;font-size:13px">Курси недоступні</p>';
      return;
    }

    container.innerHTML = `
      <div class="a-stat">
        <div class="a-stat-label">Вкладено (UAH)</div>
        <div class="a-stat-value">${formatShort(totalInvested)} грн</div>
      </div>
      <div class="a-stat">
        <div class="a-stat-label">USD ($${usd.toFixed(2)})</div>
        <div class="a-stat-value blue">$${(totalValue / usd).toFixed(0)}</div>
      </div>
      <div class="a-stat">
        <div class="a-stat-label">EUR (€${eur.toFixed(2)})</div>
        <div class="a-stat-value yellow">€${(totalValue / eur).toFixed(0)}</div>
      </div>
      <div class="a-stat">
        <div class="a-stat-label">Очікуваний дохід (USD)</div>
        <div class="a-stat-value green">+$${(totalExpectedProfit / usd).toFixed(0)}</div>
      </div>
    `;
    dateEl.textContent = 'Курс НБУ: ' + cachedRates._date;
  } catch(e) {
    container.innerHTML = '<p style="color:#475569;font-size:13px">Не вдалося завантажити курси валют</p>';
    console.warn('Currency rates failed:', e);
  }
}

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

// ================================================================
// ==================== PROFILE & SETTINGS ========================
// ================================================================

let userProfile = {};

function updateProfileUI() {
  const auth = document.getElementById('profileAuth');
  const content = document.getElementById('profileContent');
  if (currentUser) {
    auth.style.display = 'none';
    content.style.display = 'block';
    document.getElementById('profileAvatar').src = currentUser.photoURL || '';
    document.getElementById('profileName').textContent = userProfile.displayName || currentUser.displayName || '';
    document.getElementById('profileEmail').textContent = userProfile.contactEmail || currentUser.email || '';
    document.getElementById('profileDisplayName').value = userProfile.displayName || currentUser.displayName || '';
    document.getElementById('profileContactEmail').value = userProfile.contactEmail || '';
    document.getElementById('profilePhone').value = userProfile.phone || '';
    updatePinStatus();
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

  // Update header and profile card with new data
  document.getElementById('userName').textContent = userProfile.displayName || currentUser.displayName || currentUser.email;
  document.getElementById('profileName').textContent = userProfile.displayName || currentUser.displayName || '';
  document.getElementById('profileEmail').textContent = userProfile.contactEmail || currentUser.email || '';

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
      // Check if user is blocked by admin
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
        updateProfileUI();
        checkPinOnLogin();
      }
      // Show admin link if admin
      const adminLink = document.getElementById('adminLink');
      if (adminLink) adminLink.style.display = (meta && meta.isAdmin) ? '' : 'none';
    }
  } catch(e) {
    console.warn('Profile load failed:', e);
  }
}

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

function savePin() {
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

  userProfile.pin = pin;
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

function verifyPin() {
  const input = document.getElementById('pinInput').value.trim();
  if (input === userProfile.pin) {
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

// Apply saved language
const savedLang = localStorage.getItem('appLang');
if (savedLang) setAppLanguage(savedLang);

initFirebase();
loadFromStorage();
