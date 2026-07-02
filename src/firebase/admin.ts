import * as fs from 'fs';
import * as path from 'path';
import admin from 'firebase-admin';
import { config } from '../config';

interface FirebaseHandles {
  firestore: admin.firestore.Firestore;
  bucket: ReturnType<admin.storage.Storage['bucket']>;
}

function initFirebase(): FirebaseHandles {
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
      storageBucket:
        config.firebaseStorageBucket || `${serviceAccount.project_id}.appspot.com`,
    });
  }
  // Bot messages have no senderId, so writes naturally include undefined
  // fields (e.g. StoredMessage.senderId) — let Firestore drop them instead
  // of throwing.
  const firestore = admin.firestore();
  firestore.settings({ ignoreUndefinedProperties: true });
  return { firestore, bucket: admin.storage().bucket() };
}

const handles = initFirebase();
export const db = handles.firestore;
export const bucket = handles.bucket;
export { admin };
