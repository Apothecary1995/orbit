self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { data = { content: event.data.text() }; }

  const title   = data.sender_name ? `${data.sender_name}` : 'Cengsta Paradise';
  const options = {
    body:  data.content || 'Yeni mesaj',
    icon:  '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    data:  { conversation_id: data.conversation_id },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const convId = event.notification.data?.conversation_id;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('localhost:5173')) {
          client.focus();
          if (convId) client.postMessage({ type: 'open_conversation', conversation_id: convId });
          return;
        }
      }
      return clients.openWindow('/');
    })
  );
});
