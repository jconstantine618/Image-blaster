import type { PublicOperation } from "./types";

export const MOCK_SPLAT_PATH = "/mock/courtyard.splat";
export const MOCK_DURATION_MS = 8000;

const STAGES = [
  { until: 0.15, description: "Uploading the photograph" },
  { until: 0.4, description: "Generating a panorama from the image" },
  { until: 0.78, description: "Generating the Gaussian splat with marble-1.1" },
  { until: 0.97, description: "Packing splat assets" },
] as const;

export function createMockOperationId(now = Date.now(), nonce = randomNonce()): string {
  return `mock_${now.toString(36)}_${nonce}`;
}

export function mockStartedAt(operationId: string): number | null {
  const match = /^mock_([0-9a-z]+)_([0-9a-z]+)$/.exec(operationId);
  if (!match) return null;
  const started = Number.parseInt(match[1], 36);
  if (!Number.isFinite(started)) return null;
  if (started < 1_600_000_000_000 || started > Date.now() + 5 * 60_000) return null;
  return started;
}

export function mockOperation(operationId: string, now = Date.now()): PublicOperation | null {
  const started = mockStartedAt(operationId);
  if (started === null) return null;

  const elapsed = Math.max(0, now - started);
  const fraction = Math.min(1, elapsed / MOCK_DURATION_MS);
  const done = fraction >= 1;
  const stage = STAGES.find((item) => fraction < item.until);

  return {
    operationId,
    mode: "mock",
    done,
    failed: false,
    status: done ? "SUCCEEDED" : "IN_PROGRESS",
    description: done
      ? "Mock world ready. No World Labs credits were spent."
      : (stage?.description ?? "Finishing the mock world"),
    progress: fraction,
    displayName: "Courtyard study",
    error: null,
    worldId: null,
    marbleUrl: null,
    caption: "A stone room opening onto a small garden. Built-in mock splat, not a World Labs generation.",
    thumbnailUrl: "/samples/courtyard.png",
    panoUrl: null,
    colliderMeshUrl: null,
    splatVariants: done
      ? [{ id: "preview", label: "Preview splat", url: MOCK_SPLAT_PATH }]
      : [],
    semantics: { metricScaleFactor: 1, groundPlaneOffset: 0 },
    coordinateFrame: "three",
  };
}

function randomNonce(): string {
  return Math.random().toString(36).slice(2, 10);
}
