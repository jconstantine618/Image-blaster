"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { quoteMarbleGeneration } from "@/lib/pricing";
import { prepareImage } from "@/lib/prepare-image";
import { rememberSourceImage, saveSession, type StoredObjectRequest } from "@/lib/session";
import type { AppConfig } from "@/lib/types";

const fallbackConfig: AppConfig = {
  mode: "mock",
  worldLabsConfigured: false,
  falEnabled: false,
  model: "marble-1.1",
  quotes: {
    nonPano: publicQuote(quoteMarbleGeneration("non-pano")),
    pano: publicQuote(quoteMarbleGeneration("pano")),
  },
  creditsPerDollar: 1250,
  pricingDocsUrl: "https://docs.worldlabs.ai/api/pricing",
};

export function Studio() {
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig>(fallbackConfig);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Untitled world");
  const [textPrompt, setTextPrompt] = useState("");
  const [isPano, setIsPano] = useState(false);
  const [hot, setHot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extrasOn, setExtrasOn] = useState(false);
  const [ambientPrompt, setAmbientPrompt] = useState("");
  const [objects, setObjects] = useState<StoredObjectRequest[]>([]);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/config");
      if (!response.ok) return;
      setConfig((await response.json()) as AppConfig);
    };
    void load().catch(() => undefined);
  }, []);

  const quote = isPano ? config.quotes.pano : config.quotes.nonPano;
  const mock = config.mode === "mock";
  const quoteDetail = useMemo(() => {
    const panoPart = quote.panoCredits === 0 ? "no panorama charge" : `${quote.panoCredits} panorama credits`;
    return `${quote.worldCredits.toLocaleString()} world credits + ${panoPart} = ${quote.totalCredits.toLocaleString()} credits. At $1 per ${config.creditsPerDollar.toLocaleString()} credits, about ${quote.usdLabel}.`;
  }, [config.creditsPerDollar, quote]);

  function takeFile(next: File | null) {
    if (!next) return;
    setFile(next);
    setError(null);
    const stem = next.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    if (stem) setDisplayName(stem);
    const url = URL.createObjectURL(next);
    setPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return url;
    });
  }

  async function useSample() {
    const response = await fetch("/samples/courtyard.png");
    const blob = await response.blob();
    takeFile(new File([blob], "courtyard.png", { type: "image/png" }));
  }

  async function generate() {
    if (!file) {
      setError("Add a photograph first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareImage(file);
      const body = new FormData();
      body.set("image", new File([prepared.blob], "photo.jpg", { type: "image/jpeg" }));
      body.set("displayName", displayName.trim() || "Untitled world");
      body.set("isPano", isPano ? "true" : "false");
      body.set("textPrompt", textPrompt.trim());
      const response = await fetch("/api/generations", { method: "POST", body });
      const payload = (await response.json()) as { operationId?: string; error?: string };
      if (!response.ok || !payload.operationId) throw new Error(payload.error || "Could not start generation.");

      const extras = extrasOn && config.falEnabled
        ? {
            ambientPrompt: ambientPrompt.trim(),
            objects: objects.filter((object) => object.name.trim()),
          }
        : undefined;
      if (extras && !extras.ambientPrompt && extras.objects.length === 0) {
        throw new Error("Add an ambient prompt or at least one object, or leave objects and sound off.");
      }
      rememberSourceImage(payload.operationId, prepared.dataUrl);
      saveSession(payload.operationId, {
        displayName: displayName.trim() || "Untitled world",
        isPano,
        usdLabel: quote.usdLabel,
        previewUrl: prepared.previewUrl,
        extras,
      });
      router.push(`/world/${payload.operationId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start generation.");
      setBusy(false);
    }
  }

  return (
    <main className="studio">
      <header className="topbar">
        <div className="mark">
          <small>John Constantine</small>
          <h1>Image Blaster</h1>
        </div>
        <p className="lede">
          A photograph goes in. An explorable Gaussian-splat world comes out, generated with World Labs marble-1.1.
        </p>
      </header>

      <div className="layout">
        <section className="panel">
          <div
            className={hot ? "drop hot" : "drop"}
            onDragOver={(event) => {
              event.preventDefault();
              setHot(true);
            }}
            onDragLeave={() => setHot(false)}
            onDrop={(event) => {
              event.preventDefault();
              setHot(false);
              takeFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            {preview ? <img src={preview} alt="Selected photograph" /> : (
              <div>
                <strong>Drop a photograph</strong>
                <p>JPEG, PNG, or WebP. It is compressed before upload.</p>
              </div>
            )}
            <input
              className="file-input"
              aria-label="Photograph"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => takeFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="row">
            <button className="ghost" type="button" onClick={() => void useSample()}>Use the courtyard sample</button>
          </div>
          <label className="field">
            <span>World name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={64} />
          </label>
          <label className="field">
            <span>Optional note for World Labs</span>
            <textarea
              value={textPrompt}
              maxLength={2000}
              placeholder="Warm afternoon light, stone floor, a tree beyond the door"
              onChange={(event) => setTextPrompt(event.target.value)}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={isPano} onChange={(event) => setIsPano(event.target.checked)} />
            <span>This is a 360° equirectangular panorama. Ordinary photos stay on the non-panorama price.</span>
          </label>

          <div className="object-card">
            <label className="check" style={{ marginTop: 0 }}>
              <input
                type="checkbox"
                checked={extrasOn && config.falEnabled}
                disabled={!config.falEnabled}
                onChange={(event) => setExtrasOn(event.target.checked)}
              />
              <span>Also generate objects and sound with FAL</span>
            </label>
            <p className="note">
              {config.falEnabled
                ? "Off unless you check this. Each object is a Nano Banana isolation edit, a Hunyuan 3D mesh (50k faces, PBR), and a short ElevenLabs sound. FAL bills those separately."
                : "Objects and sound stay off until FAL_KEY is set. World generation does not need it."}
            </p>
            {extrasOn && config.falEnabled ? (
              <>
                <label className="field">
                  <span>Ambient sound</span>
                  <textarea value={ambientPrompt} onChange={(event) => setAmbientPrompt(event.target.value)} placeholder="Soft wind through a courtyard and distant birds" />
                </label>
                {objects.map((object) => (
                  <div className="object-card" key={object.id}>
                    <label className="field">
                      <span>Object name</span>
                      <input
                        value={object.name}
                        onChange={(event) => updateObject(object.id, { name: event.target.value })}
                        placeholder="clay pot"
                      />
                    </label>
                    <label className="field">
                      <span>What it looks like</span>
                      <input
                        value={object.description}
                        onChange={(event) => updateObject(object.id, { description: event.target.value })}
                        placeholder="A round terracotta pot with a chipped rim"
                      />
                    </label>
                    <button className="texty" type="button" onClick={() => setObjects((current) => current.filter((item) => item.id !== object.id))}>Remove</button>
                  </div>
                ))}
                <div className="row">
                  <button
                    className="ghost"
                    type="button"
                    disabled={objects.length >= 3}
                    onClick={() => setObjects((current) => [...current, { id: crypto.randomUUID(), name: "", description: "" }])}
                  >
                    Add object
                  </button>
                </div>
              </>
            ) : null}
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
        </section>

        <aside>
          <div className="ticket">
            <div className="kicker">Estimated cost before generation</div>
            <div className="price">{quote.usdLabel}</div>
            <p>{quoteDetail}</p>
            <p>
              Model <strong>marble-1.1</strong>.{" "}
              <a href={config.pricingDocsUrl}>World Labs pricing</a>. API credits come from platform.worldlabs.ai, not the Marble app.
            </p>
            <p className="mode-pill" style={{ color: "var(--cream)", borderColor: "rgba(247,241,231,0.25)" }}>
              <i />
              {mock ? "Mock mode — this run spends nothing" : "Live World Labs — this run spends credits"}
            </p>
          </div>
          <ol className="steps">
            <li><b>1</b><p>Upload a still. The server prepares a World Labs media asset and uploads the bytes.</p></li>
            <li><b>2</b><p>Generation returns an operation id immediately. The page polls it instead of holding one long request.</p></li>
            <li><b>3</b><p>Walk the splat in the browser and download the .spz, or the mock .splat when no key is set.</p></li>
          </ol>
          <button className="primary" type="button" disabled={busy || !file} onClick={() => void generate()} style={{ marginTop: 16, width: "100%" }}>
            {busy ? "Starting…" : mock ? `Preview mock world · ${quote.usdLabel} if this were live` : `Generate world · ${quote.usdLabel}`}
          </button>
        </aside>
      </div>
      <p className="footer-note">
        Adapted from <a href="https://github.com/neilsonnn/image-blaster">neilsonnn/image-blaster</a> (MIT). The Claude Code runner is not part of this app.
      </p>
    </main>
  );

  function updateObject(id: string, patch: Partial<StoredObjectRequest>) {
    setObjects((current) => current.map((object) => (object.id === id ? { ...object, ...patch } : object)));
  }
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
