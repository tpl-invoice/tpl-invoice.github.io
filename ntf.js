/* Notify widget — 🔔 অ্যাপের ভেতরের নোটিফিকেশন + এই ডিভাইসে Push
 *
 * পাঁচটা সাইটে একই ফাইল — মূল কপি D:\Calude Work\_shared\notify\ntf.js, প্রতিটা সাইটের বিল্ড কপি করে।
 * হোস্ট পাতায় যা লাগে:
 *   • যেকোনো বাটনে data-ntf-bell (অ্যাপের নিজের ডিজাইনেই) — এখানে লাল সংখ্যা বসে, চাপলে তালিকা খোলে
 *   • NTF.init({ app, name, call(op, arg) → Promise, sw: 'ntf-sw.js', scope: './', ext: 'Gmail' | false })
 *   • লগইন হলে NTF.start(), লগআউটের আগে NTF.logout() (এই ডিভাইসের Push বন্ধ), লগইন পাতায় NTF.stop()
 * সার্ভার: Notify.js-এর ntfHandle_ (list / read / clear / cfg / sub / unsub / test / ext / setup)।
 */
(function () {
  'use strict';
  if (window.NTF) return;

  var FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var POLL_MS = 60000;
  var O = { app: 'app', name: '', call: null, sw: 'ntf-sw.js', scope: './', ext: 'Telegram/Gmail' };
  var S = {
    items: [], ver: '', r: 0, c: 0, owner: false, started: false, open: false, view: 'list',
    busy: false, lastPoll: 0, timer: null, authFails: 0, seenR: 0, cfg: null, expanded: {}
  };
  var BN = '০১২৩৪৫৬৭৮৯';
  var MON = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
  var KIND = {
    security: ['🔐', '#e11d48'], login: ['🔐', '#0d9488'], error: ['🚨', '#dc2626'], warn: ['⚠️', '#d97706'],
    report: ['📊', '#0284c7'], reminder: ['⏰', '#d97706'], stock: ['📦', '#ea580c'], invoice: ['🧾', '#059669'],
    test: ['🧪', '#7c3aed'], info: ['🔔', '#4f46e5']
  };

  /* ---------------- ছোটখাটো ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function bn(n) { return String(n).replace(/\d/g, function (d) { return BN[d]; }); }
  function ls(k, v) {
    var key = O.app + '_ntf_' + k;
    try {
      if (v === undefined) return localStorage.getItem(key);
      if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v);
    } catch (e) {}
    return null;
  }
  function call(op, arg) {
    try { return Promise.resolve(O.call(op, arg || {})); } catch (e) { return Promise.reject(e); }
  }
  function errMsg(e) { return String((e && e.message) || e || 'সমস্যা হয়েছে'); }
  function did() {
    var d = ls('did');
    if (!d) {
      d = (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^\w]/g, '').slice(0, 32);
      ls('did', d);
    }
    return d;
  }
  function devName() {
    var u = navigator.userAgent;
    var os = /Android/i.test(u) ? 'Android' : /iPhone|iPad|iPod/i.test(u) ? 'iPhone/iPad' : /Windows/i.test(u) ? 'Windows' :
             /Mac OS/i.test(u) ? 'Mac' : /Linux/i.test(u) ? 'Linux' : 'ডিভাইস';
    var br = /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet' :
             /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser';
    var inst = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ? ' · অ্যাপ' : '';
    return os + ' · ' + br + inst;
  }
  function ago(t) {
    var d = new Date(t), now = new Date(), s = (now - d) / 1000;
    var hm = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (s < 60) return 'এইমাত্র';
    if (s < 3600) return bn(Math.floor(s / 60)) + ' মিনিট আগে';
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return s < 3 * 3600 ? bn(Math.floor(s / 3600)) + ' ঘণ্টা আগে' : 'আজ ' + bn(hm);
    if (d.toDateString() === y.toDateString()) return 'গতকাল ' + bn(hm);
    return bn(d.getDate()) + ' ' + MON[d.getMonth()] + ', ' + bn(hm);
  }
  // শিরোনামের শুরুর emoji আলাদা করে আইকনে
  var EMO = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u20E3|\u200D\p{Extended_Pictographic}\uFE0F?)*)\s*/u;
  function split(it) {
    var k = KIND[it.k] || KIND.info, m = EMO.exec(it.ti || '');
    return { ic: m ? m[1] : k[0], ti: m ? it.ti.slice(m[0].length) : it.ti, col: k[1] };
  }
  function unread() {
    var n = 0;
    S.items.forEach(function (x) { if (x.t > S.r) n++; });
    return n;
  }
  function dark() {
    var h = document.documentElement, b = document.body;
    var th = (h.getAttribute('data-theme') || b.getAttribute('data-theme') || '').toLowerCase();
    if (th === 'dark') return true;
    if (th === 'light') return false;
    if (b.classList.contains('dark') || h.classList.contains('dark')) return true;
    var els = [b, h];
    for (var i = 0; i < els.length; i++) {
      var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(els[i]).backgroundColor || '');
      if (m && (m[4] === undefined || +m[4] > 0.5)) return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 < 0.42;
    }
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /* ---------------- স্টাইল ---------------- */
  var CSS = [
    'html:not(.ntf-on) [data-ntf-bell]{display:none!important}',
    '[data-ntf-bell]{position:relative}',
    '.ntf-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ef4444;color:#fff;',
    ' font:700 10.5px/18px Inter,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px rgba(255,255,255,.9);pointer-events:none;z-index:2}',
    '.ntf-badge[hidden]{display:none}',
    '[data-ntf-bell].ntf-ring{animation:ntfRing .9s ease}',
    '@keyframes ntfRing{0%,100%{transform:rotate(0)}15%{transform:rotate(14deg)}30%{transform:rotate(-12deg)}45%{transform:rotate(9deg)}60%{transform:rotate(-6deg)}75%{transform:rotate(3deg)}}',
    '.ntf-root{--nb:#fff;--ni:#0f172a;--ni2:#475569;--nm:#8a93a8;--nl:#e6e8f0;--ns:#f4f5fb;--nbr:#4f46e5;--nu:rgba(79,70,229,.07);--nsh:0 24px 60px -12px rgba(15,23,42,.35);',
    ' font-family:"Hind Siliguri",Inter,system-ui,sans-serif;color:var(--ni);font-size:14px;line-height:1.45}',
    '.ntf-root.ntf-dark{--nb:#161a2e;--ni:#e8eaf6;--ni2:#aab1c8;--nm:#6e7497;--nl:#2a3050;--ns:#1d2140;--nbr:#8b93ff;--nu:rgba(139,147,255,.11);--nsh:0 24px 60px -12px rgba(0,0,0,.7)}',
    '.ntf-root *{box-sizing:border-box}',
    '.ntf-scrim{position:fixed;inset:0;z-index:2147480000;background:rgba(15,23,42,.42);opacity:0;transition:opacity .18s}',
    '.ntf-root.ntf-open .ntf-scrim{opacity:1}',
    '.ntf-root:not(.ntf-sheet) .ntf-scrim{background:transparent}',
    '.ntf-panel{position:fixed;z-index:2147480001;background:var(--nb);border:1px solid var(--nl);box-shadow:var(--nsh);display:flex;flex-direction:column;overflow:hidden;',
    ' width:390px;max-width:calc(100vw - 24px);border-radius:18px;opacity:0;transform:translateY(-6px) scale(.98);transition:opacity .16s,transform .16s}',
    '.ntf-root.ntf-open .ntf-panel{opacity:1;transform:none}',
    '.ntf-root.ntf-sheet .ntf-panel{left:0!important;right:0!important;bottom:0;top:auto!important;width:100%;max-width:none;max-height:86vh!important;border-radius:22px 22px 0 0;',
    ' transform:translateY(30px);padding-bottom:env(safe-area-inset-bottom)}',
    '.ntf-root.ntf-sheet.ntf-open .ntf-panel{transform:none}',
    '.ntf-grab{display:none;width:40px;height:4px;border-radius:2px;background:var(--nl);margin:8px auto 0}',
    '.ntf-root.ntf-sheet .ntf-grab{display:block}',
    '.ntf-hd{display:flex;align-items:center;gap:8px;padding:14px 14px 10px 18px}',
    '.ntf-hd h3{margin:0;font-size:16.5px;font-weight:700;flex:1;display:flex;align-items:center;gap:8px}',
    '.ntf-hd h3 small{font-size:11.5px;font-weight:700;color:#fff;background:#ef4444;border-radius:20px;padding:1px 8px}',
    '.ntf-ib{width:34px;height:34px;border-radius:10px;border:0;background:transparent;color:var(--ni2);display:grid;place-items:center;cursor:pointer;font-size:16px}',
    '.ntf-ib:hover{background:var(--ns);color:var(--ni)}',
    '.ntf-ib svg{width:18px;height:18px}',
    // .ntf-in must be a flex column capped by the panel, otherwise .ntf-body grows to full height and nothing scrolls
    '.ntf-in{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
    '.ntf-hd,.ntf-cta,.ntf-ft,.ntf-grab{flex:none}',
    '.ntf-body{overflow-y:auto;flex:1 1 auto;min-height:120px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
    '.ntf-cta{margin:0 14px 10px;padding:11px 12px;border-radius:13px;background:linear-gradient(135deg,rgba(99,102,241,.13),rgba(217,70,239,.10));display:flex;gap:10px;align-items:center}',
    '.ntf-cta .ntf-t{flex:1;font-size:13px;color:var(--ni2)}.ntf-cta .ntf-t b{display:block;color:var(--ni);font-size:13.5px}',
    '.ntf-btn{border:0;border-radius:10px;padding:8px 13px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;background:var(--nbr);color:#fff;white-space:nowrap}',
    '.ntf-btn.ntf-g{background:var(--ns);color:var(--ni);border:1px solid var(--nl)}',
    '.ntf-btn.ntf-r{background:#e11d48}',
    '.ntf-btn:disabled{opacity:.6;cursor:wait}',
    '.ntf-it{display:flex;gap:11px;padding:11px 16px 11px 14px;border-top:1px solid var(--nl);cursor:pointer;position:relative}',
    '.ntf-it:hover{background:var(--ns)}',
    '.ntf-it.ntf-u{background:var(--nu)}',
    '.ntf-it.ntf-u:after{content:"";position:absolute;right:12px;top:16px;width:8px;height:8px;border-radius:50%;background:var(--nbr)}',
    '.ntf-ic{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:18px;background:color-mix(in srgb,var(--kc) 14%,transparent)}',
    '.ntf-tx{flex:1;min-width:0;padding-right:10px}',
    '.ntf-ti{font-weight:700;font-size:13.8px;line-height:1.35}',
    '.ntf-b{color:var(--ni2);font-size:13px;margin-top:2px;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.ntf-it.ntf-x .ntf-b{display:block;-webkit-line-clamp:unset}',
    '.ntf-tm{color:var(--nm);font-size:11.5px;margin-top:4px;display:flex;gap:10px;align-items:center}',
    '.ntf-tm a{color:var(--nbr);font-weight:700;text-decoration:none}',
    '.ntf-empty{text-align:center;padding:38px 20px 44px;color:var(--nm)}',
    '.ntf-empty div{font-size:38px;margin-bottom:6px}',
    '.ntf-empty b{display:block;color:var(--ni);font-size:15px;margin-bottom:2px}',
    '.ntf-ft{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid var(--nl);font-size:12px;color:var(--nm)}',
    '.ntf-lnk{border:0;background:none;color:var(--nbr);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:4px 2px}',
    '.ntf-sec{padding:4px 18px 14px}',
    '.ntf-sec h4{margin:12px 0 8px;font-size:12px;letter-spacing:.06em;color:var(--nm);font-weight:700;text-transform:uppercase}',
    '.ntf-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--nl);border-radius:12px;margin-bottom:8px}',
    '.ntf-row .ntf-t{flex:1;min-width:0;font-size:13px;color:var(--ni2)}.ntf-row .ntf-t b{display:block;color:var(--ni);font-size:13.5px}',
    '.ntf-msg{font-size:12.5px;margin:2px 0 8px;color:var(--ni2)}.ntf-msg.ntf-e{color:#e11d48}.ntf-msg.ntf-o{color:#059669}',
    '.ntf-sw{position:relative;width:44px;height:26px;flex:none;border-radius:13px;border:0;background:var(--nl);cursor:pointer;transition:background .15s}',
    '.ntf-sw:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s}',
    '.ntf-sw.ntf-act{background:#10b981}.ntf-sw.ntf-act:after{left:21px}',
    '.ntf-file{display:none}',
    '.ntf-toast{position:fixed;z-index:2147480002;top:14px;left:50%;transform:translate(-50%,calc(-100% - 40px));visibility:hidden;width:min(420px,calc(100vw - 24px));background:var(--nb);color:var(--ni);',
    ' border:1px solid var(--nl);border-radius:16px;box-shadow:var(--nsh);padding:12px 14px;display:flex;gap:11px;cursor:pointer;transition:transform .25s cubic-bezier(.2,.9,.3,1.2),visibility 0s .25s}',
    '.ntf-toast.ntf-show{transform:translate(-50%,0);visibility:visible;transition:transform .25s cubic-bezier(.2,.9,.3,1.2),visibility 0s}',
    '.ntf-toast .ntf-b{-webkit-line-clamp:2}'
  ].join('\n');

  var ICO = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 7.2 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 9H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>'
  };

  /* ---------------- DOM ---------------- */
  var R = null;   // .ntf-root
  // স্টাইল শুরুতেই — নইলে ঘণ্টার লাল সংখ্যা প্যানেল খোলার আগে ঠিক জায়গায় বসে না
  function css() {
    if (document.getElementById('ntfCss')) return;
    var st = document.createElement('style');
    st.id = 'ntfCss';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function build() {
    if (R) return;
    css();
    R = document.createElement('div');
    R.className = 'ntf-root';
    R.innerHTML = '<div class="ntf-scrim" hidden></div>' +
      '<section class="ntf-panel" role="dialog" aria-modal="true" aria-label="নোটিফিকেশন" hidden><div class="ntf-grab"></div><div class="ntf-in"></div></section>' +
      '<div class="ntf-toast" role="status"></div>';
    document.body.appendChild(R);
    R.addEventListener('click', onPanelClick);
    $('.ntf-scrim', R).addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open) close(); });
    window.addEventListener('resize', function () { if (S.open) place(); });
  }

  // হোস্টের বাটন আবার আঁকা হলে (innerHTML) লাল সংখ্যাটাও আবার বসে
  function paintBells() {
    var n = unread();
    var bells = document.querySelectorAll('[data-ntf-bell]');
    for (var i = 0; i < bells.length; i++) {
      var b = bells[i], bd = b.querySelector('.ntf-badge');
      if (!bd) { bd = document.createElement('span'); bd.className = 'ntf-badge'; b.appendChild(bd); }
      bd.textContent = n > 99 ? '99+' : String(n);   // ছোট ব্যাজে বাংলা "১" দেখতে ">"-এর মতো লাগে
      bd.hidden = !n || !S.started;
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', 'নোটিফিকেশন');
      b.setAttribute('title', n ? bn(n) + 'টা নতুন নোটিফিকেশন' : 'নোটিফিকেশন');
    }
    try {
      if (navigator.setAppBadge) { if (n && S.started) navigator.setAppBadge(n); else navigator.clearAppBadge(); }
    } catch (e) {}
  }
  var paintQueued = false;
  function watchBells() {
    if (!window.MutationObserver) return;
    new MutationObserver(function () {
      if (paintQueued) return;
      paintQueued = true;
      requestAnimationFrame(function () {
        paintQueued = false;
        var bells = document.querySelectorAll('[data-ntf-bell]');
        for (var i = 0; i < bells.length; i++) if (!bells[i].querySelector('.ntf-badge')) { paintBells(); break; }
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  function ring() {
    var bells = document.querySelectorAll('[data-ntf-bell]');
    for (var i = 0; i < bells.length; i++) {
      (function (b) { b.classList.remove('ntf-ring'); void b.offsetWidth; b.classList.add('ntf-ring');
        setTimeout(function () { b.classList.remove('ntf-ring'); }, 1000); })(bells[i]);
    }
  }

  /* ---------------- প্যানেল ---------------- */
  var anchor = null;
  function openPanel(btn) {
    if (!S.started) return;
    build();
    anchor = btn || document.querySelector('[data-ntf-bell]');
    S.open = true; S.view = 'list'; S.seenR = S.r; S.expanded = {};
    R.classList.toggle('ntf-dark', dark());
    $('.ntf-scrim', R).hidden = false;
    $('.ntf-panel', R).hidden = false;
    place();
    paint();
    requestAnimationFrame(function () { R.classList.add('ntf-open'); });
    markRead();
    poll(true);
    if (pushState() === 'on') refreshPush(false);
  }
  function close() {
    if (!S.open || !R) return;
    S.open = false;
    R.classList.remove('ntf-open');
    setTimeout(function () {
      if (S.open) return;
      $('.ntf-scrim', R).hidden = true;
      $('.ntf-panel', R).hidden = true;
    }, 180);
  }
  function place() {
    var p = $('.ntf-panel', R), w = window.innerWidth, h = window.innerHeight;
    var sheet = w < 640;
    R.classList.toggle('ntf-sheet', sheet);
    if (sheet) { p.style.cssText = ''; return; }
    var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { bottom: 56, right: w - 16, left: w - 60 };
    var top = Math.max(12, Math.min(r.bottom + 10, h - 220));
    var right = Math.max(12, w - r.right - 6);
    if (w - right - 390 < 12) right = Math.max(12, w - 402);
    p.style.cssText = 'top:' + top + 'px;right:' + right + 'px;max-height:' + (h - top - 16) + 'px';
  }

  function paint() {
    paintBells();
    if (!S.open || !R) return;
    var box = $('.ntf-in', R);
    if (S.view === 'set') { box.innerHTML = setHtml(); bindFile(); return; }
    var n = unread();
    var cta = '';
    var ps = pushState();
    if (ps === 'off' && !ls('ctaHide')) {
      cta = '<div class="ntf-cta"><div class="ntf-t"><b>📱 এই ডিভাইসে Push চালু করুন</b>অ্যাপ বন্ধ থাকলেও নোটিফিকেশন আসবে</div>' +
            '<button class="ntf-btn" data-n="push-on">চালু</button><button class="ntf-ib" data-n="cta-hide" title="পরে">' + ICO.x + '</button></div>';
    }
    var list = S.items.length ? S.items.map(itemHtml).join('') :
      '<div class="ntf-empty"><div>🔕</div><b>কোনো নোটিফিকেশন নেই</b>নতুন কিছু হলে এখানে দেখাবে।</div>';
    box.innerHTML =
      '<div class="ntf-hd"><h3>নোটিফিকেশন' + (n ? '<small>' + bn(n) + ' নতুন</small>' : '') + '</h3>' +
      '<button class="ntf-ib" data-n="reload" title="নতুন করে আনুন">' + ICO.refresh + '</button>' +
      '<button class="ntf-ib" data-n="set" title="সেটিংস">' + ICO.gear + '</button>' +
      '<button class="ntf-ib" data-n="close" title="বন্ধ">' + ICO.x + '</button></div>' +
      cta + '<div class="ntf-body">' + list + '</div>' +
      (S.items.length ? '<div class="ntf-ft"><span>' + (O.name ? esc(O.name) : '') + '</span><button class="ntf-lnk" data-n="clear">সব মুছুন</button></div>' : '');
  }
  function itemHtml(x) {
    var s = split(x), u = x.t > S.seenR;
    return '<div class="ntf-it' + (u ? ' ntf-u' : '') + (S.expanded[x.i] ? ' ntf-x' : '') + '" data-n="item" data-i="' + esc(x.i) + '">' +
      '<div class="ntf-ic" style="--kc:' + s.col + '">' + esc(s.ic) + '</div>' +
      '<div class="ntf-tx"><div class="ntf-ti">' + esc(s.ti) + '</div>' +
      (x.b ? '<div class="ntf-b">' + esc(x.b) + '</div>' : '') +
      '<div class="ntf-tm"><span>' + ago(x.t) + '</span>' +
      (x.u ? '<a href="' + esc(x.u) + '" target="_blank" rel="noopener" data-n="link">খুলুন ›</a>' : '') + '</div></div></div>';
  }

  function onPanelClick(e) {
    var el = e.target.closest ? e.target.closest('[data-n]') : null;
    if (!el) {
      if (e.target.closest && e.target.closest('.ntf-toast')) { hideToast(); openPanel(); }
      return;
    }
    var a = el.getAttribute('data-n');
    if (a === 'link') return;
    e.preventDefault();
    if (a === 'close') close();
    else if (a === 'reload') { S.ver = ''; poll(true); }
    else if (a === 'item') { var i = el.getAttribute('data-i'); S.expanded[i] = !S.expanded[i]; el.classList.toggle('ntf-x', !!S.expanded[i]); }
    else if (a === 'clear') clearAll(el);
    else if (a === 'set') { S.view = 'set'; S.msg = null; paint(); loadCfg(); }
    else if (a === 'back') { S.view = 'list'; S.msg = null; paint(); }
    else if (a === 'cta-hide') { ls('ctaHide', '1'); paint(); }
    else if (a === 'push-on') pushOn(el);
    else if (a === 'push-off') pushOff(el);
    else if (a === 'test') test(el);
    else if (a === 'ext') setExt(el);
    else if (a === 'rm') removeDev(el);
    else if (a === 'key') { var f = $('#ntfKey', R); if (f) f.click(); }
  }

  /* ---------------- সেটিংস ---------------- */
  function setHtml() {
    var c = S.cfg, ps = pushState();
    var h = '<div class="ntf-hd"><button class="ntf-ib" data-n="back" title="ফিরে যান">' + ICO.back + '</button>' +
      '<h3>নোটিফিকেশন সেটিংস</h3><button class="ntf-ib" data-n="close" title="বন্ধ">' + ICO.x + '</button></div><div class="ntf-body"><div class="ntf-sec">';
    h += '<h4>এই ডিভাইস</h4>';
    if (ps === 'na') {
      h += '<div class="ntf-row"><div class="ntf-t"><b>📵 Push এখানে চলে না</b>' + esc(naReason()) + '</div></div>';
    } else {
      var on = ps === 'on';
      h += '<div class="ntf-row"><div class="ntf-t"><b>📱 Push নোটিফিকেশন</b>' +
        (on ? 'চালু — অ্যাপ বন্ধ থাকলেও আসবে' : ps === 'blocked' ? 'ব্রাউজারে ব্লক করা — ঠিকানার পাশের 🔒 → Notifications → Allow' : 'বন্ধ') + '</div>' +
        (on ? '<button class="ntf-btn ntf-g" data-n="push-off">বন্ধ করুন</button>' : '<button class="ntf-btn" data-n="push-on">চালু করুন</button>') + '</div>';
    }
    h += '<div class="ntf-row"><div class="ntf-t"><b>🧪 টেস্ট</b>নিজের কাছে একটা নোটিফিকেশন পাঠিয়ে দেখুন</div><button class="ntf-btn ntf-g" data-n="test">পাঠান</button></div>';
    h += '<div class="ntf-msg' + (S.msg && S.msg[1] ? ' ntf-' + S.msg[1] : '') + '" id="ntfMsg">' + esc(S.msg ? S.msg[0] : '') + '</div>';

    if (!c) return h + '<div class="ntf-msg">⏳ লোড হচ্ছে…</div></div></div>';

    if (c.devices && c.devices.length) {
      h += '<h4>Push পাওয়া ডিভাইস</h4>' + c.devices.map(function (d) {
        return '<div class="ntf-row"><div class="ntf-t"><b>' + esc(d.dev || 'ডিভাইস') + (d.me ? ' · এটি' : '') + '</b>' +
          (d.n ? esc(d.n) + ' · ' : '') + 'চালু ' + ago(d.at) + '</div>' +
          '<button class="ntf-ib" data-n="rm" data-id="' + esc(d.id) + '" title="সরান">' + ICO.x + '</button></div>';
      }).join('');
    }
    if (c.owner) {
      if (O.ext) {
        h += '<h4>' + esc(O.ext) + '</h4><div class="ntf-row"><div class="ntf-t"><b>সতর্কবার্তা ' + esc(O.ext) + '-এও যাবে</b>' +
          'বন্ধ করলে শুধু অ্যাপে আর Push-এ আসবে। লগইন কোড আর রিপোর্টের ইমেইল আগের মতোই যাবে।</div>' +
          '<button class="ntf-sw' + (c.ext ? ' ntf-act' : '') + '" data-n="ext" aria-label="চালু/বন্ধ"></button></div>';
      }
      h += '<h4>Push সার্ভার (Firebase)</h4><div class="ntf-row"><div class="ntf-t"><b>' +
        (c.ready ? '✅ চালু' : '⚪ সেট করা নেই') + '</b>' +
        (c.ready ? 'Project: ' + esc(c.project || '') : 'Firebase-এর service account ফাইল (.json) দিন') + '</div>' +
        '<button class="ntf-btn ntf-g" data-n="key">' + (c.ready ? 'বদলান' : 'ফাইল দিন') + '</button></div>' +
        '<input type="file" accept=".json,application/json" class="ntf-file" id="ntfKey">';
    }
    return h + '</div></div>';
  }
  function msg(s, kind) {
    S.msg = s ? [s, kind || ''] : null;
    var m = R && $('#ntfMsg', R);
    if (m) { m.textContent = s || ''; m.className = 'ntf-msg' + (kind ? ' ntf-' + kind : ''); }
  }
  function busyBtn(b, on, label) {
    if (!b) return;
    b.disabled = on;
    if (on) { b.dataset.l = b.innerHTML; b.textContent = label || '⏳'; } else if (b.dataset.l) b.innerHTML = b.dataset.l;
  }
  function loadCfg() {
    return call('cfg', { did: did() }).then(function (c) {
      S.cfg = c;
      if (S.open && S.view === 'set') paint();
      return c;
    }, function (e) { msg(errMsg(e), 'e'); });
  }
  function bindFile() {
    var f = $('#ntfKey', R);
    if (!f || f._b) return;
    f._b = 1;
    f.addEventListener('change', function () {
      var file = f.files && f.files[0];
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        msg('⏳ Firebase-এ যাচাই হচ্ছে…');
        call('setup', { sa: String(rd.result || '') }).then(function (r) {
          msg('✅ Firebase সেট হয়েছে (' + r.project + ')', 'o');
          loadCfg();
        }, function (e) { msg(errMsg(e), 'e'); });
      };
      rd.readAsText(file);
      f.value = '';
    });
  }
  function test(b) {
    busyBtn(b, true);
    call('test', {}).then(function (r) {
      busyBtn(b, false);
      var p = r && r.pushed || {};
      msg(p.sent ? '✅ পাঠানো হয়েছে — ' + bn(p.sent) + 'টা ডিভাইসে Push গেছে' :
          p.devices ? '⚠️ অ্যাপে এসেছে, কিন্তু Push যায়নি' : '✅ অ্যাপে এসেছে (Push চালু কোনো ডিভাইস নেই)', p.sent || !p.devices ? 'o' : 'e');
      S.ver = '';
      poll(true);
    }, function (e) { busyBtn(b, false); msg(errMsg(e), 'e'); });
  }
  function setExt(b) {
    var on = !b.classList.contains('ntf-act');
    b.classList.toggle('ntf-act', on);
    call('ext', { on: on }).then(function (r) {
      if (S.cfg) S.cfg.ext = r.ext;
      msg(r.ext ? '✅ সতর্কবার্তা ' + O.ext + '-এও যাবে' : '✅ এখন থেকে সতর্কবার্তা শুধু অ্যাপে আর Push-এ', 'o');
    }, function (e) { b.classList.toggle('ntf-act', !on); msg(errMsg(e), 'e'); });
  }
  function removeDev(b) {
    var id = b.getAttribute('data-id');
    busyBtn(b, true);
    call('unsub', { id: id }).then(function () {
      var d = S.cfg && (S.cfg.devices || []).filter(function (x) { return x.id === id; })[0];
      if (d && d.me) { ls('push', null); unsubscribeLocal(); }
      loadCfg();
    }, function (e) { busyBtn(b, false); msg(errMsg(e), 'e'); });
  }

  /* ---------------- পড়া / মোছা / আনা ---------------- */
  function maxT() { return S.items.length ? S.items[0].t : 0; }
  function markRead() {
    var t = maxT();
    if (!t || t <= S.r) return;
    S.r = t;
    save(); paintBells();
    call('read', { upto: t }).catch(function () {});
  }
  function clearAll(b) {
    var t = maxT();
    if (!t) return;
    busyBtn(b, true);
    call('clear', { upto: t }).then(function (r) {
      S.c = r.c; S.r = r.r; S.items = S.items.filter(function (x) { return x.t > S.c; });
      save(); paint();
    }, function () { busyBtn(b, false); });
  }
  function save() {
    ls('cache', JSON.stringify({ ver: S.ver, r: S.r, c: S.c, items: S.items.slice(0, 50), owner: S.owner }));
  }
  function poll(force) {
    if (!S.started || !O.call) return Promise.resolve();
    if (S.busy && !force) return Promise.resolve();
    S.busy = true;
    S.lastPoll = Date.now();
    return call('list', { ver: force ? '' : S.ver }).then(function (d) {
      S.busy = false; S.authFails = 0;
      apply(d);
    }, function (e) {
      S.busy = false;
      if (/AUTH_REQUIRED|OWNER_KEY/.test(errMsg(e)) && ++S.authFails >= 3) stop();
    });
  }
  function apply(d) {
    if (!d) return;
    S.owner = !!d.owner;
    S.r = Math.max(S.r, d.r || 0);
    S.c = d.c || 0;
    if (!d.same && d.items) {
      var known = {}, firstLoad = !S.ver;
      S.items.forEach(function (x) { known[x.i] = 1; });
      var fresh = d.items.filter(function (x) { return !known[x.i] && x.t > S.r; });
      S.items = d.items;
      S.ver = d.ver;
      if (fresh.length && !firstLoad) {
        ring();
        if (!S.open) toast(fresh[0], fresh.length);
      }
    }
    if (S.open) markRead();
    save();
    paint();
  }

  /* ---------------- টোস্ট (অ্যাপ খোলা থাকলে নতুন নোটিফিকেশন) ---------------- */
  var toastT = null;
  function toast(x, n) {
    build();
    R.classList.toggle('ntf-dark', dark());
    var s = split(x), t = $('.ntf-toast', R);
    t.innerHTML = '<div class="ntf-ic" style="--kc:' + s.col + '">' + esc(s.ic) + '</div><div class="ntf-tx"><div class="ntf-ti">' + esc(s.ti) +
      (n > 1 ? ' <span style="color:var(--nm);font-weight:600">+' + bn(n - 1) + '</span>' : '') + '</div>' +
      (x.b ? '<div class="ntf-b">' + esc(x.b) + '</div>' : '') + '</div>';
    requestAnimationFrame(function () { t.classList.add('ntf-show'); });
    clearTimeout(toastT);
    toastT = setTimeout(hideToast, 6500);
  }
  function hideToast() { if (R) $('.ntf-toast', R).classList.remove('ntf-show'); }

  /* ---------------- Push ---------------- */
  function canPush() {
    return !!(O.sw && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  }
  function naReason() {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window.matchMedia && matchMedia('(display-mode: standalone)').matches)) {
      return 'iPhone-এ আগে Share → Add to Home Screen দিয়ে অ্যাপটা ইনস্টল করুন, তারপর সেখান থেকে খুলে চালু করুন।';
    }
    return 'এই ব্রাউজারে Push সমর্থিত নয় — Chrome / Edge ব্যবহার করুন।';
  }
  // na = চলে না, blocked = ব্রাউজারে ব্লক, on = চালু, off = বন্ধ
  function pushState() {
    if (!canPush()) return 'na';
    if (Notification.permission === 'denied') return 'blocked';
    return ls('push') && Notification.permission === 'granted' ? 'on' : 'off';
  }
  function swReg() {
    return navigator.serviceWorker.register(O.sw, { scope: O.scope }).then(function (reg) {
      if (reg.active) return reg;
      return new Promise(function (res) {
        var w = reg.installing || reg.waiting;
        if (!w) return res(reg);
        w.addEventListener('statechange', function () { if (w.state === 'activated') res(reg); });
        setTimeout(function () { res(reg); }, 8000);
      });
    });
  }
  var fbMods = null;
  function fb() {
    if (!fbMods) {
      fbMods = Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-messaging.js')]).catch(function (e) {
        fbMods = null; throw new Error('Push-এর ফাইল আনা যায়নি — ইন্টারনেট দেখুন।');
      });
    }
    return fbMods;
  }
  function fbMessaging(web) {
    return fb().then(function (m) {
      var name = 'ntf-' + O.app;
      var app = m[0].getApps().filter(function (a) { return a.name === name; })[0] || m[0].initializeApp(web, name);
      return { mod: m[1], msg: m[1].getMessaging(app) };
    });
  }
  function getTok(web) {
    return Promise.all([swReg(), fbMessaging(web)]).then(function (x) {
      return x[1].mod.getToken(x[1].msg, { serviceWorkerRegistration: x[0] });
    });
  }
  function pushOn(b) {
    if (!canPush()) { S.view = 'set'; paint(); loadCfg(); return; }
    busyBtn(b, true, '⏳ চালু হচ্ছে…');
    var web;
    (S.cfg && S.cfg.ready ? Promise.resolve(S.cfg) : call('cfg', { did: did() })).then(function (c) {
      S.cfg = c;
      if (!c.ready) throw new Error(c.owner ? 'Push সার্ভার (Firebase) এখনো সেট করা হয়নি — নিচে key ফাইল দিন।' : 'মালিক এখনো Push সেট করেননি।');
      web = c.web;
      return Notification.requestPermission();
    }).then(function (perm) {
      if (perm !== 'granted') throw new Error(perm === 'denied' ? 'নোটিফিকেশন ব্লক করা — ঠিকানার পাশের 🔒 → Notifications → Allow দিন।' : 'অনুমতি দেওয়া হয়নি।');
      return getTok(web);
    }).then(function (tok) {
      if (!tok) throw new Error('Push টোকেন পাওয়া যায়নি।');
      return call('sub', { token: tok, did: did(), dev: devName() }).then(function () {
        ls('push', JSON.stringify({ tok: tok, app: web.appId, at: Date.now() }));
      });
    }).then(function () {
      busyBtn(b, false);
      ls('ctaHide', null);
      if (S.view !== 'set') { S.view = 'set'; }
      paint(); msg('✅ Push চালু হয়েছে — "পাঠান" চাপলে একটা টেস্ট আসবে', 'o');
      loadCfg();
    }).catch(function (e) {
      busyBtn(b, false);
      if (S.view !== 'set') { S.view = 'set'; paint(); loadCfg(); }
      msg(errMsg(e), 'e');
    });
  }
  function unsubscribeLocal() {
    if (!canPush()) return Promise.resolve();
    return navigator.serviceWorker.getRegistration(O.scope).then(function (reg) {
      if (!reg) return;
      return reg.pushManager.getSubscription().then(function (s) { return s && s.unsubscribe(); });
    }).catch(function () {});
  }
  function pushOff(b) {
    busyBtn(b, true);
    call('unsub', { did: did() }).catch(function () {}).then(function () {
      ls('push', null);
      return unsubscribeLocal();
    }).then(function () {
      busyBtn(b, false); paint(); msg('Push বন্ধ — নোটিফিকেশন শুধু অ্যাপের ভেতরে দেখাবে', 'o'); loadCfg();
    });
  }
  // চালু থাকা Push মাঝে মাঝে নতুন করে নিবন্ধন (টোকেন বদলালে / সার্ভারে মুছে গেলে)
  function refreshPush(force) {
    var p = null;
    try { p = JSON.parse(ls('push') || 'null'); } catch (e) {}
    if (!p || !canPush()) return;
    if (Notification.permission !== 'granted') {   // ব্রাউজারে অনুমতি তুলে নেওয়া হয়েছে
      ls('push', null); call('unsub', { did: did() }).catch(function () {}); return;
    }
    if (!force && Date.now() - (p.at || 0) < 20 * 3600000) return;
    call('cfg', { did: did() }).then(function (c) {
      S.cfg = c;
      if (!c.ready) return;
      return getTok(c.web).then(function (tok) {
        if (!tok) return;
        return call('sub', { token: tok, did: did(), dev: devName() }).then(function () {
          ls('push', JSON.stringify({ tok: tok, app: c.web.appId, at: Date.now() }));
        });
      });
    }).catch(function () {});
  }

  /* ---------------- শুরু / থামা ---------------- */
  function tick() {
    if (!S.started) return;
    if (document.visibilityState === 'visible' && Date.now() - S.lastPoll > POLL_MS - 2000) poll();
  }
  var wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-ntf-bell]') : null;
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (S.open) close(); else openPanel(b);
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && S.started && Date.now() - S.lastPoll > 15000) poll();
    });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.ntf === 'push' && S.started) poll(true);
        if (e.data && e.data.ntf === 'open' && S.started) openPanel();
      });
    }
    watchBells();
  }

  window.NTF = {
    init: function (o) {
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) O[k] = o[k];
      document.documentElement.classList.add('ntf-on');
      css();
      return window.NTF;
    },
    start: function () {
      if (!O.call) return;
      if (!document.body) { document.addEventListener('DOMContentLoaded', window.NTF.start); return; }
      wire();
      var first = !S.started;
      S.started = true; S.authFails = 0;
      if (first) {
        try {
          var c = JSON.parse(ls('cache') || 'null');
          if (c && !S.items.length) { S.items = c.items || []; S.r = c.r || 0; S.c = c.c || 0; S.owner = !!c.owner; S.ver = c.ver || ''; }
        } catch (e) {}
        paintBells();
        clearInterval(S.timer);
        S.timer = setInterval(tick, 15000);
        // ক্লিক করে আসা Push (?ntf=1) — সরাসরি তালিকা
        if (/[?&]ntf=1\b/.test(location.search)) setTimeout(function () { openPanel(); }, 600);
      }
      poll(true);
      setTimeout(function () { refreshPush(false); }, 4000);
    },
    stop: function () {
      S.started = false;
      clearInterval(S.timer);
      close();
      paintBells();
    },
    // লগআউটের আগে ডাকুন — এই ডিভাইসের Push বন্ধ আর জমা তালিকা মোছা (৪ সেকেন্ডের বেশি অপেক্ষা নয়)
    logout: function () {
      var had = !!ls('push');
      var job = (had ? call('unsub', { did: did() }).catch(function () {}) : Promise.resolve()).then(function () {
        ls('push', null); ls('cache', null);
        return unsubscribeLocal();
      });
      window.NTF.stop();
      S.items = []; S.ver = ''; S.r = 0; S.c = 0;
      return Promise.race([job, new Promise(function (r) { setTimeout(r, 4000); })]);
    },
    open: function () { openPanel(); },
    poll: function () { return poll(true); }
  };
})();
