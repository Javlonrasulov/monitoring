/* eslint-disable no-undef */
/* Firebase messaging service worker — config loaded from /firebase-config.js */

importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js");
importScripts(
  "https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js",
);
importScripts("/firebase-config.js");

firebase.initializeApp(self.FIREBASE_CONFIG || {});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    "New message";
  const body =
    (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) ||
    "Open the chat to read it";
  const threadId = payload.data && payload.data.threadId;
  self.registration.showNotification(title, {
    body,
    tag: threadId || "chat",
    data: { threadId },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const threadId =
    event.notification.data && event.notification.data.threadId;
  const target = threadId ? `/chats/${threadId}` : "/chats";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      },
    ),
  );
});
