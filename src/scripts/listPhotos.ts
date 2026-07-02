import { listAllPhotos } from '../firebase/photoStore';

/**
 * One-shot CLI to inspect the photo catalog.
 * Usage: npm run list-photos
 */
async function main(): Promise<void> {
  const photos = await listAllPhotos();

  if (photos.length === 0) {
    console.log('No photos in the catalog yet. Run "npm run add-photo" first.');
    return;
  }

  for (const p of photos) {
    console.log(`\n--- photos/${p.id} ---`);
    console.log(`storagePath: ${p.storagePath}`);
    console.log(`tags: ${p.tags.join(', ')}`);
    console.log(`description: ${p.description}`);
  }
}

main().catch((err) => {
  console.error('Failed to list photos:', err instanceof Error ? err.message : err);
  process.exit(1);
});
