import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");
// `VITE_FUNCTIONS_EMULATOR=1 npm run dev` talks to `firebase emulators:start` instead of production.
if (import.meta.env.VITE_FUNCTIONS_EMULATOR) connectFunctionsEmulator(functions, "127.0.0.1", 5001);

// Analytics only runs where supported (not in jsdom tests or cookie-less contexts).
isSupported().then((ok) => ok && getAnalytics(app)).catch(() => {});
