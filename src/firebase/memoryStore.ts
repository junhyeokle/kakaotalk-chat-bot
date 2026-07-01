import { db, admin } from './admin';

export interface StoredMessage {
  sender: string;
  /** Stable per-account id, absent for the bot's own messages. */
  senderId?: string;
  text: string;
  isBot: boolean;
  timestamp: number;
}

// Number of recent messages kept per room and fed into the LLM context.
const HISTORY_LIMIT = 20;

function messagesCollection(chatId: string) {
  return db.collection('rooms').doc(chatId).collection('messages');
}

export async function appendMessage(chatId: string, message: StoredMessage): Promise<void> {
  await messagesCollection(chatId).add(message);
  await pruneOldMessages(chatId);
}

/**
 * Returns the last N messages for a room in chronological (oldest-first) order,
 * which is the order an LLM expects to read a conversation.
 */
export async function getRecentMessages(
  chatId: string,
  limit: number = HISTORY_LIMIT,
): Promise<StoredMessage[]> {
  const snapshot = await messagesCollection(chatId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as StoredMessage)
    .reverse();
}

// Keep storage bounded: delete anything older than the most recent HISTORY_LIMIT.
async function pruneOldMessages(chatId: string): Promise<void> {
  const snapshot = await messagesCollection(chatId)
    .orderBy('timestamp', 'desc')
    .offset(HISTORY_LIMIT)
    .get();

  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

export function nowTimestamp(): number {
  return Date.now();
}

export { admin };
