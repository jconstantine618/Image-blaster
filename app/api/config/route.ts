import { falKey, generationMode, worldLabsKey } from "@/lib/env";
import { CREDITS_PER_DOLLAR, PRICING_DOCS_URL, WORLDLABS_MODEL, quoteMarbleGeneration } from "@/lib/pricing";
import type { AppConfig } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const nonPano = quoteMarbleGeneration("non-pano");
  const pano = quoteMarbleGeneration("pano");
  const config: AppConfig = {
    mode: generationMode(),
    worldLabsConfigured: Boolean(worldLabsKey()),
    falEnabled: Boolean(falKey()),
    model: WORLDLABS_MODEL,
    quotes: {
      nonPano: {
        totalCredits: nonPano.totalCredits,
        usd: nonPano.usd,
        usdLabel: nonPano.usdLabel,
        panoCredits: nonPano.panoCredits,
        worldCredits: nonPano.worldCredits,
      },
      pano: {
        totalCredits: pano.totalCredits,
        usd: pano.usd,
        usdLabel: pano.usdLabel,
        panoCredits: pano.panoCredits,
        worldCredits: pano.worldCredits,
      },
    },
    creditsPerDollar: CREDITS_PER_DOLLAR,
    pricingDocsUrl: PRICING_DOCS_URL,
  };
  return Response.json(config);
}
