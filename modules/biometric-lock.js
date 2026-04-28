// Biometric lock — WebAuthn-based local unlock on top of Firebase session.
// Pure UX gate: assumes Firebase already keeps the user signed in. The
// platform authenticator (Face ID / Touch ID / Windows Hello / Android
// fingerprint) is used as a presence check before showing the app.
// No server-side verification — credentialId is stored in localStorage,
// the `userVerification: 'required'` flag delegates trust to the OS.

const BiometricLock = (function () {
  const RP_NAME = 'Invest UA';
  const TIMEOUT_MS = 60000;

  const KEY_CRED = (uid) => `biometricLock:credId:${uid}`;
  const KEY_ENABLED = (uid) => `biometricLock:enabled:${uid}`;
  const KEY_SESSION_UNLOCKED = (uid) => `biometricLock:unlocked:${uid}`;

  function isSupported() {
    return typeof window !== 'undefined'
      && window.PublicKeyCredential
      && typeof navigator.credentials?.create === 'function'
      && typeof navigator.credentials?.get === 'function';
  }

  async function isPlatformAuthenticatorAvailable() {
    if (!isSupported()) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  function isEnabled(uid) {
    if (!uid) return false;
    return localStorage.getItem(KEY_ENABLED(uid)) === '1'
      && !!localStorage.getItem(KEY_CRED(uid));
  }

  function isSessionUnlocked(uid) {
    if (!uid) return false;
    return sessionStorage.getItem(KEY_SESSION_UNLOCKED(uid)) === '1';
  }

  function markUnlocked(uid) {
    if (uid) sessionStorage.setItem(KEY_SESSION_UNLOCKED(uid), '1');
  }

  function clearSession(uid) {
    if (uid) sessionStorage.removeItem(KEY_SESSION_UNLOCKED(uid));
  }

  function b64uEncode(bytes) {
    let s = '';
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64uDecode(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function randomChallenge() {
    return crypto.getRandomValues(new Uint8Array(32));
  }

  async function enable(user) {
    if (!isSupported()) throw new Error('WebAuthn не підтримується цим браузером');
    if (!user || !user.uid) throw new Error('Потрібна авторизація Firebase');
    if (!(await isPlatformAuthenticatorAvailable())) {
      throw new Error('На цьому пристрої немає вбудованої біометрії');
    }

    const uidBytes = new TextEncoder().encode(user.uid);
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: RP_NAME, id: location.hostname },
        user: {
          id: uidBytes,
          name: user.email || user.uid,
          displayName: user.displayName || user.email || 'Invest UA'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: TIMEOUT_MS,
        attestation: 'none'
      }
    });
    if (!cred) throw new Error('Реєстрація скасована');

    localStorage.setItem(KEY_CRED(user.uid), b64uEncode(cred.rawId));
    localStorage.setItem(KEY_ENABLED(user.uid), '1');
    markUnlocked(user.uid);
  }

  function disable(uid) {
    if (!uid) return;
    localStorage.removeItem(KEY_CRED(uid));
    localStorage.removeItem(KEY_ENABLED(uid));
    clearSession(uid);
  }

  async function verify(uid) {
    if (!uid) throw new Error('Користувач не визначений');
    const stored = localStorage.getItem(KEY_CRED(uid));
    if (!stored) throw new Error('Біометрія не зареєстрована');

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: b64uDecode(stored) }],
        userVerification: 'required',
        timeout: TIMEOUT_MS
      }
    });
    if (!assertion) throw new Error('Перевірку скасовано');
    markUnlocked(uid);
  }

  // ============ LOCK SCREEN UI ============

  function getOverlay() {
    return document.getElementById('biometricLockOverlay');
  }

  function showLockScreen(user) {
    const el = getOverlay();
    if (!el) return;
    const nameEl = el.querySelector('[data-bio-name]');
    const avatarEl = el.querySelector('[data-bio-avatar]');
    if (nameEl) nameEl.textContent = user.displayName || user.email || '';
    if (avatarEl) {
      if (user.photoURL) {
        avatarEl.src = user.photoURL;
        avatarEl.style.display = '';
      } else {
        avatarEl.style.display = 'none';
      }
    }
    el.style.display = 'flex';
    document.body.classList.add('biometric-locked');
  }

  function hideLockScreen() {
    const el = getOverlay();
    if (el) el.style.display = 'none';
    document.body.classList.remove('biometric-locked');
  }

  async function tryUnlock(user, opts) {
    if (!user || !user.uid) return;
    const silent = !!(opts && opts.silent);
    const btn = document.getElementById('biometricUnlockBtn');
    const errEl = document.getElementById('biometricUnlockError');
    if (btn) btn.disabled = true;
    if (errEl) errEl.textContent = '';
    try {
      await verify(user.uid);
      hideLockScreen();
    } catch (e) {
      if (!silent && errEl) errEl.textContent = e.message || 'Не вдалося розблокувати';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Called on every Firebase auth state change. Decides whether to gate.
  async function checkAndLock(user) {
    if (!user || !user.uid) {
      hideLockScreen();
      return;
    }
    if (!isEnabled(user.uid)) {
      hideLockScreen();
      return;
    }
    if (isSessionUnlocked(user.uid)) {
      hideLockScreen();
      return;
    }
    showLockScreen(user);
    // Best-effort auto-prompt. Browsers that require a user gesture will throw
    // NotAllowedError — swallow silently and rely on the button.
    tryUnlock(user, { silent: true });
  }

  function lockNow() {
    const u = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (!u) return;
    clearSession(u.uid);
    if (isEnabled(u.uid)) showLockScreen(u);
  }

  return {
    isSupported,
    isPlatformAuthenticatorAvailable,
    isEnabled,
    enable,
    disable,
    verify,
    checkAndLock,
    tryUnlock,
    lockNow
  };
})();

if (typeof window !== 'undefined') window.BiometricLock = BiometricLock;
