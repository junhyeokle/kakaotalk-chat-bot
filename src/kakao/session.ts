import * as fs from 'fs';
import * as path from 'path';
import { OAuthCredential } from 'node-kakao';

// Session file lives in the project root and is gitignored: it holds a real
// account's access/refresh tokens and device UUID, which grant full access to
// the KakaoTalk account. Committing it would leak account credentials.
const SESSION_FILE = path.resolve(process.cwd(), '.kakao-session.json');

export interface SavedSession {
  deviceName: string;
  deviceUUID: string;
  userId: string; // Long serialized as string
  accessToken: string;
  refreshToken: string;
}

export function saveSession(session: SavedSession): void {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

export function loadSession(): SavedSession | undefined {
  if (!fs.existsSync(SESSION_FILE)) return undefined;
  return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')) as SavedSession;
}

export function hasSession(): boolean {
  return fs.existsSync(SESSION_FILE);
}

/**
 * Convert an OAuthCredential (as returned by AuthApiClient.login) plus the
 * device metadata into the serializable shape we persist. `userId` is a bson
 * Long, so we store its string form and rebuild it on load.
 */
export function credentialToSession(
  credential: OAuthCredential,
  deviceName: string,
): SavedSession {
  return {
    deviceName,
    deviceUUID: credential.deviceUUID,
    userId: credential.userId.toString(),
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
  };
}
