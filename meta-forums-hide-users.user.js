// ==UserScript==
// @name         Meta Community Forums — Hide posts by user
// @namespace    https://github.com/userscript-meta-forums-hide-post-from-user
// @version      0.3.1
// @description  Hide posts from users on your blocklist on communityforums.atmeta.com
// @match        https://communityforums.atmeta.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = false;
  const STORAGE_KEY = 'mfHideUsers.blocklist';
  const ATTR_HIDDEN = 'data-mf-hidden-user';
  const ATTR_MENU_AUGMENTED = 'data-mf-menu-augmented';
  const TOAST_CONTAINER_ID = 'mf-hide-users-toasts';
  const PROFILE_PATH_RE = /^\/users\/([^/]+)\/(\d+)\/?$/;

  /** @type {{ login: string, id: string } | null} */
  let lastClickedProfile = null;

  function log() {
    if (DEBUG) console.log.apply(console, ['[mf-hide-users]'].concat([].slice.call(arguments)));
  }

  function injectStyle() {
    const id = 'mf-hide-users-style';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent =
      '[' +
      ATTR_HIDDEN +
      '="1"]{display:none!important;}' +
      '#' +
      TOAST_CONTAINER_ID +
      '{position:fixed;bottom:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(420px,calc(100vw - 40px));}' +
      '.mf-toast{pointer-events:auto;padding:10px 14px;border-radius:8px;font:14px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.18);opacity:0;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease;word-wrap:break-word;}' +
      '.mf-toast.mf-toast--visible{opacity:1;transform:translateY(0);}' +
      '.mf-toast--success{background:#1b5e20;color:#fff;}' +
      '.mf-toast--error{background:#b71c1c;color:#fff;}' +
      '.mf-toast--info{background:#37474f;color:#fff;}';
    document.documentElement.appendChild(el);
  }

  /** @param {'success'|'error'|'info'} [kind] */
  function showToast(message, kind) {
    injectStyle();
    var k = kind || 'info';
    var root = document.getElementById(TOAST_CONTAINER_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = TOAST_CONTAINER_ID;
      root.setAttribute('aria-live', 'polite');
      document.documentElement.appendChild(root);
    }
    var el = document.createElement('div');
    el.className = 'mf-toast mf-toast--' + k;
    el.setAttribute('role', 'status');
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add('mf-toast--visible');
    });
    var dismissMs = k === 'error' ? 5500 : 4000;
    setTimeout(function () {
      el.classList.remove('mf-toast--visible');
      var done = function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      };
      el.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 300);
    }, dismissMs);
  }

  function normalizeEntry(e) {
    return {
      id: e && e.id != null ? String(e.id) : '',
      login: e && e.login != null ? String(e.login).toLowerCase() : '',
    };
  }

  function dedupeBlocked(blocked) {
    const merged = [];
    blocked.forEach(function (entry) {
      const id = String(entry.id || '');
      const login = String(entry.login || '').toLowerCase();
      let ix = -1;
      for (let i = 0; i < merged.length; i++) {
        const m = merged[i];
        if (id && m.id === id) {
          ix = i;
          break;
        }
        if (login && m.login === login) {
          ix = i;
          break;
        }
      }
      if (ix === -1) {
        merged.push({ id: id, login: login });
        return;
      }
      const m = merged[ix];
      if (!m.id && id) m.id = id;
      if (!m.login && login) m.login = login;
    });
    return merged;
  }

  function migrateLegacyToBlocked(data) {
    const blocked = [];
    if (Array.isArray(data.userIds)) {
      data.userIds.forEach(function (id) {
        blocked.push({ id: String(id), login: '' });
      });
    }
    if (Array.isArray(data.logins)) {
      data.logins.forEach(function (login) {
        blocked.push({ id: '', login: String(login).toLowerCase() });
      });
    }
    return dedupeBlocked(blocked);
  }

  function loadBlocklist() {
    try {
      const raw = GM_getValue(STORAGE_KEY, null);
      if (raw == null || raw === '') {
        return { blocked: [] };
      }
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed.blocked)) {
        return { blocked: dedupeBlocked(parsed.blocked.map(normalizeEntry)) };
      }
      if (Array.isArray(parsed.userIds) || Array.isArray(parsed.logins)) {
        return { blocked: migrateLegacyToBlocked(parsed) };
      }
      return { blocked: [] };
    } catch (e) {
      log('loadBlocklist failed', e);
      return { blocked: [] };
    }
  }

  function saveBlocklist(bl) {
    const blocked = dedupeBlocked(bl.blocked.map(normalizeEntry));
    GM_setValue(STORAGE_KEY, JSON.stringify({ blocked: blocked }));
  }

  function parseProfileFromHref(hrefOrUrl) {
    if (!hrefOrUrl || typeof hrefOrUrl !== 'string') return null;
    var path = hrefOrUrl.trim();
    try {
      if (path.indexOf('http://') === 0 || path.indexOf('https://') === 0) {
        path = new URL(path).pathname;
      }
    } catch (e) {
      return null;
    }
    if (path.charAt(0) !== '/') path = '/' + path;
    var m = path.match(PROFILE_PATH_RE);
    if (!m) return null;
    return { login: m[1], id: m[2] };
  }

  function parseBlocklistInput(input) {
    var s = (input || '').trim();
    if (!s) return null;
    var fromHref = parseProfileFromHref(s);
    if (fromHref) {
      return { id: String(fromHref.id), login: String(fromHref.login).toLowerCase() };
    }
    if (/^\d+$/.test(s)) {
      return { id: s, login: '' };
    }
    if (/^[A-Za-z0-9._-]+$/.test(s)) {
      return { id: '', login: s.toLowerCase() };
    }
    return null;
  }

  function isBlocked(login, id) {
    var lid = String(id);
    var llogin = login ? String(login).toLowerCase() : '';
    return loadBlocklist().blocked.some(function (e) {
      if (e.id && String(e.id) === lid) return true;
      if (llogin && e.login && String(e.login).toLowerCase() === llogin) return true;
      return false;
    });
  }

  function isProfileUserLink(a) {
    if (a.getAttribute('data-testid') !== 'userLink') return false;
    var href = a.getAttribute('href');
    if (!href || href.indexOf('http') === 0) return false;
    return PROFILE_PATH_RE.test(href.split('?')[0]);
  }

  function getCanonicalAuthorLink(article) {
    var links = article.querySelectorAll('a[data-testid="userLink"]');
    var candidates = [];
    links.forEach(function (a) {
      if (!(a instanceof HTMLAnchorElement)) return;
      if (!isProfileUserLink(a)) return;
      if (a.closest('[class*="lia-g-message-body"]')) return;
      if (a.closest('[data-testid="MessageAuthorBio"]')) return;
      candidates.push(a);
    });
    if (!candidates.length) return null;
    candidates.sort(function (x, y) {
      var c = x.compareDocumentPosition(y);
      if (c & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (c & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return candidates[0];
  }

  function getHideRoot(article) {
    var li = article.closest('li[data-testid="UnstyledList.ListItem"]');
    if (li) return li;
    return article;
  }

  function getMain() {
    return document.querySelector('main#main-content');
  }

  function mergeParsedIntoBlocklist(parsed) {
    var bl = loadBlocklist();
    bl.blocked.push({
      id: String(parsed.id),
      login: String(parsed.login).toLowerCase(),
    });
    saveBlocklist(bl);
    scheduleApply();
  }

  function removeEntriesMatching(criteria) {
    var id = String(criteria.id || '');
    var login = String(criteria.login || '').toLowerCase();
    var bl = loadBlocklist();
    bl.blocked = bl.blocked.filter(function (e) {
      if (id && String(e.id) === id) return false;
      if (login && String(e.login).toLowerCase() === login) return false;
      return true;
    });
    saveBlocklist(bl);
    scheduleApply();
  }

  function getAuthorFromMessageMenu(menuItem) {
    var article = menuItem.closest('article[data-testid="StandardMessageView"]');
    if (!article) return null;
    var link = getCanonicalAuthorLink(article);
    if (!link) return null;
    return parseProfileFromHref(link.getAttribute('href') || '');
  }

  function augmentMessageActionMenu(menu) {
    if (!(menu instanceof HTMLElement)) return;
    if (menu.getAttribute('data-testid') !== 'MessageActionMenu.item') return;
    if (menu.hasAttribute(ATTR_MENU_AUGMENTED)) return;
    var main = getMain();
    if (!main || !main.contains(menu)) return;
    if (!getAuthorFromMessageMenu(menu)) return;
    menu.setAttribute(ATTR_MENU_AUGMENTED, 'true');
    var sample =
      menu.querySelector('a[role="button"]') ||
      menu.querySelector('a[class*="dropdown-item"]') ||
      menu.querySelector('a');
    var itemClass = sample ? sample.className : '';
    var divider = menu.querySelector('[role="separator"]');
    var divEl = divider ? divider.cloneNode(false) : document.createElement('div');
    if (!divider) {
      divEl.setAttribute('role', 'separator');
      divEl.className = 'styles_dropdown-divider__nF3c9';
    }
    var a = document.createElement('a');
    a.setAttribute('href', '#');
    a.setAttribute('role', 'button');
    if (itemClass) a.className = itemClass;
    a.setAttribute('data-mf-action', 'block-author');
    a.textContent = 'Block this user';
    menu.appendChild(divEl);
    menu.appendChild(a);
  }

  function augmentMessageActionMenusInMain() {
    var main = getMain();
    if (!main) return;
    main.querySelectorAll('div[data-testid="MessageActionMenu.item"]').forEach(function (m) {
      augmentMessageActionMenu(m);
    });
  }

  function applyHiding() {
    injectStyle();
    var main = getMain();
    if (!main) {
      log('no main#main-content');
      return;
    }

    main.querySelectorAll('[' + ATTR_HIDDEN + '="1"]').forEach(function (el) {
      el.removeAttribute(ATTR_HIDDEN);
    });

    var articles = main.querySelectorAll('article[data-testid="StandardMessageView"]');
    articles.forEach(function (article) {
      var link = getCanonicalAuthorLink(article);
      if (!link) return;
      var parsed = parseProfileFromHref(link.getAttribute('href') || '');
      if (!parsed) return;
      if (!isBlocked(parsed.login, parsed.id)) return;
      var root = getHideRoot(article);
      root.setAttribute(ATTR_HIDDEN, '1');
    });

    augmentMessageActionMenusInMain();
  }

  var scheduled = null;
  function scheduleApply() {
    if (scheduled != null) cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(function () {
      scheduled = null;
      try {
        applyHiding();
      } catch (e) {
        log('applyHiding error', e);
      }
    });
  }

  function debouncedApply() {
    if (debouncedApply._t) clearTimeout(debouncedApply._t);
    debouncedApply._t = setTimeout(function () {
      debouncedApply._t = null;
      scheduleApply();
    }, 120);
  }

  function onDocumentClickCapture(ev) {
    var main = getMain();
    if (!main || !ev.target || !main.contains(ev.target)) return;
    var a = ev.target.closest && ev.target.closest('a[data-testid="userLink"]');
    if (!(a instanceof HTMLAnchorElement) || !main.contains(a)) return;
    if (!isProfileUserLink(a)) return;
    var parsed = parseProfileFromHref(a.getAttribute('href') || '');
    if (parsed) {
      lastClickedProfile = parsed;
      log('lastClickedProfile', parsed);
    }
  }

  function promptAdd() {
    var input = window.prompt(
      'Block user: paste profile URL or /users/login/id, numeric user id only, or login name:',
    );
    if (input == null) return;
    var entry = parseBlocklistInput(input);
    if (!entry) {
      showToast(
        'Could not parse input. Use a profile URL, /users/login/id, digits only, or a login name.',
        'error',
      );
      return;
    }
    var bl = loadBlocklist();
    bl.blocked.push(entry);
    saveBlocklist(bl);
    scheduleApply();
    showToast('Updated blocklist.', 'success');
  }

  function promptRemove() {
    var input = window.prompt(
      'Unblock user: paste profile URL or /users/login/id, numeric user id only, or login name:',
    );
    if (input == null) return;
    var entry = parseBlocklistInput(input);
    if (!entry) {
      showToast('Could not parse input.', 'error');
      return;
    }
    removeEntriesMatching(entry);
    showToast('Updated blocklist.', 'success');
  }

  function showBlocklistJson() {
    var bl = loadBlocklist();
    var text = JSON.stringify(bl, null, 2);
    window.prompt('Current blocklist (copy JSON):', text);
  }

  function importBlocklistJson() {
    var input = window.prompt('Paste blocklist JSON: { "blocked": [ { "id": "123", "login": "name" } ] }');
    if (input == null) return;
    try {
      var data = JSON.parse(input.trim());
      var blocked = [];
      if (Array.isArray(data.blocked)) {
        blocked = data.blocked.map(normalizeEntry);
      } else if (Array.isArray(data.userIds) || Array.isArray(data.logins)) {
        blocked = migrateLegacyToBlocked(data);
      }
      saveBlocklist({ blocked: blocked });
      scheduleApply();
      showToast('Blocklist imported.', 'success');
    } catch (e) {
      showToast('Invalid JSON.', 'error');
    }
  }

  function blockLastClicked() {
    if (!lastClickedProfile) {
      showToast(
        'No profile link clicked yet in this tab. Click a username/avatar on a post first.',
        'error',
      );
      return;
    }
    mergeParsedIntoBlocklist(lastClickedProfile);
    showToast('Blocked: ' + lastClickedProfile.login + ' (' + lastClickedProfile.id + ')', 'success');
  }

  GM_registerMenuCommand('MF: Add to blocklist…', promptAdd);
  GM_registerMenuCommand('MF: Remove from blocklist…', promptRemove);
  GM_registerMenuCommand('MF: Block last-clicked profile', blockLastClicked);
  GM_registerMenuCommand('MF: View blocklist (JSON)…', showBlocklistJson);
  GM_registerMenuCommand('MF: Import blocklist (JSON)…', importBlocklistJson);

  document.addEventListener('click', onDocumentClickCapture, true);

  document.addEventListener(
    'click',
    function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest('[data-mf-action="block-author"]');
      if (!t || !(t instanceof HTMLElement)) return;
      var menu = t.closest('div[data-testid="MessageActionMenu.item"]');
      if (!menu) return;
      ev.preventDefault();
      ev.stopPropagation();
      var parsed = getAuthorFromMessageMenu(menu);
      if (!parsed) {
        showToast('Could not resolve author for this post.', 'error');
        return;
      }
      if (isBlocked(parsed.login, parsed.id)) {
        showToast(parsed.login + ' is already on your blocklist.', 'info');
        return;
      }
      mergeParsedIntoBlocklist(parsed);
      showToast('Blocked: ' + parsed.login, 'success');
    },
    true,
  );

  var obs = new MutationObserver(function () {
    debouncedApply();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  scheduleApply();
})();
