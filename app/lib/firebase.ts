import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_MEASUREMENT_ID,
};

const hasFirebaseConfig = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

let _app: FirebaseApp | null = null;
function initFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  if (!hasFirebaseConfig) {
    throw new Error(
      "Firebase chưa được cấu hình. Vui lòng set NEXT_PUBLIC_FIREBASE_API_KEY trong .env.local"
    );
  }
  _app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  return _app;
}

export const auth: Auth = hasFirebaseConfig
  ? getAuth(initFirebaseApp())
  : (null as unknown as Auth);
export const googleProvider: GoogleAuthProvider = hasFirebaseConfig
  ? new GoogleAuthProvider()
  : (null as unknown as GoogleAuthProvider);
export const db: Firestore = hasFirebaseConfig
  ? getFirestore(initFirebaseApp())
  : (null as unknown as Firestore);
export const storage: FirebaseStorage = hasFirebaseConfig
  ? getStorage(initFirebaseApp())
  : (null as unknown as FirebaseStorage);
