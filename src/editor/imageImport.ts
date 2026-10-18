/** Longest side, in px, an imported image is stored at. Keeps documents within localStorage's ~5MB quota. */
export const MAX_IMAGE_SIDE = 1024;

/**
 * Decodes a raster image file and re-encodes it as a data URL, scaled down so
 * neither side exceeds MAX_IMAGE_SIDE. Re-encoding also drops metadata.
 * Returns null if the browser can't decode the file.
 */
export async function importImage(file: File): Promise<{ src: string; width: number; height: number } | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // WebP keeps transparency; browsers that can't encode it fall back to PNG.
  return { src: canvas.toDataURL('image/webp', 0.85), width, height };
}
