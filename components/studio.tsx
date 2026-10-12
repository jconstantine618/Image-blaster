"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { sharedFrame } from "@/lib/image-frame";
import { MAX_WORLD_IMAGES } from "@/lib/images";
import { prepareImages } from "@/lib/prepare-image";
import { quoteMarbleGeneration } from "@/lib/pricing";
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
    multiImage: publicQuote(quoteMarbleGeneration("multi-image")),
  },
  creditsPerDollar: 1250,
  pricingDocsUrl: "https://docs.worldlabs.ai/api/pricing",
};

type Photo = {
  id: string;
  file: File;
  previewUrl: string;
};

export function Studio() {
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig>(fallbackConfig);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [frameCropped, setFrameCropped] = useState(false);
  const [displayName, setDisplayName] = useState("Untitled world");
  const [textPrompt, setTextPrompt] = useState("");
  const [isPano, setIsPano] = useState(false);
  const [hot, setHot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extrasOn, setExtrasOn] = useState(false);
  const [ambientPrompt, setAmbientPrompt] = useState("");
  const [objects, setObjects] = useState<StoredObjectRequest[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/config");
      if (!response.ok) return;
      setConfig((await response.json()) as AppConfig);
    };
    void load().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (photos.length < 2) {
      setFrameCropped(false);
      return;
    }
    let cancelled = false;
    void Promise.all(photos.map((photo) => createImageBitmap(photo.file)))
      .then((bitmaps) => {
        const frame = sharedFrame(bitmaps.map((bitmap) => ({ width: bitmap.width, height: bitmap.height })));
        for (const bitmap of bitmaps) bitmap.close();
        if (!cancelled) setFrameCropped(frame.cropped);
      })
      .catch(() => {
        if (!cancelled) setFrameCropped(false);
      });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  const quote = photos.length > 1 ? config.quotes.multiImage : isPano ? config.quotes.pano : config.quotes.nonPano;
  const mock = config.mode === "mock";
  const quoteDetail = useMemo(() => {
    const panoPart = quote.panoCredits === 0
      ? "no panorama charge"
      : photos.length > 1
        ? `${quote.panoCredits} multi-image panorama credits`
        : `${quote.panoCredits} panorama credits`;
    return `${quote.worldCredits.toLocaleString()} world credits + ${panoPart} = ${quote.totalCredits.toLocaleString()} credits. At $1 per ${config.creditsPerDollar.toLocaleString()} credits, about ${quote.usdLabel}.`;
  }, [config.creditsPerDollar, photos.length, quote]);

  function addFiles(incoming: File[]) {
    const images = incoming.filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name));
    if (images.length === 0) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (isPano) {
      setError(images.length > 1 ? "A 360° panorama is one image, so only the first photo was kept." : null);
      replacePhotos([images[0]]);
      return;
    }
    const room = MAX_WORLD_IMAGES - photos.length;
    if (room <= 0) {
      setError("Auto layout accepts up to 8 photos of the same space.");
      return;
    }
    const accepted = images.slice(0, room);
    setError(accepted.length < images.length ? "Auto layout accepts up to 8 photos. Extra shots were left out." : null);
    if (photos.length === 0) {
      const stem = stemOf(accepted[0]);
      if (stem) setDisplayName(stem);
    }
    setPhotos((current) => [...current, ...accepted.map(toPhoto)]);
  }

  function replacePhotos(files: File[]) {
    setPhotos((current) => {
      for (const photo of current) URL.revokeObjectURL(photo.previewUrl);
      return files.map(toPhoto);
    });
    const stem = files[0] ? stemOf(files[0]) : "";
    if (stem) setDisplayName(stem);
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== id);
    });
    setError(null);
  }

  async function useSample() {
    const response = await fetch("/samples/courtyard.png");
    const blob = await response.blob();
    replacePhotos([new File([blob], "courtyard.png", { type: "image/png" })]);
    setError(null);
  }

  async function generate() {
    if (photos.length === 0) {
      setError("Add a photograph first.");
      return;
    }
    if (isPano && photos.length > 1) {
      setError("A 360° panorama can't be combined with other images.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareImages(photos.map((photo) => photo.file));
      const first = prepared.images[0];
      if (!first?.dataUrl) throw new Error("Could not read that image.");
      const body = new FormData();
      prepared.images.forEach((image, index) => {
        body.append("image", new File([image.blob], `photo-${index + 1}.jpg`, { type: "image/jpeg" }));
      });
      body.set("displayName", displayName.trim() || "Untitled world");
      body.set("isPano", isPano && photos.length === 1 ? "true" : "false");
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
      rememberSourceImage(payload.operationId, first.dataUrl);
      saveSession(payload.operationId, {
        displayName: displayName.trim() || "Untitled world",
        isPano: isPano && photos.length === 1,
        usdLabel: quote.usdLabel,
        previewUrl: first.previewUrl,
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
          Photographs go in. An explorable Gaussian-splat world comes out, generated with World Labs marble-1.1.
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
              addFiles(Array.from(event.dataTransfer.files ?? []));
            }}
          >
            {photos.length === 1 ? (
              <div className="solo">
                <img src={photos[0].previewUrl} alt="Selected photograph" />
                <button className="thumb-remove" type="button" onClick={() => removePhoto(photos[0].id)}>Remove</button>
              </div>
            ) : photos.length > 1 ? (
              <div className="thumbs">
                {photos.map((photo, index) => (
                  <div className="thumb" key={photo.id}>
                    <img src={photo.previewUrl} alt={`Photograph ${index + 1}`} />
                    <button className="thumb-remove" type="button" aria-label={`Remove photograph ${index + 1}`} onClick={() => removePhoto(photo.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <strong>Drop photographs</strong>
                <p>One photo, or up to 8 of the same space. JPEG, PNG, or WebP.</p>
              </div>
            )}
            <input
              ref={fileRef}
              className={photos.length === 0 ? "file-input" : "file-input parked"}
              aria-label="Photographs"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple={!isPano}
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </div>
          <p className="note">
            {isPano
              ? "A 360° panorama stands alone. It can't be combined with other photos."
              : "Up to 8 overlapping shots of the same space work best: stand in about the same spot, keep some overlap, and use good, consistent light. Auto layout places them."}
          </p>
          {photos.length > 1 ? (
            <p className="note">
              {frameCropped
                ? "These photos differ in shape, so they'll be cropped to the first photo's frame. Auto layout needs one shared resolution and aspect ratio."
                : "These photos will be resized to one shared resolution before auto layout."}
            </p>
          ) : null}
          <div className="row">
            <button className="ghost" type="button" onClick={() => void useSample()}>Use the courtyard sample</button>
            <button
              className="ghost"
              type="button"
              disabled={isPano ? photos.length >= 1 : photos.length >= MAX_WORLD_IMAGES}
              onClick={() => fileRef.current?.click()}
            >
              Add photos
            </button>
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
            <input
              type="checkbox"
              checked={isPano}
              disabled={photos.length > 1}
              onChange={(event) => setIsPano(event.target.checked)}
            />
            <span>This is a 360° equirectangular panorama. A panorama is one image and can't be combined with other photos. Ordinary photos stay on the non-panorama price.</span>
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
            <li><b>1</b><p>Upload one photo, or up to 8 overlapping shots from about the same spot. The server prepares a World Labs media asset for each.</p></li>
            <li><b>2</b><p>Generation returns an operation id immediately. The page polls it instead of holding one long request.</p></li>
            <li><b>3</b><p>Walk the splat in the browser and download the .spz, or the mock .splat when no key is set.</p></li>
          </ol>
          <button className="primary" type="button" disabled={busy || photos.length === 0} onClick={() => void generate()} style={{ marginTop: 16, width: "100%" }}>
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

function toPhoto(file: File): Photo {
  return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) };
}

function stemOf(file: File): string {
  return file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
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
