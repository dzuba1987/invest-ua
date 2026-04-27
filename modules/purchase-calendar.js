// Purchase calendar: monthly grid with planned/done markers, day-detail
// drawer, and prev/next-month + year navigation. Shares purchaseItems and
// renderPurchases with app.js (which calls _renderPurchaseCalendar from its
// own renderPurchases pipeline so dashboard totals stay in sync with the
// calendar's selected month).

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
    const cls = 'pcal-item' + (p.bought ? ' is-done' : '');
    return '<div class="' + cls + '" onclick="openPurchaseDetail(\'' + p.id + '\')">' +
      '<span class="pcal-item-icon">' + esc(purchaseIconOf(p)) + '</span>' +
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
