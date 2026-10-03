import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Id } from '@/convex/_generated/dataModel';

/**
 * Long edge of an uploaded proof photo. Plenty for the AI check and for
 * support reviewing a contested charge, and about a tenth of a full camera
 * frame: faster on a phone connection, cheaper to store and to judge.
 */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.7;

/**
 * A JPEG no bigger than `MAX_EDGE_PX` on its long edge. Re-encoding also
 * drops the file's own EXIF (GPS included); what the check needs from it was
 * read before upload. Falls back to the original if it can't be processed.
 */
async function shrink(photo: { uri: string; mimeType: string }) {
  const context = ImageManipulator.manipulate(photo.uri);
  try {
    const original = await context.renderAsync();
    const { width, height } = original;
    original.release();
    if (Math.max(width, height) > MAX_EDGE_PX) {
      context.resize(width >= height ? { width: MAX_EDGE_PX } : { height: MAX_EDGE_PX });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    image.release();
    return { uri: saved.uri, mimeType: 'image/jpeg' };
  } catch (error: unknown) {
    console.warn('Could not shrink the photo; uploading it as is', error);
    return photo;
  } finally {
    context.release();
  }
}

/**
 * Uploads a local photo to Convex storage through a single-use upload URL and
 * returns its storage id.
 */
export async function uploadPhoto(
  uploadUrl: string,
  original: { uri: string; mimeType: string },
): Promise<Id<'_storage'>> {
  const photo = await shrink(original);
  // The blob read from a file URI comes back untyped, and React Native sends
  // a Blob body with the blob's own type as Content-Type (clobbering the
  // header), so the type has to live on the blob itself.
  const untyped = await (await fetch(photo.uri)).blob();
  const blob = new Blob([untyped], { type: photo.mimeType });

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': photo.mimeType },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}: ${await response.text()}`);
  }

  const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
  return storageId;
}
