// Purchase calendar: monthly grid with planned/done markers, day-detail
// drawer, and prev/next-month + year navigation. Shares purchaseItems and
// renderPurchases with app.js (which calls _renderPurchaseCalendar from its
// own renderPurchases pipeline so dashboard totals stay in sync with the
// calendar's selected month).

let _selectedPurchaseCalendarDate = null;
let _purchaseCalendarMonth = null; // YYYY-MM, null = follow current month
let _lastRenderedTodayKey = null;  // last `_todayDateKey()` baked into the grid

function _activePurchaseCalendarMonth() {
  return _purchaseCalendarMonth || currentMonthKey();
}

// Project recurring not-bought items into a future month (`cm`). Returns
// synthetic items with `_projected: true`, `plannedDate` snapped to the
// same day-of-month (clamped to month length) and `plannedMonth` rewritten
// to `cm`. Items already living in `cm` (real next-month copy spawned by
// `markPurchaseBought`) suppress projections of the same recurring chain
// to avoid double-counting. Shared by the calendar grid and the dashboard
// totals so both stay in sync.
function _projectRecurringForMonth(items, cm) {
  const [yStr, mStr] = cm.split('-');
  const y = Number(yStr), m = Number(mStr);
  const daysInMonth = new Date(y, m, 0).getDate();
  const realInMonth = items.filter(p => {
    const pm = (p.plannedDate ? p.plannedDate.slice(0, 7) : (p.plannedMonth || ''));
    return pm === cm && (p.recurring || p.credit) && !p.bought;
  });
  const out = [];
  items.forEach(p => {
    if (!(p.recurring || p.credit) || p.bought) return;
    const base = p.plannedDate || ((p.plannedMonth || cm) + '-01');
    const baseMonth = base.slice(0, 7);
    if (baseMonth >= cm) return;
    // Credit projections stop after the final installment. Index of the
    // projected month = creditMonthIndex of the source + months between
    // baseMonth and cm. Cap at creditMonths.
    let projectedIndex = null;
    if (p.credit) {
      const totalMonths = Number(p.creditMonths) || 0;
      const baseIndex = Number(p.creditMonthIndex) || 1;
      const [by, bm] = baseMonth.split('-').map(Number);
      const monthDiff = (y - by) * 12 + (m - bm);
      projectedIndex = baseIndex + monthDiff;
      if (projectedIndex > totalMonths) return;
    }
    const baseDay = Number(base.slice(8, 10)) || 1;
    const day = Math.min(baseDay, daysInMonth);
    const name = String(p.name || '').trim();
    const dup = realInMonth.some(it => String(it.name || '').trim() === name);
    if (dup) return;
    const projected = {
      ...p,
      _projected: true,
      plannedDate: y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
      plannedMonth: cm
    };
    if (projectedIndex != null) projected.creditMonthIndex = projectedIndex;
    out.push(projected);
  });
  return out;
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
  _lastRenderedTodayKey = todayKey;

  // Group items by ISO date — real records first, projected (virtual)
  // recurring occurrences appended via `_projectRecurringForMonth`.
  const projected = _projectRecurringForMonth(allItems, cm);
  const byDay = {};
  [...allItems, ...projected].forEach(p => {
    const cc = purchaseCurOf(p);
    const uah = purchaseToUah(p.boughtAmount || p.amount, cc);
    let dateKey;
    if (p.plannedDate) dateKey = p.plannedDate;
    else if (p.bought && p.boughtAt) dateKey = p.boughtAt.slice(0, 10);
    else if (p.plannedMonth) dateKey = p.plannedMonth + '-01';
    else return;
    if (dateKey.slice(0, 7) !== cm) return;
    if (!byDay[dateKey]) byDay[dateKey] = { items: [], totalUah: 0, hasPlanned: false, hasDone: false, hasProjected: false, hasCredit: false, hasCreditDone: false, hasCreditProjected: false };
    byDay[dateKey].items.push(p);
    if (uah != null) byDay[dateKey].totalUah += uah;
    if (p._projected) {
      if (p.credit) byDay[dateKey].hasCreditProjected = true;
      else byDay[dateKey].hasProjected = true;
    } else if (p.bought) {
      if (p.credit) byDay[dateKey].hasCreditDone = true;
      else byDay[dateKey].hasDone = true;
    } else if (p.credit) {
      byDay[dateKey].hasCredit = true;
    } else {
      byDay[dateKey].hasPlanned = true;
    }
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
      // Credit identity wins so users still see "this is a loan installment"
      // after marking ✓ — without this, hasDone alone would paint the day green.
      const anyCreditReal = data.hasCredit || data.hasCreditDone;
      const anyOtherReal = data.hasPlanned || data.hasDone;
      if (anyCreditReal && anyOtherReal) dotClass = 'is-credit-mixed';
      else if (data.hasCredit && data.hasCreditDone) dotClass = 'is-credit-mixed';
      else if (data.hasCreditDone) dotClass = 'is-credit-done';
      else if (data.hasCredit) dotClass = 'is-credit';
      else if (data.hasPlanned && data.hasDone) dotClass = 'is-mixed';
      else if (data.hasDone) dotClass = 'is-done';
      else if (data.hasPlanned) dotClass = 'is-planned';
      else if (data.hasCreditProjected) dotClass = 'is-credit-projected';
      else if (data.hasProjected) dotClass = 'is-projected';
    }
    // For credit items show 💳 in the day cell so the loan nature is visible
    // at a glance on the calendar — the user-picked icon still shows up in
    // the day-detail drawer alongside the badge.
    const icons = data
      ? data.items.slice(0, 3).map(it => '<span' + (it.credit ? ' class="is-credit"' : '') + '>' + esc(it.credit ? '💳' : purchaseIconOf(it)) + '</span>').join('')
      + (data.items.length > 3 ? '<span class="purchase-calendar-day-more">+' + (data.items.length - 3) + '</span>' : '')
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
    const cls = 'pcal-item' + (p.bought ? ' is-done' : '') + (p._projected ? ' is-projected' : '');
    const recur = p.recurring ? ' <span title="Повторюється щомісяця">🔁</span>' : '';
    const cred = p.credit
      ? ' <span title="Платіж за кредит" style="color:#a78bfa">💳 ' + (Number(p.creditMonthIndex) || 1) + '/' + (Number(p.creditMonths) || '?') + '</span>'
      : '';
    const proj = p._projected ? ' <span class="pcal-item-proj">(прогноз)</span>' : '';
    return '<div class="' + cls + '" onclick="openPurchaseDetail(\'' + p.id + '\')">' +
      '<span class="pcal-item-icon">' + esc(purchaseIconOf(p)) + '</span>' +
      '<span class="pcal-item-name">' + esc(p.name || '') + recur + cred + proj + (p.bought ? ' · ✓' : '') + '</span>' +
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

// PWA stays alive across midnight when kept in standby; without a refresh,
// the `is-today` highlight stays on the previously rendered day. Re-render
// when the tab becomes visible and the local date has rolled over.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (_lastRenderedTodayKey && _lastRenderedTodayKey !== _todayDateKey() &&
      typeof renderPurchases === 'function') {
    renderPurchases();
  }
});
