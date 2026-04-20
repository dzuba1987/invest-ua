// ================================================================
// ==================== FORM DRAFTS ================================
// ================================================================
// Universal helper to protect unsaved form edits from being lost when
// the user switches tabs, closes the form, or reloads the page.
//
// Register a form once, then:
//   - typing is throttled-saved to localStorage under `draft:<formId>`
//   - FormDrafts.isDirty(id) tells if snapshot differs from last-seen "clean"
//   - FormDrafts.confirmDiscard(id) returns true if user agrees to lose edits
//   - FormDrafts.restore(id) fills fields from the draft
//   - FormDrafts.clear(id) should be called after a successful save
//
// beforeunload is handled globally: any dirty registered form triggers a prompt.

(function () {
  const DRAFT_KEY_PREFIX = 'draft:';
  const THROTTLE_MS = 400;

  const registry = new Map(); // formId → { fields, baseline, saveTimer, opts }

  function draftKey(id) { return DRAFT_KEY_PREFIX + id; }

  function readFieldValue(el) {
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    return el.value != null ? el.value : '';
  }

  function writeFieldValue(el, value) {
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = !!value;
    } else {
      el.value = value == null ? '' : value;
    }
  }

  function snapshot(fields) {
    const out = {};
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) out[id] = readFieldValue(el);
    });
    return out;
  }

  function valuesEqual(a, b) {
    if (!a || !b) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if ((a[k] ?? '') !== (b[k] ?? '')) return false;
    }
    return true;
  }

  function hasAnyValue(values) {
    return Object.values(values || {}).some(v => {
      if (typeof v === 'boolean') return v;
      return v != null && String(v).trim() !== '';
    });
  }

  function saveDraft(id) {
    const entry = registry.get(id);
    if (!entry) return;
    const values = snapshot(entry.fields);
    try {
      // Only persist if form differs from baseline (avoid clobbering empties)
      if (valuesEqual(values, entry.baseline)) {
        localStorage.removeItem(draftKey(id));
      } else {
        localStorage.setItem(draftKey(id), JSON.stringify({ values, savedAt: Date.now() }));
      }
    } catch (_) { /* quota exceeded — ignore */ }
  }

  function scheduleSave(id) {
    const entry = registry.get(id);
    if (!entry) return;
    if (entry.saveTimer) clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => saveDraft(id), THROTTLE_MS);
  }

  const FormDrafts = {
    /**
     * Register a form.
     * @param {string} id - unique form id (e.g. "portfolio.new", "dream.edit.abc123")
     * @param {string[]} fields - array of DOM element ids belonging to the form
     * @param {object} [opts] - reserved for future options
     */
    register(id, fields, opts = {}) {
      // Replace any previous registration for the same id
      this.unregister(id);

      const entry = {
        fields,
        baseline: snapshot(fields),
        saveTimer: null,
        opts,
        listeners: [],
      };
      registry.set(id, entry);

      fields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (!el) return;
        const evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
        const handler = () => scheduleSave(id);
        el.addEventListener(evt, handler);
        entry.listeners.push({ el, evt, handler });
      });
    },

    /**
     * Set the "clean" baseline — call this right after programmatically filling the
     * form with known values (e.g. when opening edit form with existing item data).
     * Also clears any stale draft for this id.
     */
    setBaseline(id) {
      const entry = registry.get(id);
      if (!entry) return;
      entry.baseline = snapshot(entry.fields);
      if (entry.saveTimer) { clearTimeout(entry.saveTimer); entry.saveTimer = null; }
      try { localStorage.removeItem(draftKey(id)); } catch (_) {}
    },

    unregister(id) {
      const entry = registry.get(id);
      if (!entry) return;
      if (entry.saveTimer) clearTimeout(entry.saveTimer);
      entry.listeners.forEach(({ el, evt, handler }) => el.removeEventListener(evt, handler));
      registry.delete(id);
    },

    /** True when the current DOM values differ from baseline. */
    isDirty(id) {
      const entry = registry.get(id);
      if (!entry) return false;
      return !valuesEqual(snapshot(entry.fields), entry.baseline);
    },

    /** True when a persisted draft exists for this form id. */
    hasDraft(id) {
      try {
        const raw = localStorage.getItem(draftKey(id));
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed && parsed.values && hasAnyValue(parsed.values);
      } catch (_) {
        return false;
      }
    },

    /** Return the persisted draft payload or null. */
    getDraft(id) {
      try {
        const raw = localStorage.getItem(draftKey(id));
        return raw ? JSON.parse(raw) : null;
      } catch (_) { return null; }
    },

    /**
     * Fill form fields from the persisted draft. Updates baseline so the form
     * is considered "dirty" again only after the user edits further.
     */
    restore(id) {
      const entry = registry.get(id);
      const draft = this.getDraft(id);
      if (!entry || !draft || !draft.values) return false;
      Object.entries(draft.values).forEach(([fieldId, v]) => {
        const el = document.getElementById(fieldId);
        if (el) writeFieldValue(el, v);
      });
      return true;
    },

    /** Remove the persisted draft and reset baseline to current DOM values. */
    clear(id) {
      try { localStorage.removeItem(draftKey(id)); } catch (_) {}
      const entry = registry.get(id);
      if (entry) {
        entry.baseline = snapshot(entry.fields);
        if (entry.saveTimer) { clearTimeout(entry.saveTimer); entry.saveTimer = null; }
      }
    },

    /**
     * Show confirm dialog if the form is dirty. Returns true if the caller may
     * proceed (form is clean or user agreed to discard).
     * @param {string} id
     * @param {string} [message]
     */
    confirmDiscard(id, message) {
      if (!this.isDirty(id)) return true;
      const ok = confirm(message || 'У формі є незбережені зміни. Вийти без збереження?');
      if (ok) this.clear(id);
      return ok;
    },

    /** Returns the first dirty form id, or null. */
    firstDirty() {
      for (const id of registry.keys()) {
        if (this.isDirty(id)) return id;
      }
      return null;
    },
  };

  // Global unload guard — triggers browser's "leave site?" prompt
  window.addEventListener('beforeunload', e => {
    if (FormDrafts.firstDirty()) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  window.FormDrafts = FormDrafts;
})();
