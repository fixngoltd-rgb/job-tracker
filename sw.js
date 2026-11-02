/* Fix & Go board: receives pop-up alerts (web push) and opens the job when tapped */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Fix & Go', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Fix & Go', {
    body: data.body || '',
    tag: data.job_id ? 'job-' + data.job_id : undefined,
    data: { job_id: data.job_id || null }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const jobId = event.notification.data && event.notification.data.job_id;
  const base = self.registration.scope;
  const url = base + 'board.html' + (jobId ? '?job=' + encodeURIComponent(jobId) : '');
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.indexOf('board.html') >= 0 && 'focus' in c) { c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
