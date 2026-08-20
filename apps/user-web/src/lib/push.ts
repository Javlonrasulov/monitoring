import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from "firebase/messaging";
import { api } from "./api";
import { isPaired } from "./auth";

function firebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
  return {
    apiKey,
    authDomain: authDomain || undefined,
    projectId,
    messagingSenderId,
    appId,
  };
}

function getFirebaseApp(): FirebaseApp | null {
  const config = firebaseConfig();
  if (!config) return null;
  return getApps()[0] ?? initializeApp(config);
}

async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!(await isSupported())) return null;
  const app = getFirebaseApp();
  if (!app) return null;
  return getMessaging(app);
}

/** Register FCM web token with the API (device JWT → /device-push-tokens). */
export async function registerWebPush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isPaired()) return false;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey || !firebaseConfig()) return false;

  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;

    await api.put("/device-push-tokens", { token, platform: "WEB" });

    onMessage(messaging, (payload) => {
      const title =
        payload.notification?.title ||
        payload.data?.title ||
        "New message";
      const body =
        payload.notification?.body ||
        payload.data?.body ||
        "Open the chat to read it";
      if (Notification.permission === "granted") {
        const threadId = payload.data?.threadId;
        void new Notification(title, {
          body,
          tag: threadId || "chat",
          data: { threadId },
        });
      }
    });

    return true;
  } catch (err) {
    console.warn("Web push registration skipped/failed", err);
    return false;
  }
}
