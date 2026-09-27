// firebase-config.js
// Fill in with your own Firebase project's config (Project settings -> General
// -> Your apps -> SDK setup and configuration -> Config). This file is safe to
// commit — these values are not secrets, access is controlled by
// firestore.rules and Firebase Auth, not by hiding this object.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYqChQXJDnI5Rj6bGEemygdHZ5ZSvgn1U",
  authDomain: "bytecore-7ab1b.firebaseapp.com",
  projectId: "bytecore-7ab1b",
  storageBucket: "bytecore-7ab1b.firebasestorage.app",
  messagingSenderId: "1039327571816",
  appId: "1:1039327571816:web:ab7705c1ed89c6c2b530dd",
  measurementId: "G-ZMPJRTMB3K",
};

// True as long as the placeholder values above haven't been replaced with a
// real project's config. Every page uses this to show a loud, obvious
// warning in the UI instead of silently doing nothing (which is what a
// half-configured Firebase app looks like otherwise: empty catalog, dead
// login button, no console-visible reason why).
export const isPlaceholderConfig =
  firebaseConfig.apiKey === "YOUR_API_KEY" || firebaseConfig.projectId === "YOUR_PROJECT_ID";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
