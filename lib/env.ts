import type { GenerationMode } from "./types";

export function worldLabsKey(): string | undefined {
  const key = process.env.WORLDLABS_API_KEY?.trim();
  return key ? key : undefined;
}

export function falKey(): string | undefined {
  const key = process.env.FAL_KEY?.trim();
  return key ? key : undefined;
}

export function forceMock(): boolean {
  const value = process.env.IMAGE_BLASTER_MOCK?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function generationMode(): GenerationMode {
  if (forceMock() || !worldLabsKey()) return "mock";
  return "live";
}
