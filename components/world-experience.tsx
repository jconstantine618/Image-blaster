"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { preferredSplat } from "@/lib/worldlabs";
import { loadSession, sourceImageFor, type StoredSession } from "@/lib/session";
import type { PublicOperation } from "@/lib/types";
import { watchExtras, type ExtraState } from "@/components/extras";
import { SplatStage, type StageObject } from "@/components/splat-stage";

export function WorldExperience({ operationId }: { operationId: string }) {
  const [operation, setOperation] = useState<PublicOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [splatReady, setSplatReady] = useState(false);
  const [splatError, setSplatError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [extras, setExtras] = useState<ExtraState | null>(null);

  useEffect(() => {
    setSession(loadSession(operationId));
    let stopped = false;
    let timer = 0;

    const poll = async () => {
      const response = await fetch(`/api/operations/${operationId}`, { cache: "no-store" });
      const payload = (await response.json()) as PublicOperation & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not read generation progress.");
      if (stopped) return;
      setOperation(payload);
      if (!payload.done && !payload.failed) timer = window.setTimeout(() => void poll().catch(fail), 2500);
    };
    const fail = (cause: unknown) => {
      if (!stopped) setError(cause instanceof Error ? cause.message : "Could not read generation progress.");
    };
    void poll().catch(fail);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [operationId]);

  useEffect(() => {
    const stored = loadSession(operationId);
    const image = sourceImageFor(operationId);
    if (!stored?.extras || !image) return;
    return watchExtras(operationId, stored.extras, image, setExtras);
  }, [operationId]);

  const title = session?.displayName || operation?.displayName || "World";
  const variant = operation?.splatVariants.find((item) => item.id === variantId) ?? (operation ? preferredSplat(operation.splatVariants) : null);
  const showViewer = Boolean(operation?.done && variant && !splatError);
  const objects: StageObject[] = (extras?.objects ?? [])
    .filter((object) => object.glbUrl)
    .map((object) => ({ id: object.id, name: object.name, url: object.glbUrl as string }));

  return (
    <main className="world-page">
      {showViewer && variant ? (
        <SplatStage
          splatUrl={variant.url}
          coordinateFrame={operation?.coordinateFrame ?? "three"}
          metricScaleFactor={operation?.semantics.metricScaleFactor ?? 1}
          groundPlaneOffset={operation?.semantics.groundPlaneOffset ?? 0}
          objects={objects}
          onReady={() => setSplatReady(true)}
          onError={setSplatError}
        />
      ) : null}

      {!showViewer || !splatReady ? (
        <div className="veil">
          <div>
            <p className="mode-pill"><i />{operation?.mode === "live" ? "World Labs" : "Mock mode"}</p>
            <h2>{operation?.failed ? "Generation failed" : operation?.done ? "Opening the world" : "Building the world"}</h2>
            <p>{error || splatError || operation?.description || "Contacting the server…"}</p>
            {operation && !operation.done && !operation.failed ? (
              <div className="bar" aria-hidden>
                <span style={{ width: operation.progress === null ? "35%" : `${Math.round(operation.progress * 100)}%` }} />
              </div>
            ) : null}
            {operation?.mode === "live" && !operation.done ? <p>Marble usually takes about five minutes. This page keeps polling the operation.</p> : null}
            {session?.previewUrl ? <img src={session.previewUrl} alt="" style={{ width: 180, height: 120, objectFit: "cover", borderRadius: 12, marginTop: 12 }} /> : null}
            <div className="row" style={{ justifyContent: "center" }}>
              <Link href="/" className="ghost">Back</Link>
            </div>
          </div>
        </div>
      ) : null}

      {showViewer ? (
        <>
          <div className="hud">
            <div className="chip">
              <h2>{title}</h2>
              <p>{operation?.caption || (operation?.mode === "mock" ? "Built-in courtyard. No credits spent." : operation?.description)}</p>
            </div>
            <div className="menu">
              {operation?.splatVariants.map((item) => (
                <button key={item.id} type="button" onClick={() => { setVariantId(item.id); setSplatReady(false); setSplatError(null); }}>
                  {item.label}
                </button>
              ))}
              {variant ? (
                <a href={`/api/operations/${operationId}/download?asset=splat&variant=${encodeURIComponent(variant.id)}`}>
                  Download splat
                </a>
              ) : null}
              {operation?.panoUrl ? <a href={`/api/operations/${operationId}/download?asset=pano`}>Panorama</a> : null}
              {operation?.colliderMeshUrl ? <a href={`/api/operations/${operationId}/download?asset=collider`}>Collider</a> : null}
              {operation?.marbleUrl ? <a href={operation.marbleUrl}>Open in Marble</a> : null}
              <Link href="/">New photo</Link>
            </div>
          </div>
          {extras ? <ExtrasPanel extras={extras} /> : null}
        </>
      ) : null}
    </main>
  );
}

function ExtrasPanel({ extras }: { extras: ExtraState }) {
  return (
    <aside className="side">
      <h3>Objects and sound</h3>
      {extras.error ? <p>{extras.error}</p> : null}
      {extras.ambient ? (
        <p>
          Ambience: {extras.ambient.detail}
          {extras.ambient.audioUrl ? <audio src={extras.ambient.audioUrl} controls loop /> : null}
        </p>
      ) : null}
      {extras.objects.map((object) => (
        <div key={object.id} style={{ marginTop: 10 }}>
          <strong>{object.name}</strong>
          <p>{object.detail}</p>
          {object.glbUrl ? <a href={object.glbUrl}>Download mesh</a> : null}
          {object.audioUrl ? <audio src={object.audioUrl} controls /> : null}
        </div>
      ))}
    </aside>
  );
}
