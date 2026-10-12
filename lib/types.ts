export type GenerationMode = "mock" | "live";

export type SplatVariant = {
  id: string;
  label: string;
  url: string;
};

export type PublicOperation = {
  operationId: string;
  mode: GenerationMode;
  done: boolean;
  failed: boolean;
  status: string;
  description: string;
  /** 0 to 1 when the server can estimate it. Null while a live job is running. */
  progress: number | null;
  displayName: string;
  error: string | null;
  worldId: string | null;
  marbleUrl: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  panoUrl: string | null;
  colliderMeshUrl: string | null;
  splatVariants: SplatVariant[];
  semantics: {
    metricScaleFactor: number;
    groundPlaneOffset: number;
  };
  /** marble: apply World Labs metric scale, ground offset, then 180° X. */
  coordinateFrame: "three" | "marble";
};

export type DownloadAsset = "splat" | "pano" | "thumbnail" | "collider";

export type AppConfig = {
  mode: GenerationMode;
  worldLabsConfigured: boolean;
  falEnabled: boolean;
  model: "marble-1.1";
  quotes: {
    nonPano: {
      totalCredits: number;
      usd: number;
      usdLabel: string;
      panoCredits: number;
      worldCredits: number;
    };
    pano: {
      totalCredits: number;
      usd: number;
      usdLabel: string;
      panoCredits: number;
      worldCredits: number;
    };
  };
  creditsPerDollar: number;
  pricingDocsUrl: string;
};
