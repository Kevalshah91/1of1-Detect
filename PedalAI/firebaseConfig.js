// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDWxEs63l-fmzIzeHP-s3HU__KsdEKxqaw",
  authDomain: "pedalai-fd8e5.firebaseapp.com",
  projectId: "pedalai-fd8e5",
  storageBucket: "pedalai-fd8e5.appspot.com",
  messagingSenderId: "73293177205",
  appId: "1:73293177205:web:1b26fd8ce7d496fd95333c",
  measurementId: "G-5MB4GLCCLB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);