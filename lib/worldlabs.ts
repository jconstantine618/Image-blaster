import { WORLDLABS_MODEL } from "./pricing";
import type { PublicOperation, SplatVariant } from "./types";

export const WORLDLABS_API = "https://api.worldlabs.ai/marble/v1";

const VARIANT_LABELS: Record<string, string> = {
  "100k": "100k splats",
  "500k": "500k splats",
  full_res: "Full resolution",
};

const VARIANT_ORDER = ["100k", "500k", "full_res"];

export type StartWorldInput = {
  apiKey: string;
  bytes: Uint8Array;
  fileName: string;
  extension: string;
  displayName: string;
  isPano: boolean;
  textPrompt?: string;
  fetchImpl?: typeof fetch;
};

export async function startWorldGeneration(input: StartWorldInput): Promise<string> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const prepared = await worldLabsJson(fetchImpl, input.apiKey, "/media-assets:prepare_upload", {
    method: "POST",
    body: {
      file_name: sanitizeFileName(input.fileName),
      kind: "image",
      extension: input.extension,
    },
  });

  const media = asRecord(prepared.media_asset);
  const mediaAssetId = stringField(media, "media_asset_id") || stringField(media, "id");
  const uploadInfo = asRecord(prepared.upload_info);
  const uploadUrl = stringField(uploadInfo, "upload_url");
  if (!mediaAssetId || !uploadUrl) {
    throw new WorldLabsError("World Labs did not return a media asset id and upload URL.", 502);
  }

  const headers = new Headers();
  const required = asRecord(uploadInfo.required_headers);
  for (const [key, value] of Object.entries(required)) {
    if (typeof value === "string") headers.set(key, value);
  }
  const method = stringField(uploadInfo, "upload_method") || "PUT";
  const payload = new ArrayBuffer(input.bytes.byteLength);
  new Uint8Array(payload).set(input.bytes);
  const upload = await fetchImpl(uploadUrl, {
    method,
    headers,
    body: payload,
  });
  if (!upload.ok) {
    throw new WorldLabsError(`World Labs media upload failed (${upload.status}).`, upload.status);
  }

  const textPrompt = input.textPrompt?.trim();
  const operation = await worldLabsJson(fetchImpl, input.apiKey, "/worlds:generate", {
    method: "POST",
    body: {
      display_name: input.displayName.slice(0, 80),
      model: WORLDLABS_MODEL,
      world_prompt: {
        type: "image",
        image_prompt: {
          source: "media_asset",
          media_asset_id: mediaAssetId,
        },
        is_pano: input.isPano ? "true" : "false",
        ...(textPrompt ? { text_prompt: textPrompt.slice(0, 2000) } : {}),
      },
    },
  });

  const operationId = stringField(operation, "operation_id");
  if (!operationId) {
    throw new WorldLabsError("World Labs did not return an operation_id.", 502);
  }
  return operationId;
}

export async function fetchOperation(apiKey: string, operationId: string, fetchImpl: typeof fetch = fetch): Promise<PublicOperation> {
  const operation = await worldLabsJson(fetchImpl, apiKey, `/operations/${encodeURIComponent(operationId)}`, {
    method: "GET",
  });
  return toPublicOperation(operationId, operation);
}

