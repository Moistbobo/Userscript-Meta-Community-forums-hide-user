// ==UserScript==
// @name         Meta Community Forums — Hide posts by user
// @namespace    https://github.com/userscript-meta-forums-hide-post-from-user
// @version      0.1.0
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
  const PROFILE_PATH_RE = /^\/users\/([^/]+)\/(\d+)\/?$/;

  /** @type {{ login: string, id: string } | null} */
  let lastClickedProfile = null;

  function log(...args) {
    if (DEBUG) console.log('[mf-hide-users]', ...args);
  }

  function injectStyle() {
    const id = 'mf-hide-users-style';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = '[' + ATTR_HIDDEN + '="1"]{display:none!important;}';
    document.documentElement.appendChild(el);
  }

  function loadBlocklist() {
    try {
      const raw = GM_getValue(STORAGE_KEY, null);
      if (raw == null || raw === '') {
        return { userIds: [], logins: [] };
      }
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        userIds: Array.isArray(data.userIds) ? data.userIds.map(String) : [],
        logins: Array.isArray(data.logins)
          ? data.logins.map(String).map((s) => s.toLowerCase())
          : [],
      };
    } catch (e) {
      log('loadBlocklist failed', e);
      return { userIds: [], logins: [] };
    }
  }

  function saveBlocklist(bl) {
    const userIds = Array.from(new Set(bl.userIds.map(String)));
    const logins = Array.from(new Set(bl.logins.map(String).map(function (s) { return s.toLowerCase(); })));
    GM_setValue(STORAGE_KEY, JSON.stringify({ userIds: userIds, logins: logins }));
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
      return { userIds: [fromHref.id], logins: [fromHref.login.toLowerCase()] };
    }
    if (/^\d+$/.test(s)) {
      return { userIds: [s], logins: [] };
    }
    if (/^[A-Za-z0-9._-]+$/.test(s)) {
      return { userIds: [], logins: [s.toLowerCase()] };
    }
    return null;
  }

  function isBlocked(login, id) {
    var bl = loadBlocklist();
    if (bl.userIds.indexOf(String(id)) !== -1) return true;
    if (login && bl.logins.indexOf(String(login).toLowerCase()) !== -1) return true;
    return false;
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
    var parsed = parseBlocklistInput(input);
    if (!parsed) {
      window.alert('Could not parse input. Use a profile URL, /users/login/id, digits only, or a login name.');
      return;
    }
    var bl = loadBlocklist();
    (parsed.userIds || []).forEach(function (id) { bl.userIds.push(id); });
    (parsed.logins || []).forEach(function (l) { bl.logins.push(l); });
    saveBlocklist(bl);
    scheduleApply();
    window.alert('Updated blocklist.');
  }

  function promptRemove() {
    var input = window.prompt(
      'Unblock user: paste profile URL or /users/login/id, numeric user id only, or login name:',
    );
    if (input == null) return;
    var parsed = parseBlocklistInput(input);
    if (!parsed) {
      window.alert('Could not parse input.');
      return;
    }
    var bl = loadBlocklist();
    var idSet = {};
    (parsed.userIds || []).forEach(function (id) { idSet[id] = true; });
    var loginSet = {};
    (parsed.logins || []).forEach(function (l) { loginSet[String(l).toLowerCase()] = true; });
    bl.userIds = bl.userIds.filter(function (id) { return !idSet[id]; });
    bl.logins = bl.logins.filter(function (l) { return !loginSet[String(l).toLowerCase()]; });
    saveBlocklist(bl);
    scheduleApply();
    window.alert('Updated blocklist.');
  }

  function showBlocklistJson() {
    var bl = loadBlocklist();
    var text = JSON.stringify(bl, null, 2);
    window.prompt('Current blocklist (copy JSON):', text);
  }

  function importBlocklistJson() {
    var input = window.prompt('Paste blocklist JSON { "userIds": [], "logins": [] }:');
    if (input == null) return;
    try {
      var data = JSON.parse(input.trim());
      var bl = {
        userIds: Array.isArray(data.userIds) ? data.userIds.map(String) : [],
        logins: Array.isArray(data.logins) ? data.logins.map(String) : [],
      };
      saveBlocklist(bl);
      scheduleApply();
      window.alert('Blocklist imported.');
    } catch (e) {
      window.alert('Invalid JSON.');
    }
  }

  function blockLastClicked() {
    if (!lastClickedProfile) {
      window.alert('No profile link clicked yet in this tab. Click a username/avatar on a post first.');
      return;
    }
    var bl = loadBlocklist();
    bl.userIds.push(lastClickedProfile.id);
    bl.logins.push(lastClickedProfile.login.toLowerCase());
    saveBlocklist(bl);
    scheduleApply();
    window.alert('Blocked: ' + lastClickedProfile.login + ' (' + lastClickedProfile.id + ')');
  }

  GM_registerMenuCommand('MF: Add to blocklist…', promptAdd);
  GM_registerMenuCommand('MF: Remove from blocklist…', promptRemove);
  GM_registerMenuCommand('MF: Block last-clicked profile', blockLastClicked);
  GM_registerMenuCommand('MF: View blocklist (JSON)…', showBlocklistJson);
  GM_registerMenuCommand('MF: Import blocklist (JSON)…', importBlocklistJson);

  document.addEventListener('click', onDocumentClickCapture, true);

  var obs = new MutationObserver(function () {
    debouncedApply();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  scheduleApply();
})();
