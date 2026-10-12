import { generationMode, worldLabsKey } from "@/lib/env";
import { imageExtension, MAX_IMAGE_BYTES } from "@/lib/images";
import { createMockOperationId } from "@/lib/mock-world";
import { quoteMarbleGeneration } from "@/lib/pricing";
import { DISPLAY_NAME_MAX, startWorldGeneration, WorldLabsError } from "@/lib/worldlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) {
    return Response.json({ error: "Choose a JPEG, PNG, or WebP photograph." }, { status: 400 });
  }
  const extension = imageExtension(image);
  if (!extension) {
    return Response.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
  }
  if (image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Image must be under 4 MB. The uploader compresses photos before sending." }, { status: 413 });
  }

  const isPano = form.get("isPano") === "true";
  const displayName = stringField(form.get("displayName"), "Untitled world").slice(0, DISPLAY_NAME_MAX);
  const textPrompt = stringField(form.get("textPrompt"), "").trim();
  const quote = quoteMarbleGeneration(isPano ? "pano" : "non-pano");

  if (generationMode() === "mock") {
    return Response.json({
      operationId: createMockOperationId(),
      mode: "mock",
      quote,
    });
  }

  const apiKey = worldLabsKey();
  if (!apiKey) {
    return Response.json({ error: "WORLDLABS_API_KEY is not set." }, { status: 503 });
  }

  try {
    const bytes = new Uint8Array(await image.arrayBuffer());
    const operationId = await startWorldGeneration({
      apiKey,
      bytes,
      fileName: image.name || `photo.${extension}`,
      extension,
      displayName,
      isPano,
      textPrompt: textPrompt || undefined,
    });
    return Response.json({ operationId, mode: "live", quote });
  } catch (error) {
    if (error instanceof WorldLabsError) {
      const status = error.status >= 400 && error.status < 600 ? error.status : 502;
      return Response.json({ error: error.message }, { status });
    }
    const message = error instanceof Error ? error.message : "Could not start world generation.";
    return Response.json({ error: message }, { status: 502 });
  }
}

function stringField(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
