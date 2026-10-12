export const FAL_TASKS = {
  edit: "fal-ai/nano-banana-2/edit",
  mesh: "fal-ai/hunyuan3d-v3/image-to-3d",
  sound: "fal-ai/elevenlabs/sound-effects/v2",
} as const;

export type FalTask = keyof typeof FAL_TASKS;

const FAL_QUEUE = "https://queue.fal.run";

export type FalSubmitInput = {
  task: FalTask;
  prompt?: string;
  imageUrl?: string;
  loop?: boolean;
  durationSeconds?: number;
};

export type FalJobResult = {
  imageUrl?: string;
  glbUrl?: string;
  thumbnailUrl?: string;
  audioUrl?: string;
};

export function buildFalInput(input: FalSubmitInput): Record<string, unknown> {
  if (input.task === "edit") {
    if (!input.prompt?.trim()) throw new Error("An edit prompt is required.");
    if (!input.imageUrl) throw new Error("An image is required for the edit.");
    assertImageReference(input.imageUrl);
    return {
      prompt: input.prompt.trim().slice(0, 2000),
      image_urls: [input.imageUrl],
      num_images: 1,
      aspect_ratio: "auto",
      output_format: "png",
      resolution: "1K",
      limit_generations: true,
    };
  }

  if (input.task === "mesh") {
    if (!input.imageUrl) throw new Error("An image is required for the mesh.");
    assertImageReference(input.imageUrl);
    return {
      input_image_url: input.imageUrl,
      generate_type: "Normal",
      enable_pbr: true,
      face_count: 50000,
    };
  }

  if (!input.prompt?.trim()) throw new Error("A sound prompt is required.");
  const duration = input.durationSeconds;
  if (duration !== undefined && (duration < 0.5 || duration > 22)) {
    throw new Error("Sound duration must be between 0.5 and 22 seconds.");
  }
  return {
    text: input.prompt.trim().slice(0, 1000),
    loop: Boolean(input.loop),
    prompt_influence: 0.3,
    output_format: "mp3_44100_128",
    ...(duration !== undefined ? { duration_seconds: duration } : {}),
  };
}

export async function submitFalJob(apiKey: string, input: FalSubmitInput, fetchImpl: typeof fetch = fetch): Promise<string> {
  const endpoint = FAL_TASKS[input.task];
  const response = await fetchImpl(`${FAL_QUEUE}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildFalInput(input)),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(messageOf(payload) || `FAL submit failed (${response.status}).`);
  }
  const requestId = typeof payload.request_id === "string" ? payload.request_id : "";
  if (!requestId) throw new Error("FAL did not return a request_id.");
  return requestId;
}

export async function pollFalJob(
  apiKey: string,
  task: FalTask,
  requestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: string; result: FalJobResult | null; error: string | null }> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
    throw new Error("Invalid FAL request id.");
  }
  const endpoint = FAL_TASKS[task];
  const headers = { Authorization: `Key ${apiKey}` };
  const statusResponse = await fetchImpl(`${FAL_QUEUE}/${endpoint}/requests/${requestId}/status`, { headers });
  const statusPayload = await readJson(statusResponse);
  if (!statusResponse.ok) {
    throw new Error(messageOf(statusPayload) || `FAL status failed (${statusResponse.status}).`);
  }
  const status = typeof statusPayload.status === "string" ? statusPayload.status : "IN_PROGRESS";
  if (status !== "COMPLETED") {
    const error = status === "FAILED" ? messageOf(statusPayload) || "FAL request failed." : null;
    return { status, result: null, error };
  }

  const resultResponse = await fetchImpl(`${FAL_QUEUE}/${endpoint}/requests/${requestId}`, { headers });
  const resultPayload = await readJson(resultResponse);
  if (!resultResponse.ok) {
    throw new Error(messageOf(resultPayload) || `FAL result failed (${resultResponse.status}).`);
  }
  return { status, result: readFalResult(resultPayload), error: null };
}

export function readFalResult(payload: Record<string, unknown>): FalJobResult {
  const images = Array.isArray(payload.images) ? payload.images : [];
  const firstImage = asRecord(images[0]);
  const modelUrls = asRecord(payload.model_urls);
  const glb = asRecord(modelUrls.glb);
  const thumbnail = asRecord(payload.thumbnail);
  const audio = asRecord(payload.audio);
  return {
    imageUrl: httpsUrl(firstImage.url),
    glbUrl: httpsUrl(glb.url) ?? httpsUrl(asRecord(payload.model_mesh).url),
    thumbnailUrl: httpsUrl(thumbnail.url),
    audioUrl: httpsUrl(audio.url),
  };
}

export function isFalTask(value: string): value is FalTask {
  return value in FAL_TASKS;
}

function assertImageReference(value: string): void {
  if (value.startsWith("data:image/")) {
    if (value.length > 4_000_000) throw new Error("Image is too large to send to FAL.");
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Image URL is invalid.");
  }
  if (url.protocol !== "https:") throw new Error("Image URL must be https.");
  const host = url.hostname;
  const allowed = host.endsWith(".fal.media") || host.endsWith(".fal.ai") || host === "fal.media";
  if (!allowed) throw new Error("Mesh and edit images must be data URLs or FAL-hosted files.");
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return asRecord(parsed);
  } catch {
    return { message: text.slice(0, 400) };
  }
}

function messageOf(payload: Record<string, unknown>): string | null {
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.message === "string") return payload.message;
  const error = asRecord(payload.error);
  if (typeof error.message === "string") return error.message;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}
