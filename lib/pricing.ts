/**
 * World Labs API pricing for marble-1.1.
 * Source: https://docs.worldlabs.ai/api/pricing
 *
 * Standard models bill 1,500 credits for world generation.
 * A non-panorama image also bills 80 credits to generate the panorama first.
 * Credits are sold at $1.00 per 1,250 credits.
 * 1,580 / 1,250 = $1.264, shown as $1.26.
 */

export const WORLDLABS_MODEL = "marble-1.1" as const;

export const CREDITS_PER_DOLLAR = 1250;

export const PRICING_DOCS_URL = "https://docs.worldlabs.ai/api/pricing";

export type ImageKind = "non-pano" | "pano";

export type GenerationQuote = {
  model: typeof WORLDLABS_MODEL;
  imageKind: ImageKind;
  panoCredits: number;
  worldCredits: number;
  totalCredits: number;
  usd: number;
  usdLabel: string;
};

const PANO_CREDITS: Record<ImageKind, number> = {
  pano: 0,
  "non-pano": 80,
};

const WORLD_CREDITS = 1500;

export function quoteMarbleGeneration(imageKind: ImageKind): GenerationQuote {
  const panoCredits = PANO_CREDITS[imageKind];
  const totalCredits = panoCredits + WORLD_CREDITS;
  const usd = roundUsd(totalCredits / CREDITS_PER_DOLLAR);
  return {
    model: WORLDLABS_MODEL,
    imageKind,
    panoCredits,
    worldCredits: WORLD_CREDITS,
    totalCredits,
    usd,
    usdLabel: formatUsd(usd),
  };
}

export function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}
