export type GenerationMode = "mock" | "live";

export type SplatVariant = {
  id: string;
  label: string;
  url: string;
};

export type OperationChargeLine = {
  name: string;
  credits: number;
};

/** Settled World Labs charge from a completed operation. Null until the API returns cost. */
export type OperationCharge = {
  totalCredits: number;
  usd: number;
  usdLabel: string;
  lineItems: OperationChargeLine[];
};

export type PublicOperation = {
  operationId: string;
  mode: GenerationMode;
  done: boolean;
  failed: boolean;
  status: string;
  description: string;
  /** 0 to 1 when the server can estimate it. Live operations stay null: the API reports status text only. */
  progress: number | null;
  /** API display_name when it is non-empty. "" when the API omits it or returns a blank string. */
  displayName: string;
  error: string | null;
  cost: OperationCharge | null;
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
    multiImage: {
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
