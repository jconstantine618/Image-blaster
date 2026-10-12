const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_IMAGE_BYTES = 4_000_000;

/** Auto layout accepts at most 8 images. Direction control is a different, 4-image mode. */
export const MAX_WORLD_IMAGES = 8;

/** Several photos share one request body, which has to stay under the platform limit. */
export const MULTI_IMAGE_TOTAL_BYTES = 3_600_000;

export function perImageByteBudget(count: number): number {
  if (count <= 1) return 3_500_000;
  return Math.floor(MULTI_IMAGE_TOTAL_BYTES / Math.max(1, count));
}

export function imageExtension(file: { type: string; name: string }): string | null {
  const fromType = MIME_EXTENSIONS[file.type];
  if (fromType) return fromType;
  const match = /\.(jpe?g|png|webp)$/i.exec(file.name);
  if (!match) return null;
  return match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
}