export function toPublicOperation(operationId: string, operation: unknown): PublicOperation {
  const record = asRecord(operation);
  const done = record.done === true;
  const error = formatOperationError(record.error);
  const metadata = asRecord(record.metadata);
  const progress = asRecord(metadata.progress);
  const response = asRecord(record.response);
  const world = hasAssets(response) ? response : asRecord(response.world);
  const assets = asRecord(world.assets);
  const splats = asRecord(assets.splats);
  const semantics = asRecord(splats.semantics_metadata);
  const mesh = asRecord(assets.mesh);
  const imagery = asRecord(assets.imagery);
  const failed = Boolean(error) && (done || statusOf(progress) === "FAILED");

  const metricScale = numberField(semantics, "metric_scale_factor");
  const ground = numberField(semantics, "ground_plane_offset");

  return {
    operationId,
    mode: "live",
    done: done && !failed,
    failed,
    status: failed ? "FAILED" : done ? "SUCCEEDED" : statusOf(progress) || "IN_PROGRESS",
    description:
      stringField(progress, "description") ||
      (failed ? "World generation failed." : done ? "World generation completed." : "World generation in progress"),
    progress: null,
    displayName: stringField(world, "display_name") || "Untitled world",
    error,
    worldId: stringField(world, "id") || stringField(metadata, "world_id"),
    marbleUrl: stringField(world, "world_marble_url"),
    caption: stringField(assets, "caption"),
    thumbnailUrl: httpsField(assets, "thumbnail_url"),
    panoUrl: httpsField(imagery, "pano_url"),
    colliderMeshUrl: httpsField(mesh, "collider_mesh_url"),
    splatVariants: done && !failed ? splatVariants(splats.spz_urls) : [],
    semantics: {
      metricScaleFactor: metricScale && metricScale > 0 ? metricScale : 1,
      groundPlaneOffset: ground ?? 0,
    },
    coordinateFrame: "marble",
  };
}

export function splatVariants(value: unknown): SplatVariant[] {
  const urls = asRecord(value);
  const keys = Object.keys(urls);
  const ordered = [
    ...VARIANT_ORDER.filter((key) => typeof urls[key] === "string"),
    ...keys.filter((key) => !VARIANT_ORDER.includes(key) && typeof urls[key] === "string").sort(),
  ];
  return ordered.flatMap((key) => {
    const url = urls[key];
    if (typeof url !== "string" || !isHttpsUrl(url)) return [];
    return [{ id: key, label: VARIANT_LABELS[key] ?? key, url }];
  });
}

export function preferredSplat(variants: SplatVariant[]): SplatVariant | null {
  return variants.find((variant) => variant.id === "100k") ?? variants[0] ?? null;
}

export function assetUrl(operation: PublicOperation, asset: string, variant?: string | null): string | null {
  if (asset === "splat") {
    const match = variant
      ? operation.splatVariants.find((item) => item.id === variant)
      : preferredSplat(operation.splatVariants);
    return match?.url ?? null;
  }
  if (asset === "pano") return operation.panoUrl;
  if (asset === "thumbnail") return operation.thumbnailUrl;
  if (asset === "collider") return operation.colliderMeshUrl;
  return null;
}

export class WorldLabsError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "WorldLabsError";
    this.status = status;
  }
}

async function worldLabsJson(
  fetchImpl: typeof fetch,
  apiKey: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${WORLDLABS_API}${path}`, {
    method: init.method,
    headers: {
      "WLT-Api-Key": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new WorldLabsError(errorMessage(payload, response.status), response.status);
  }
  return payload;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return asRecord(parsed);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function errorMessage(payload: Record<string, unknown>, status: number): string {
  const nested = asRecord(payload.error);
  const message =
    stringField(payload, "message") ||
    stringField(payload, "detail") ||
    stringField(nested, "message") ||
    stringField(nested, "detail");
  if (status === 402) {
    return message || "World Labs returned 402. The account needs API credits from platform.worldlabs.ai.";
  }
  return message || `World Labs request failed (${status}).`;
}

function formatOperationError(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return stringField(record, "message") || stringField(record, "detail") || "World generation failed.";
}

function hasAssets(value: Record<string, unknown>): boolean {
  return Boolean(value.assets && typeof value.assets === "object");
}

function statusOf(progress: Record<string, unknown>): string {
  return stringField(progress, "status") ?? "";
}

function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || "photo.jpg";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
  return cleaned || "photo.jpg";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function httpsField(record: Record<string, unknown>, key: string): string | null {
  const value = stringField(record, key);
  return value && isHttpsUrl(value) ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
