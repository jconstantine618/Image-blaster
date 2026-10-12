const MAX_EDGE = 1920;
const MAX_BYTES = 3_500_000;

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
