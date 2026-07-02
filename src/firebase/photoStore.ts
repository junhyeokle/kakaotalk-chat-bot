import { db, bucket } from './admin';

export interface Photo {
  id: string;
  storagePath: string;
  /** Whitelist tags a room must allow (via RoomConfig.photoTags) to receive this. */
  tags: string[];
  /** What's in the photo / when it fits — this is all the LLM ever "sees" of it. */
  description: string;
  uploadedAt: number;
}

function photosCollection() {
  return db.collection('photos');
}

export async function savePhoto(photo: Omit<Photo, 'id'>): Promise<string> {
  const ref = await photosCollection().add(photo);
  return ref.id;
}

export async function getPhoto(photoId: string): Promise<Photo | undefined> {
  const snapshot = await photosCollection().doc(photoId).get();
  return snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as Photo) : undefined;
}

export async function listAllPhotos(): Promise<Photo[]> {
  const snapshot = await photosCollection().get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Photo));
}

/**
 * Photos whose tags overlap with the room's allowed tag list. An empty
 * allowedTags means the room hasn't opted into photo-sending at all — this
 * returns no candidates rather than defaulting to "everything allowed", so a
 * room stays photo-silent until explicitly configured.
 */
export async function listPhotosByTags(allowedTags: string[]): Promise<Photo[]> {
  if (allowedTags.length === 0) return [];

  // Firestore array-contains-any supports at most 10 values per query.
  const snapshot = await photosCollection()
    .where('tags', 'array-contains-any', allowedTags.slice(0, 10))
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Photo));
}

export async function downloadPhotoBytes(storagePath: string): Promise<Buffer> {
  const [data] = await bucket.file(storagePath).download();
  return data;
}
