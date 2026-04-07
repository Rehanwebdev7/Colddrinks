// Firebase Messaging Service Worker - Background Push Notifications
// Use 10.12.0 compat (known stable version available on CDN)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBGT5d8MrNU69i4e3NCzHY7v3cpzR80tME',
  authDomain: 'noor-coldrinks.firebaseapp.com',
  projectId: 'noor-coldrinks',
  storageBucket: 'noor-coldrinks.firebasestorage.app',
  messagingSenderId: '403777556555',
  appId: '1:403777556555:web:3957ec5e6723d0db337dce'
});

const messaging = firebase.messaging();

// Handle ALL background push messages
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM-SW] Background message:', payload);

  const data = payload.data || {};
  const title = data.title || 'Noor Coldrinks';
  const options = {
    body: data.body || '',
    icon: '/images/logo.png',
    badge: '/images/logo.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.type || 'general',
    renotify: true,
    data: data
  };

  return self.registration.showNotification(title, options);
});

// Handle notification click — open the right page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  if (data.type === 'order' || data.type === 'new_order') {
    url = data.role === 'admin' ? '/admin/orders' : '/my-orders';
  } else if (data.type === 'payment') {
    url = data.role === 'admin' ? '/admin/payments' : '/profile';
  } else if (data.type === 'announcement' || data.type === 'general') {
    url = data.role === 'admin' ? '/admin/notifications' : '/notifications';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
