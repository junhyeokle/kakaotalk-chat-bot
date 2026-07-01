import { db } from './admin';

export interface RoomProfile {
  sourceLabel: string;
  vibe: string;
  contentRating: string;
  topics: string[];
  personaSuggestion: string;
  analyzedAt: number;
}

function roomProfileDoc(profileId: string) {
  return db.collection('roomProfiles').doc(profileId);
}

export async function saveRoomProfile(profileId: string, profile: RoomProfile): Promise<void> {
  await roomProfileDoc(profileId).set(profile);
}

export async function getRoomProfile(profileId: string): Promise<RoomProfile | undefined> {
  const snapshot = await roomProfileDoc(profileId).get();
  return snapshot.exists ? (snapshot.data() as RoomProfile) : undefined;
}

export async function listRoomProfiles(): Promise<{ id: string; profile: RoomProfile }[]> {
  const snapshot = await db.collection('roomProfiles').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, profile: doc.data() as RoomProfile }));
}
