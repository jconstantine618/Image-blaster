import { generationKind, matchingFrames, validateGenerationFiles } from "@/lib/generation-request";
import { generationMode, worldLabsKey } from "@/lib/env";
import { imageExtension } from "@/lib/images";
import { createMockOperationId } from "@/lib/mock-world";
import { quoteMarbleGeneration } from "@/lib/pricing";
import { DISPLAY_NAME_MAX, startWorldGeneration, WorldLabsError } from "@/lib/worldlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("image").filter((entry): entry is File => entry instanceof File);
  const isPano = form.get("isPano") === "true";
  const checked = validateGenerationFiles(files, isPano);
  if (!checked.ok) {
    return Response.json({ error: checked.error }, { status: checked.status });
  }

  const images = [];
  for (const file of files) {
    const extension = imageExtension(file);
    if (!extension) {
      return Response.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
    }
    images.push({
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name || `photo.${extension}`,
      extension,
    });
  }
  if (images.length > 1) {
    const frames = matchingFrames(images.map((image) => image.bytes));
    if (!frames.ok) return Response.json({ error: frames.error }, { status: 400 });
  }

  const displayName = stringField(form.get("displayName"), "Untitled world").slice(0, DISPLAY_NAME_MAX);
  const textPrompt = stringField(form.get("textPrompt"), "").trim();
  const quote = quoteMarbleGeneration(generationKind(images.length, isPano));

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
    const operationId = await startWorldGeneration({
      apiKey,
      images,
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
