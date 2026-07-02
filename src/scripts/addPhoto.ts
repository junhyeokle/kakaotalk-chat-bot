import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { bucket } from '../firebase/admin';
import { savePhoto } from '../firebase/photoStore';

/**
 * One-shot CLI: uploads a local image to Firebase Storage and registers it in
 * the photo catalog with tags + a description. Tags are what let a room's
 * `photoTags` whitelist (see setPhotoTags.ts) control which photos it may
 * receive — e.g. a "웃김" tag never reaches a room only configured for
 * "진지"/"정보" tags.
 * Usage: npm run add-photo -- <filePath> "태그1,태그2" "이 사진 설명"
 */
async function main(): Promise<void> {
  const [filePath, tagsRaw, description] = process.argv.slice(2);

  if (!filePath || !tagsRaw || !description) {
    console.error('Usage: npm run add-photo -- <filePath> "태그1,태그2" "이 사진 설명"');
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length === 0) {
    console.error('At least one tag is required.');
    process.exit(1);
  }

  const ext = path.extname(resolvedPath).replace('.', '') || 'jpg';
  const storagePath = `photos/${crypto.randomUUID()}.${ext}`;

  await bucket.upload(resolvedPath, { destination: storagePath });

  const photoId = await savePhoto({
    storagePath,
    tags,
    description,
    uploadedAt: Date.now(),
  });

  console.log(`Photo uploaded to ${storagePath}, registered as photos/${photoId}.`);
  console.log(`Tags: ${tags.join(', ')}`);
  console.log('Enable it for a room with: npm run set-photo-tags -- <chatId> ' + tags.join(','));
}

main().catch((err) => {
  console.error('Failed to add photo:', err instanceof Error ? err.message : err);
  process.exit(1);
});
