import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initializeApp as initializeRestApp } from "@ljoukov/firebase-admin-cloudflare/app";
import { getFirestore } from "@ljoukov/firebase-admin-cloudflare/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getGoogleServiceToken } from "./google-service-token";

let adminApp: ReturnType<typeof initializeApp> | null = null;

function getAdminApp() {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY env not set");
  }
  const account = JSON.parse(serviceAccount);
  const credential = cert(account);
  credential.getAccessToken = () => getGoogleServiceToken(account);
  adminApp = initializeApp({ credential, projectId: account.project_id,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
  return adminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  // This transport uses fetch/Web Crypto, without gRPC or runtime code generation.
  return getFirestore(initializeRestApp({
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
  })) as unknown as Firestore;
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}
