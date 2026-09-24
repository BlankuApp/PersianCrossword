import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// TODO: Replace with your Firebase project config from Firebase Console
// https://console.firebase.google.com/ → Project Settings → Your apps → SDK setup
const firebaseConfig = {
  apiKey: "AIzaSyAUTZ9-5yqZow6vnOcAT7R_wtV7zOUsEXk",
  authDomain: "persiancrossword.firebaseapp.com",
  projectId: "persiancrossword",
  storageBucket: "persiancrossword.firebasestorage.app",
  messagingSenderId: "649464156880",
  appId: "1:649464156880:web:b169f18eb1d9ac545484d5",
  measurementId: "G-SM715HF886"
};

const app = initializeApp(firebaseConfig);
export const firebaseApp = app;
// `VITE_FUNCTIONS_EMULATOR=1 npm run dev` talks to `firebase emulators:start` instead of production.
export const usingEmulators = Boolean(import.meta.env.VITE_FUNCTIONS_EMULATOR);
export const auth = getAuth(app);
// Optional fields (e.g. solvedAt) may be undefined; drop them instead of throwing.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const functions = getFunctions(app, "us-central1");
if (usingEmulators) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

// Public download URL for a file in the storage bucket (read access comes from storage.rules).
export function storageFileUrl(path: string): string {
  const host = usingEmulators ? "http://127.0.0.1:9199" : "https://firebasestorage.googleapis.com";
  return `${host}/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(path)}?alt=media`;
}

// Analytics only runs where supported (not in jsdom tests or cookie-less contexts).
const analytics = isSupported()
  .then((ok) => (ok ? getAnalytics(app) : null))
  .catch(() => null);

export function logAnalyticsEvent(name: string, params: Record<string, string>): void {
  void analytics.then((instance) => instance && logEvent(instance, name, params));
}
