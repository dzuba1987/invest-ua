// Purchase add/edit form: open/close, populate, validate, and persist.
// Cooperates with renderPurchases / _persistPurchase / savePurchasesToFirestore
// in app.js (top-level globals) and date helpers in purchase-helpers.js.

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
    onPurchaseCreditChange();
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
  const amountEl = document.getElementById('purchaseAmount');
  amountEl.value = '';
  amountEl.readOnly = false;
  document.getElementById('purchaseCurrency').value = 'UAH';
  _setPurchaseDate(_todayDateKey());
  document.getElementById('purchaseLink').value = '';
  document.getElementById('purchaseNotes').value = '';
  document.getElementById('purchaseRecurring').checked = false;
  const credit = document.getElementById('purchaseCredit');
  if (credit) credit.checked = false;
  const cTotal = document.getElementById('purchaseCreditTotal');
  if (cTotal) cTotal.value = '';
  const cMonths = document.getElementById('purchaseCreditMonths');
  if (cMonths) cMonths.value = '';
  const cFields = document.getElementById('purchaseCreditFields');
  if (cFields) cFields.style.display = 'none';
  document.getElementById('purchaseIcon').value = DEFAULT_PURCHASE_ICON;
  renderPurchaseIconPicker();
  onPurchaseCurrencyChange();
}

// Mutually exclusive: turning on "credit" disables/unchecks recurring,
// shows the credit fields, and locks `purchaseAmount` (it becomes derived
// from creditTotal/creditMonths). Turning it off restores the manual flow.
function onPurchaseCreditChange() {
  const credit = document.getElementById('purchaseCredit');
  const fields = document.getElementById('purchaseCreditFields');
  const recurring = document.getElementById('purchaseRecurring');
  const amount = document.getElementById('purchaseAmount');
  const isOn = !!(credit && credit.checked);
  if (fields) fields.style.display = isOn ? '' : 'none';
  if (isOn && recurring) recurring.checked = false;
  if (amount) {
    amount.readOnly = isOn;
    if (isOn) onPurchaseCreditCalcChange();
    else if (_editingPurchaseId == null) amount.value = '';
  }
}

function onPurchaseRecurringChange() {
  const recurring = document.getElementById('purchaseRecurring');
  if (recurring && recurring.checked) {
    const credit = document.getElementById('purchaseCredit');
    if (credit && credit.checked) {
      credit.checked = false;
      onPurchaseCreditChange();
    }
  }
}

// Recompute monthly installment = creditTotal / creditMonths and put it
// into `purchaseAmount` so downstream code (budget, calendar, dashboard)
// keeps treating it as a regular expense amount.
function onPurchaseCreditCalcChange() {
  const totalEl = document.getElementById('purchaseCreditTotal');
  const monthsEl = document.getElementById('purchaseCreditMonths');
  const amount = document.getElementById('purchaseAmount');
  if (!totalEl || !monthsEl || !amount) return;
  const total = parseNum(totalEl.value);
  const months = parseInt(monthsEl.value, 10);
  if (total > 0 && months > 0) {
    amount.value = formatShort(total / months);
  } else {
    amount.value = '';
  }
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
  let recurring = !!document.getElementById('purchaseRecurring').checked;
  const creditOn = !!(document.getElementById('purchaseCredit') && document.getElementById('purchaseCredit').checked);
  let creditTotal = null, creditMonths = null;
  const err = document.getElementById('purchaseError');
  err.textContent = '';

  if (!name) { err.textContent = 'Вкажіть назву'; return; }
  if (creditOn) {
    creditTotal = parseNum(document.getElementById('purchaseCreditTotal').value);
    creditMonths = parseInt(document.getElementById('purchaseCreditMonths').value, 10);
    if (!(creditTotal > 0)) { err.textContent = 'Вкажіть суму кредиту більше 0'; return; }
    if (!(creditMonths > 0) || creditMonths > 240) { err.textContent = 'Період має бути від 1 до 240 місяців'; return; }
    recurring = false;
  }
  if (!(amount > 0)) { err.textContent = 'Вкажіть суму більше 0'; return; }
  if (link && !/^https?:\/\//i.test(link)) { err.textContent = 'Посилання має починатися з http:// або https://'; return; }

  const payload = { name, icon, amount, currency, plannedDate, plannedMonth: month, link, notes, recurring };
  if (creditOn) {
    const existing = _editingPurchaseId ? _findPurchase(_editingPurchaseId) : null;
    payload.credit = true;
    payload.creditTotal = creditTotal;
    payload.creditMonths = creditMonths;
    // Preserve series anchor on edit; create fresh on new.
    payload.creditStartMonth = (existing && existing.item.creditStartMonth) || month;
    payload.creditMonthIndex = (existing && existing.item.creditMonthIndex) || 1;
  } else if (_editingPurchaseId) {
    // Editing an existing item and credit was turned off — clear credit fields.
    payload.credit = false;
    payload.creditTotal = null;
    payload.creditMonths = null;
    payload.creditStartMonth = null;
    payload.creditMonthIndex = null;
  }

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

    // Recurring/credit + record: spawn next-month copy preserving day-of-month.
    // For credit, only spawn while we haven't reached the final installment.
    const willSpawnCredit = creditOn && (payload.creditMonthIndex + 1) <= payload.creditMonths;
    if (recordNow && (recurring || willSpawnCredit)) {
      const nextDate = _addOneMonthDate(plannedDate);
      const nextMonth = nextDate.slice(0, 7);
      const alreadyExists = purchaseItems.some(p =>
        !p.bought
        && (p.plannedMonth || '') === nextMonth
        && String(p.name || '').trim() === name
        && (p.recurring || p.credit)
      );
      if (!alreadyExists) {
        const child = {
          ...payload,
          plannedDate: nextDate,
          plannedMonth: nextMonth,
          id: Date.now() + Math.floor(Math.random() * 1000),
          bought: false,
          deferCount: 0,
          createdAt: new Date().toISOString()
        };
        if (creditOn) child.creditMonthIndex = payload.creditMonthIndex + 1;
        purchaseItems.push(child);
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
  const creditEl = document.getElementById('purchaseCredit');
  if (creditEl) {
    creditEl.checked = !!item.credit;
    const tEl = document.getElementById('purchaseCreditTotal');
    const mEl = document.getElementById('purchaseCreditMonths');
    if (tEl) tEl.value = item.creditTotal ? formatShort(item.creditTotal) : '';
    if (mEl) mEl.value = item.creditMonths || '';
    onPurchaseCreditChange();
  }
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
