import { framesMatch } from "./image-frame";
import { readImageSize } from "./image-size";
import { imageExtension, MAX_IMAGE_BYTES, MAX_WORLD_IMAGES } from "./images";
import type { ImageKind } from "./pricing";

export type UploadFile = {
  name: string;
  type: string;
  size: number;
};

export function generationKind(imageCount: number, isPano: boolean): ImageKind {
  if (imageCount > 1) return "multi-image";
  return isPano ? "pano" : "non-pano";
}

export function validateGenerationFiles(
  files: UploadFile[],
  isPano: boolean,
): { ok: true } | { ok: false; status: number; error: string } {
  if (files.length === 0) {
    return { ok: false, status: 400, error: "Choose a JPEG, PNG, or WebP photograph." };
  }
  if (files.length > MAX_WORLD_IMAGES) {
    return { ok: false, status: 400, error: "Auto layout accepts up to 8 photos of the same space." };
  }
  if (isPano && files.length > 1) {
    return { ok: false, status: 400, error: "A 360° panorama can't be combined with other images." };
  }

  let total = 0;
  for (const file of files) {
    if (!imageExtension(file)) {
      return { ok: false, status: 400, error: "Use JPEG, PNG, or WebP images." };
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return { ok: false, status: 413, error: "Each image must be under 4 MB. The uploader compresses photos before sending." };
    }
    total += file.size;
  }
  if (files.length > 1 && total > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: "Those photos are still over 4 MB together. Remove one or use smaller images." };
  }
  return { ok: true };
}

export function matchingFrames(images: Uint8Array[]): { ok: true } | { ok: false; error: string } {
  const sizes = images.map((bytes) => readImageSize(bytes));
  if (sizes.some((size) => size === null)) {
    return { ok: false, error: "Could not read every photo's dimensions. Use JPEG, PNG, or WebP." };
  }
  if (!framesMatch(sizes.filter((size): size is NonNullable<typeof size> => size !== null))) {
    return { ok: false, error: "Auto layout needs every photo at the same resolution and aspect ratio." };
  }
  return { ok: true };
}
