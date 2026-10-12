import type { StoredObjectRequest } from "@/lib/session";

export type ExtraObject = {
  id: string;
  name: string;
  detail: string;
  glbUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
};

export type ExtraState = {
  ambient: { detail: string; audioUrl?: string } | null;
  objects: ExtraObject[];
  error: string | null;
};

type FalPoll = {
  status: string;
  error: string | null;
  result: { imageUrl?: string; glbUrl?: string; audioUrl?: string } | null;
};

const runs = new Map<string, { listeners: Set<(state: ExtraState) => void> }>();

export function watchExtras(
  operationId: string,
  extras: { ambientPrompt: string; objects: StoredObjectRequest[] },
  imageDataUrl: string,
  onUpdate: (state: ExtraState) => void,
) {
  let run = runs.get(operationId);
  if (!run) {
    const listeners = new Set<(state: ExtraState) => void>();
    run = { listeners };
    runs.set(operationId, run);
    void runExtras(extras, imageDataUrl, (state) => {
      for (const listener of listeners) listener(state);
    }).catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : "FAL extras failed.";
      for (const listener of listeners) listener({ ambient: null, objects: [], error: message });
    });
  }
  run.listeners.add(onUpdate);
  return () => {
    run?.listeners.delete(onUpdate);
  };
}

export async function runExtras(
  extras: { ambientPrompt: string; objects: StoredObjectRequest[] },
  imageDataUrl: string,
  onUpdate: (state: ExtraState) => void,
) {
  const state: ExtraState = { ambient: null, objects: [], error: null };
  const publish = () => onUpdate({ ...state, objects: state.objects.map((object) => ({ ...object })), ambient: state.ambient ? { ...state.ambient } : null });

  for (const object of extras.objects) {
    const current: ExtraObject = { id: object.id, name: object.name.trim() || "Object", detail: "Isolating the object" };
    state.objects.push(current);
    publish();
    try {
      const edited = await waitFor("edit", {
        task: "edit",
        prompt: `Isolate one ${current.name} as a single object on a plain neutral background, centered. ${object.description}. No room, no other objects.`,
        imageUrl: imageDataUrl,
      });
      const imageUrl = edited.result?.imageUrl;
      if (!imageUrl) throw new Error("The image edit did not return an image.");
      current.imageUrl = imageUrl;
      current.detail = "Meshing with Hunyuan 3D";
      publish();
      const mesh = await waitFor("mesh", { task: "mesh", imageUrl });
      current.glbUrl = mesh.result?.glbUrl;
      current.detail = "Recording a short sound";
      publish();
      const sound = await waitFor("sound", {
        task: "sound",
        prompt: `A short physical sound of a ${current.name}. ${object.description}`,
        durationSeconds: 1.5,
      });
      current.audioUrl = sound.result?.audioUrl;
      current.detail = current.glbUrl ? "Ready, placed near the start of the world" : "Sound is ready. The mesh URL was missing.";
      publish();
    } catch (cause) {
      current.detail = cause instanceof Error ? cause.message : "Object generation failed.";
      publish();
    }
  }

  if (extras.ambientPrompt.trim()) {
    state.ambient = { detail: "Generating ambience" };
    publish();
    try {
      const sound = await waitFor("sound", {
        task: "sound",
        prompt: extras.ambientPrompt.trim(),
        loop: true,
        durationSeconds: 12,
      });
      state.ambient = { detail: "Ready", audioUrl: sound.result?.audioUrl };
    } catch (cause) {
      state.ambient = { detail: cause instanceof Error ? cause.message : "Ambience failed." };
    }
    publish();
  }
}

async function waitFor(task: string, body: Record<string, unknown>): Promise<FalPoll> {
  const created = await falJson("/api/fal", { method: "POST", body });
  const requestId = typeof created.requestId === "string" ? created.requestId : "";
  if (!requestId) throw new Error(typeof created.error === "string" ? created.error : "FAL did not start.");
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    await delay(3000);
    const job = (await falJson(`/api/fal?task=${encodeURIComponent(task)}&requestId=${encodeURIComponent(requestId)}`)) as FalPoll & { error?: string };
    if (job.error && !job.status) throw new Error(job.error);
    if (job.status === "FAILED") throw new Error(job.error || "FAL request failed.");
    if (job.status === "COMPLETED") return job;
  }
  throw new Error("FAL took longer than 12 minutes.");
}

async function falJson(url: string, init?: { method: string; body: Record<string, unknown> }) {
  const response = await fetch(url, init ? {
    method: init.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(init.body),
  } : undefined);
  return (await response.json()) as Record<string, unknown>;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
