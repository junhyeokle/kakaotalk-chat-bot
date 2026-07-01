import { db } from './admin';
import { config } from '../config';

export interface RoomConfig {
  enabled: boolean;
  engagementProbability: number;
  personaOverride?: string;
}

function roomConfigDoc(chatId: string) {
  return db.collection('rooms').doc(chatId);
}

/**
 * Returns the per-room config, falling back to env defaults when a room has
 * never been configured. Missing fields fall back individually so a partially
 * configured room still behaves sensibly.
 */
export async function getRoomConfig(chatId: string): Promise<RoomConfig> {
  const snapshot = await roomConfigDoc(chatId).get();
  const data = snapshot.exists ? (snapshot.data() ?? {}) : {};

  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
    engagementProbability:
      typeof data.engagementProbability === 'number'
        ? data.engagementProbability
        : config.engagementProbability,
    personaOverride:
      typeof data.personaOverride === 'string' ? data.personaOverride : undefined,
  };
}

export async function setRoomConfig(
  chatId: string,
  update: Partial<RoomConfig>,
): Promise<void> {
  await roomConfigDoc(chatId).set(update, { merge: true });
}

export interface RoomMemory {
  /** Long-term rolling summary of this room's conversation, or '' if none yet. */
  summary: string;
  /** Messages logged since the summary was last refreshed. */
  messagesSinceSummary: number;
}

export async function getRoomMemory(chatId: string): Promise<RoomMemory> {
  const snapshot = await roomConfigDoc(chatId).get();
  const data = snapshot.exists ? (snapshot.data() ?? {}) : {};

  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    messagesSinceSummary:
      typeof data.messagesSinceSummary === 'number' ? data.messagesSinceSummary : 0,
  };
}

/**
 * Increments the room's message counter and returns the new value. Used to
 * decide when enough new messages have accumulated to refresh the summary.
 */
export async function incrementMessageCounter(chatId: string): Promise<number> {
  const doc = roomConfigDoc(chatId);
  const db = doc.firestore;
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(doc);
    const current =
      snapshot.exists && typeof snapshot.data()?.messagesSinceSummary === 'number'
        ? (snapshot.data()!.messagesSinceSummary as number)
        : 0;
    const next = current + 1;
    tx.set(doc, { messagesSinceSummary: next }, { merge: true });
    return next;
  });
}

/** Saves a freshly generated summary and resets the message counter. */
export async function saveRoomSummary(chatId: string, summary: string): Promise<void> {
  await roomConfigDoc(chatId).set(
    { summary, messagesSinceSummary: 0 },
    { merge: true },
  );
}
