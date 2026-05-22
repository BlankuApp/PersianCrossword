import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
