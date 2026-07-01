import { db } from './admin';

export interface Participant {
  userId: string;
  nickname: string;
  profile: string;
  lastUpdated: number;
}

export interface ParticipantUpdate {
  userId: string;
  nickname: string;
  profile: string;
}

function participantsCollection(chatId: string) {
  return db.collection('rooms').doc(chatId).collection('participants');
}

/** All known participants for a room, most recently updated first. */
export async function getAllParticipants(chatId: string): Promise<Participant[]> {
  const snapshot = await participantsCollection(chatId)
    .orderBy('lastUpdated', 'desc')
    .get();
  return snapshot.docs.map((doc) => doc.data() as Participant);
}

/**
 * Merges freshly generated participant profiles into Firestore. Keyed by
 * userId (stable) rather than nickname, since nicknames can change.
 */
export async function saveParticipantProfiles(
  chatId: string,
  updates: ParticipantUpdate[],
): Promise<void> {
  if (updates.length === 0) return;

  const batch = db.batch();
  const now = Date.now();

  for (const update of updates) {
    const ref = participantsCollection(chatId).doc(update.userId);
    batch.set(
      ref,
      {
        userId: update.userId,
        nickname: update.nickname,
        profile: update.profile,
        lastUpdated: now,
      },
      { merge: true },
    );
  }

  await batch.commit();
}
