import { sharedFrame } from "./image-frame";
import { perImageByteBudget } from "./images";

const MAX_EDGE = 1920;
const MAX_BYTES = 3_500_000;

export type PreparedImage = {
  blob: Blob;
  previewUrl?: string;
  dataUrl?: string;
};

export async function prepareImage(file: File): Promise<{ blob: Blob; previewUrl: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read that image.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.9;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > MAX_BYTES && quality > 0.45) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    blob = await canvasToBlob(canvas, quality);
  }
  if (blob.size > MAX_BYTES) {
    throw new Error("That image is still over 3.5 MB after compression.");
  }

  const previewUrl = canvas.toDataURL("image/jpeg", 0.6);
  const dataUrl = await blobToDataUrl(blob);
  return { blob, previewUrl, dataUrl };
}

export async function prepareImages(files: File[]): Promise<{ images: PreparedImage[]; cropped: boolean }> {
  if (files.length === 0) throw new Error("Add a photograph first.");
  if (files.length === 1) {
    const image = await prepareImage(files[0]);
    return { images: [image], cropped: false };
  }

  const bitmaps = await Promise.all(files.map((file) => createImageBitmap(file)));
  try {
    let frame = sharedFrame(bitmaps.map((bitmap) => ({ width: bitmap.width, height: bitmap.height })), MAX_EDGE);
    const cropped = frame.cropped;
    const budget = perImageByteBudget(files.length);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const images = await Promise.all(bitmaps.map((bitmap, index) => renderCover(bitmap, frame.width, frame.height, budget, index === 0)));
      if (images.every((image) => image.blob.size <= budget)) {
        return { images, cropped };
      }
      frame = {
        width: Math.max(1, Math.round(frame.width * 0.85)),
        height: Math.max(1, Math.round(frame.height * 0.85)),
        cropped,
      };
    }
    throw new Error("Those photos are still too large together after compression. Try fewer images.");
  } finally {
    for (const bitmap of bitmaps) bitmap.close();
  }
}

async function renderCover(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  budget: number,
  withPreview: boolean,
): Promise<PreparedImage> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read that image.");
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const drawnWidth = bitmap.width * scale;
  const drawnHeight = bitmap.height * scale;
  context.drawImage(bitmap, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);

  let quality = 0.85;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > budget && quality > 0.45) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    blob = await canvasToBlob(canvas, quality);
  }
  return {
    blob,
    previewUrl: withPreview ? canvas.toDataURL("image/jpeg", 0.6) : undefined,
    dataUrl: withPreview ? await blobToDataUrl(blob) : undefined,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress that image."))),
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the compressed image."));
    reader.readAsDataURL(blob);
  });
}
