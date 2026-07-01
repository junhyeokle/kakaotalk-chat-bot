import * as fs from 'fs';
import * as path from 'path';
import admin from 'firebase-admin';
import { config } from '../config';

function initFirebase(): admin.firestore.Firestore {
  if (admin.apps.length === 0) {
    const serviceAccountPath = path.resolve(config.firebaseServiceAccountPath);
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(
        `Firebase service account file not found at ${serviceAccountPath}. ` +
          `Set FIREBASE_SERVICE_ACCOUNT_PATH to a valid service account JSON.`,
      );
    }
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  // Bot messages have no senderId, so writes naturally include undefined
  // fields (e.g. StoredMessage.senderId) — let Firestore drop them instead
  // of throwing.
  const firestore = admin.firestore();
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}

export const db = initFirebase();
export { admin };
