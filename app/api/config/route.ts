import { falKey, generationMode, worldLabsKey } from "@/lib/env";
import { CREDITS_PER_DOLLAR, PRICING_DOCS_URL, WORLDLABS_MODEL, quoteMarbleGeneration } from "@/lib/pricing";
import type { AppConfig } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const nonPano = quoteMarbleGeneration("non-pano");
  const pano = quoteMarbleGeneration("pano");
  const multiImage = quoteMarbleGeneration("multi-image");
  const config: AppConfig = {
    mode: generationMode(),
    worldLabsConfigured: Boolean(worldLabsKey()),
    falEnabled: Boolean(falKey()),
    model: WORLDLABS_MODEL,
    quotes: {
      nonPano: publicQuote(nonPano),
      pano: publicQuote(pano),
      multiImage: publicQuote(multiImage),
    },
    creditsPerDollar: CREDITS_PER_DOLLAR,
    pricingDocsUrl: PRICING_DOCS_URL,
  };
  return Response.json(config);
}

function publicQuote(quote: ReturnType<typeof quoteMarbleGeneration>) {
  return {
    totalCredits: quote.totalCredits,
    usd: quote.usd,
    usdLabel: quote.usdLabel,
    panoCredits: quote.panoCredits,
    worldCredits: quote.worldCredits,
  };
}
