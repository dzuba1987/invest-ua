// Purchase date/month formatting helpers shared by the purchase form,
// the calendar, and the dashboard. Top-level declarations are global by
// virtue of being a non-module script — reachable from app.js as well.

const UA_MONTHS_GENITIVE = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
                            'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const UA_MONTHS_LOCATIVE = ['січні', 'лютому', 'березні', 'квітні', 'травні', 'червні',
                            'липні', 'серпні', 'вересні', 'жовтні', 'листопаді', 'грудні'];

function formatMonthLocative(monthKey) {
  if (!monthKey) return '';
  const [y, m] = monthKey.split('-').map(Number);
  return (UA_MONTHS_LOCATIVE[m - 1] || '') + ' ' + y;
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
  // Falls back to formatMonthKey defined in app.js. Safe at runtime — both
  // scripts are loaded before any UI event triggers a render.
  return formatMonthKey(p.plannedMonth);
}

// Add one month to a YYYY-MM-DD date, clamping the day to the last day of
// the next month (e.g., 2026-01-31 → 2026-02-28).
function _addOneMonthDate(dateStr) {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr), m = Number(mStr), d = Number(dStr);
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return ny + '-' + String(nm).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}
