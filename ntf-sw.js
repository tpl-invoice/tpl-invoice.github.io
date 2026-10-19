/* Notify service worker — Push এলে ফোন/কম্পিউটারে নোটিফিকেশন দেখায়, চাপলে অ্যাপ খোলে।
 * পাঁচটা সাইটে একই ফাইল — মূল কপি D:\Calude Work\_shared\notify\ntf-sw.js।
 * Firebase (FCM) data message: { data: { title, body, url, icon, tag, app } }
 */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { data: { body: e.data ? e.data.text() : '' } }; }
  var d = p.data || p.notification || p || {};
  var title = d.title || 'নতুন নোটিফিকেশন';
  var opts = {
    body: d.body || '',
    icon: d.icon || undefined,
    badge: d.icon || undefined,
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || self.registration.scope },
    vibrate: [120, 60, 120]
  };
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    // অ্যাপ খোলা থাকলে 🔔-এর তালিকা সাথে সাথে নতুন করে আনে
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cl) {
      cl.forEach(function (c) { c.postMessage({ ntf: 'push' }); });
    })
  ]));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  var scope = self.registration.scope;
  // অ্যাপের বাইরের লিংক (যেমন Invoice-এর PDF) — সরাসরি সেটাই খোলে
  if (new URL(url, scope).href.indexOf(scope) !== 0) { e.waitUntil(self.clients.openWindow(url)); return; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cl) {
    for (var i = 0; i < cl.length; i++) {
      if (cl[i].url.indexOf(scope) === 0 && 'focus' in cl[i]) {
        cl[i].postMessage({ ntf: 'open' });
        return cl[i].focus();
      }
    }
    var u = new URL(url, scope);
    if (u.href.indexOf(scope) === 0) u.searchParams.set('ntf', '1');
    return self.clients.openWindow(u.href);
  }));
});
