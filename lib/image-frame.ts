export type PixelSize = {
  width: number;
  height: number;
};

/**
 * One output frame for every photo in an auto-layout set.
 * The first photo sets the aspect ratio. The long edge is capped and never upscaled.
 * Photos whose aspect differs by more than 1% are marked cropped; the canvas center-crops them.
 */
export function sharedFrame(sources: PixelSize[], maxEdge = 1920): PixelSize & { cropped: boolean } {
  const first = sources[0];
  if (!first || first.width < 1 || first.height < 1) {
    throw new Error("Could not read that image.");
  }
  const aspect = first.width / first.height;
  const cropped = sources.some((source) => {
    if (source.width < 1 || source.height < 1) return true;
    return Math.abs(source.width / source.height - aspect) / aspect > 0.01;
  });
  const longEdge = Math.min(maxEdge, Math.max(first.width, first.height));
  let width: number;
  let height: number;
  if (first.width >= first.height) {
    width = longEdge;
    height = Math.max(1, Math.round(width / aspect));
  } else {
    height = longEdge;
    width = Math.max(1, Math.round(height * aspect));
  }
  if (Math.max(width, height) > maxEdge) {
    const scale = maxEdge / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }
  return { width, height, cropped };
}

export function framesMatch(sizes: PixelSize[]): boolean {
  const first = sizes[0];
  if (!first) return false;
  return sizes.every((size) => size.width === first.width && size.height === first.height && size.width > 0 && size.height > 0);
}
