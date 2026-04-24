// In-app replacement for native alert / confirm / prompt.
//
//   toast(msg, type?)     — short, non-blocking snackbar. type: 'ok' | 'err' | 'info' (default).
//   uiConfirm(msg, opts?) — Promise<boolean>; opts: { okText, cancelText, danger }.
//   uiPrompt(label, opts?)— Promise<string|null>; opts: { defaultValue, placeholder, okText, cancelText, multiline, type ('text'|'number') }.
//
// window.alert is overridden to route through toast() so the existing call
// sites continue to work without changes. confirm/prompt must be migrated
// to uiConfirm/uiPrompt explicitly, because they return synchronously in the
// browser and our replacements are Promise-based.
(function () {
  'use strict';

  function _escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _ensureToastLayer() {
    let el = document.getElementById('uiToastLayer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uiToastLayer';
      el.className = 'ui-toast-layer';
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(msg, type) {
    if (msg == null) return;
    const text = String(msg);
    // Detect type from common prefixes if not explicitly passed.
    if (!type) {
      if (/^(✗|❌|⚠|Помилка)/.test(text)) type = 'err';
      else if (/^(✓|✅|🎉)/.test(text)) type = 'ok';
      else type = 'info';
    }
    const layer = _ensureToastLayer();
    const el = document.createElement('div');
    el.className = 'ui-toast ui-toast-' + type;
    el.innerHTML = '<span class="ui-toast-msg">' + _escapeHtml(text).replace(/\n/g, '<br>') + '</span>' +
                   '<button type="button" class="ui-toast-close" aria-label="Закрити">✕</button>';
    layer.appendChild(el);
    // Entry animation
    requestAnimationFrame(() => el.classList.add('ui-toast-show'));

    const close = () => {
      if (el._closed) return;
      el._closed = true;
      el.classList.remove('ui-toast-show');
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector('.ui-toast-close').addEventListener('click', close);
    // Auto-close after a timeout scaled by message length.
    const timeout = Math.min(8000, 2600 + text.length * 35);
    setTimeout(close, timeout);
  }

  function _renderDialog({ title, bodyHtml, buttons, onEscape }) {
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'ui-dialog-backdrop';
      backdrop.innerHTML =
        '<div class="ui-dialog" role="dialog" aria-modal="true">' +
          (title ? '<div class="ui-dialog-title">' + _escapeHtml(title) + '</div>' : '') +
          '<div class="ui-dialog-body">' + bodyHtml + '</div>' +
          '<div class="ui-dialog-footer"></div>' +
        '</div>';
      document.body.appendChild(backdrop);
      // Focus trap (simple): previously focused element restored on close.
      const prevFocus = document.activeElement;

      const footer = backdrop.querySelector('.ui-dialog-footer');
      const close = value => {
        document.removeEventListener('keydown', onKey);
        backdrop.classList.remove('ui-dialog-show');
        setTimeout(() => backdrop.remove(), 150);
        if (prevFocus && typeof prevFocus.focus === 'function') {
          try { prevFocus.focus(); } catch(_) {}
        }
        resolve(value);
      };

      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ui-dialog-btn ' + (b.className || '');
        btn.textContent = b.text;
        btn.addEventListener('click', () => close(b.value));
        footer.appendChild(btn);
      });

      const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); close(onEscape != null ? onEscape : null); }
      };
      document.addEventListener('keydown', onKey);

      // Click outside the dialog cancels (same as Escape).
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) close(onEscape != null ? onEscape : null);
      });

      // Animate in
      requestAnimationFrame(() => backdrop.classList.add('ui-dialog-show'));

      // Focus the first interactive element (input or primary button).
      setTimeout(() => {
        const target = backdrop.querySelector('input, textarea, .ui-dialog-btn-primary, .ui-dialog-btn');
        if (target) try { target.focus(); } catch(_) {}
      }, 30);
    });
  }

  function uiConfirm(message, opts) {
    const o = opts || {};
    const okText = o.okText || 'Так';
    const cancelText = o.cancelText || 'Скасувати';
    const danger = !!o.danger;
    return _renderDialog({
      title: o.title || null,
      bodyHtml: '<p class="ui-dialog-text">' + _escapeHtml(message).replace(/\n/g, '<br>') + '</p>',
      buttons: [
        { text: cancelText, value: false, className: 'ui-dialog-btn-secondary' },
        { text: okText, value: true, className: danger ? 'ui-dialog-btn-danger' : 'ui-dialog-btn-primary' }
      ],
      onEscape: false
    });
  }

  function uiPrompt(label, opts) {
    const o = opts || {};
    const def = o.defaultValue != null ? String(o.defaultValue) : '';
    const placeholder = o.placeholder != null ? String(o.placeholder) : '';
    const okText = o.okText || 'OK';
    const cancelText = o.cancelText || 'Скасувати';
    const multiline = !!o.multiline;
    const inputType = o.type === 'number' ? 'number' : 'text';
    const inputHtml = multiline
      ? '<textarea class="ui-dialog-input" id="uiDialogInput" rows="4" placeholder="' + _escapeHtml(placeholder) + '">' + _escapeHtml(def) + '</textarea>'
      : '<input type="' + inputType + '" class="ui-dialog-input" id="uiDialogInput" value="' + _escapeHtml(def) + '" placeholder="' + _escapeHtml(placeholder) + '">';
    const bodyHtml =
      (label ? '<label class="ui-dialog-label">' + _escapeHtml(label).replace(/\n/g, '<br>') + '</label>' : '') +
      inputHtml;

    return _renderDialog({
      title: o.title || null,
      bodyHtml,
      buttons: [
        { text: cancelText, value: null, className: 'ui-dialog-btn-secondary' },
        { text: okText, value: '__OK__', className: 'ui-dialog-btn-primary' }
      ],
      onEscape: null
    }).then(value => {
      // The primary button returns the sentinel; fetch the input's current value.
      if (value === null) return null;
      const input = document.getElementById('uiDialogInput');
      // Dialog is already closed, so fetch before close via event? Actually
      // _renderDialog removes the DOM on resolve. We need to capture value
      // before close. Work around by reading right before.
      return value; // handled below via a custom version
    });
  }

  // Because _renderDialog removes DOM before resolving, we override uiPrompt
  // to read the input value inside the button click handler.
  function uiPromptFinal(label, opts) {
    const o = opts || {};
    const def = o.defaultValue != null ? String(o.defaultValue) : '';
    const placeholder = o.placeholder != null ? String(o.placeholder) : '';
    const okText = o.okText || 'OK';
    const cancelText = o.cancelText || 'Скасувати';
    const multiline = !!o.multiline;
    const inputType = o.type === 'number' ? 'number' : 'text';

    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'ui-dialog-backdrop';
      const inputHtml = multiline
        ? '<textarea class="ui-dialog-input" id="uiDialogInput" rows="4" placeholder="' + _escapeHtml(placeholder) + '">' + _escapeHtml(def) + '</textarea>'
        : '<input type="' + inputType + '" class="ui-dialog-input" id="uiDialogInput" value="' + _escapeHtml(def) + '" placeholder="' + _escapeHtml(placeholder) + '">';
      backdrop.innerHTML =
        '<div class="ui-dialog" role="dialog" aria-modal="true">' +
          (o.title ? '<div class="ui-dialog-title">' + _escapeHtml(o.title) + '</div>' : '') +
          '<div class="ui-dialog-body">' +
            (label ? '<label class="ui-dialog-label">' + _escapeHtml(label).replace(/\n/g, '<br>') + '</label>' : '') +
            inputHtml +
          '</div>' +
          '<div class="ui-dialog-footer">' +
            '<button type="button" class="ui-dialog-btn ui-dialog-btn-secondary" data-role="cancel">' + _escapeHtml(cancelText) + '</button>' +
            '<button type="button" class="ui-dialog-btn ui-dialog-btn-primary" data-role="ok">' + _escapeHtml(okText) + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(backdrop);
      const prevFocus = document.activeElement;
      const input = backdrop.querySelector('#uiDialogInput');
      const cancelBtn = backdrop.querySelector('[data-role="cancel"]');
      const okBtn = backdrop.querySelector('[data-role="ok"]');

      const close = val => {
        document.removeEventListener('keydown', onKey);
        backdrop.classList.remove('ui-dialog-show');
        setTimeout(() => backdrop.remove(), 150);
        if (prevFocus && typeof prevFocus.focus === 'function') {
          try { prevFocus.focus(); } catch(_) {}
        }
        resolve(val);
      };
      cancelBtn.addEventListener('click', () => close(null));
      okBtn.addEventListener('click', () => close(input.value));

      const onKey = e => {
        if (e.key === 'Escape') close(null);
        else if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          close(input.value);
        }
      };
      document.addEventListener('keydown', onKey);
      backdrop.addEventListener('click', e => { if (e.target === backdrop) close(null); });

      requestAnimationFrame(() => backdrop.classList.add('ui-dialog-show'));
      setTimeout(() => { try { input.focus(); input.select && input.select(); } catch(_) {} }, 30);
    });
  }

  // Convenience wrappers for inline `onclick` handlers where going full async
  // is awkward (template-literal strings). Usage:
  //   onclick="confirmThen('Delete?', () => deleteX(123))"
  //   onclick="confirmThen('Delete?', () => deleteX(123), { danger: true })"
  async function confirmThen(message, action, opts) {
    if (await uiConfirm(message, opts)) {
      try { action(); } catch(e) { console.warn('confirmThen action threw:', e); }
    }
  }

  // Expose globals.
  window.toast = toast;
  window.uiConfirm = uiConfirm;
  window.uiPrompt = uiPromptFinal;
  window.confirmThen = confirmThen;

  // Route legacy alert() through the toast system — drop-in replacement,
  // non-blocking, no return value required by callers.
  window.alert = function (msg) { toast(msg); };
})();
