import type { Id } from '@/convex/_generated/dataModel';

/**
 * Uploads a local photo to Convex storage through a single-use upload URL and
 * returns its storage id.
 */
export async function uploadPhoto(
  uploadUrl: string,
  photo: { uri: string; mimeType: string },
): Promise<Id<'_storage'>> {
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
