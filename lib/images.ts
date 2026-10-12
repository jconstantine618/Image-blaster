const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_IMAGE_BYTES = 4_000_000;

export function imageExtension(file: { type: string; name: string }): string | null {
  const fromType = MIME_EXTENSIONS[file.type];
  if (fromType) return fromType;
  const match = /\.(jpe?g|png|webp)$/i.exec(file.name);
  if (!match) return null;
  return match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
}
