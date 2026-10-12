import assert from "node:assert/strict";
import test from "node:test";
import { assetUrl, fetchOperation, operationTitle, splatVariants, startWorldGeneration, toPublicOperation, WORLDLABS_API } from "./worldlabs";

test("startWorldGeneration uploads then submits marble-1.1 without polling", async () => {
  const calls: { url: string; method: string; body?: string; headers: Headers }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method: init?.method ?? "GET", body, headers });

    if (url.endsWith("/media-assets:prepare_upload")) {
      return json({
        media_asset: { media_asset_id: "asset-1", file_name: "photo.jpg", kind: "image" },
        upload_info: {
          upload_url: "https://uploads.example/put",
          upload_method: "PUT",
          required_headers: { "x-goog-content-length-range": "0,1048576000" },
        },
      });
    }
    if (url === "https://uploads.example/put") {
      assert.equal(headers.get("x-goog-content-length-range"), "0,1048576000");
      assert.equal(headers.get("WLT-Api-Key"), null);
      return new Response(null, { status: 200 });
    }
    if (url.endsWith("/worlds:generate")) {
      return json({ operation_id: "op-123", done: false });
    }
    throw new Error(`unexpected ${url}`);
  };

  const operationId = await startWorldGeneration({
    apiKey: "secret-key",
    bytes: new Uint8Array([1, 2, 3]),
    fileName: "photo.jpg",
    extension: "jpg",
    displayName: "S".repeat(80),
    isPano: false,
    textPrompt: "A quiet studio",
    fetchImpl,
  });

  assert.equal(operationId, "op-123");
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.headers.get("WLT-Api-Key"), "secret-key");
  const generate = JSON.parse(calls[2]?.body ?? "{}") as {
    display_name: string;
    model: string;
    world_prompt: { type: string; is_pano: boolean; image_prompt: { source: string; media_asset_id: string } };
  };
  assert.equal(generate.display_name, "S".repeat(64));
  assert.equal(generate.model, "marble-1.1");
  assert.equal(generate.world_prompt.type, "image");
  assert.equal(typeof generate.world_prompt.is_pano, "boolean");
  assert.equal(generate.world_prompt.is_pano, false);
  assert.equal(generate.world_prompt.image_prompt.source, "media_asset");
  assert.equal(generate.world_prompt.image_prompt.media_asset_id, "asset-1");
  assert.equal(calls.some((call) => call.url.includes("/operations/")), false);
});

test("fetchOperation polls GET /operations/{id} and reads splat urls", async () => {
  let requested = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    requested = String(input);
    assert.equal(new Headers(init?.headers).get("WLT-Api-Key"), "secret-key");
    return json({
      operation_id: "op-123",
      done: true,
      metadata: {
        progress: { status: "SUCCEEDED", description: "World generation completed successfully" },
        world_id: "world-9",
      },
      cost: {
        total_credits: 1580,
        line_items: [
          { name: "pano", credits: 80 },
          { name: "world", credits: 1500 },
          { name: "ignored", credits: 1.5 },
        ],
      },
      response: {
        id: "world-from-id",
        world_id: "world-9",
        display_name: "",
        world_marble_url: "https://marble.worldlabs.ai/world/world-9",
        assets: {
          caption: "A studio",
          thumbnail_url: "https://cdn.example/thumb.jpg",
          splats: {
            spz_urls: {
              full_res: "https://cdn.example/full.spz",
              "500k": "https://cdn.example/500k.spz",
              "150k": "https://cdn.example/150k.spz",
              "100k": "https://cdn.example/100k.spz",
            },
            semantics_metadata: { metric_scale_factor: 1.23, ground_plane_offset: 0.42 },
          },
          mesh: { collider_mesh_url: "https://cdn.example/collider.glb" },
          imagery: { pano_url: "https://cdn.example/pano.png" },
        },
      },
    });
  };

  const operation = await fetchOperation("secret-key", "op-123", fetchImpl);
  assert.equal(requested, `${WORLDLABS_API}/operations/op-123`);
  assert.equal(operation.done, true);
  assert.equal(operation.progress, null);
  assert.equal(operation.worldId, "world-9");
  assert.equal(operation.displayName, "");
  assert.equal(operationTitle({ sentName: "Studio", displayName: operation.displayName, caption: operation.caption }), "Studio");
  assert.equal(operationTitle({ displayName: operation.displayName, caption: operation.caption }), "A studio");
  assert.equal(operation.cost?.totalCredits, 1580);
  assert.equal(operation.cost?.usd, 1.26);
  assert.equal(operation.cost?.usdLabel, "$1.26");
  assert.deepEqual(operation.cost?.lineItems, [
    { name: "pano", credits: 80 },
    { name: "world", credits: 1500 },
  ]);
  assert.equal(operation.coordinateFrame, "marble");
  assert.equal(operation.semantics.metricScaleFactor, 1.23);
  assert.equal(operation.semantics.groundPlaneOffset, 0.42);
  assert.deepEqual(
    operation.splatVariants.map((variant) => variant.id),
    ["100k", "150k", "500k", "full_res"],
  );
  assert.equal(operation.splatVariants.find((variant) => variant.id === "150k")?.label, "150k splats");
  assert.equal(assetUrl(operation, "splat", "500k"), "https://cdn.example/500k.spz");
  assert.equal(assetUrl(operation, "splat"), "https://cdn.example/100k.spz");
});

test("multi-image auto layout uploads each photo and omits azimuth", async () => {
  let prepares = 0;
  const calls: { url: string; body?: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, body });
    if (url.endsWith("/media-assets:prepare_upload")) {
      prepares += 1;
      return json({
        media_asset: { media_asset_id: `asset-${prepares}` },
        upload_info: {
          upload_url: `https://uploads.example/put-${prepares}`,
          upload_method: "PUT",
          required_headers: {},
        },
      });
    }
    if (url.startsWith("https://uploads.example/put-")) {
      assert.equal(headers.get("WLT-Api-Key"), null);
      return new Response(null, { status: 200 });
    }
    if (url.endsWith("/worlds:generate")) return json({ operation_id: "op-multi" });
    throw new Error(`unexpected ${url}`);
  };

  const operationId = await startWorldGeneration({
    apiKey: "secret-key",
    images: [
      { bytes: new Uint8Array([1]), fileName: "front.jpg", extension: "jpg" },
      { bytes: new Uint8Array([2]), fileName: "side.jpg", extension: "jpg" },
    ],
    displayName: "Room",
    isPano: false,
    textPrompt: "A quiet room",
    fetchImpl,
  });

  assert.equal(operationId, "op-multi");
  assert.equal(calls.length, 5);
  const generate = JSON.parse(calls.find((call) => call.url.endsWith("/worlds:generate"))?.body ?? "{}") as {
    model: string;
    world_prompt: {
      type: string;
      reconstruct_images: boolean;
      is_pano?: unknown;
      text_prompt?: string;
      multi_image_prompt: { azimuth?: number; content: { source: string; media_asset_id: string } }[];
    };
  };
  assert.equal(generate.model, "marble-1.1");
  assert.equal(generate.world_prompt.type, "multi-image");
  assert.equal(typeof generate.world_prompt.reconstruct_images, "boolean");
  assert.equal(generate.world_prompt.reconstruct_images, true);
  assert.equal("is_pano" in generate.world_prompt, false);
  assert.equal(generate.world_prompt.text_prompt, "A quiet room");
  assert.deepEqual(generate.world_prompt.multi_image_prompt, [
    { content: { source: "media_asset", media_asset_id: "asset-1" } },
    { content: { source: "media_asset", media_asset_id: "asset-2" } },
  ]);
  assert.equal(calls.some((call) => call.url.includes("/operations/")), false);
});

test("nine images and a panorama mixed with photos are refused before upload", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("should not call World Labs");
  };
  const images = Array.from({ length: 9 }, (_, index) => ({
    bytes: new Uint8Array([index]),
    fileName: `photo-${index}.jpg`,
    extension: "jpg",
  }));
  await assert.rejects(
    () => startWorldGeneration({ apiKey: "secret-key", images, displayName: "Room", isPano: false, fetchImpl }),
    /8 photos/,
  );
  await assert.rejects(
    () => startWorldGeneration({
      apiKey: "secret-key",
      images: images.slice(0, 2),
      displayName: "Room",
      isPano: true,
      fetchImpl,
    }),
    /panorama/,
  );
});

test("is_pano true is sent as a boolean", async () => {
  let isPano: unknown;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/media-assets:prepare_upload")) {
      return json({
        media_asset: { media_asset_id: "asset-1" },
        upload_info: { upload_url: "https://uploads.example/put", upload_method: "PUT", required_headers: {} },
      });
    }
    if (url === "https://uploads.example/put") return new Response(null, { status: 200 });
    if (url.endsWith("/worlds:generate")) {
      isPano = (JSON.parse(String(init?.body)) as { world_prompt: { is_pano: unknown } }).world_prompt.is_pano;
      return json({ operation_id: "op-pano" });
    }
    throw new Error(`unexpected ${url}`);
  };

  await startWorldGeneration({
    apiKey: "secret-key",
    bytes: new Uint8Array([1]),
    fileName: "pano.jpg",
    extension: "jpg",
    displayName: "Pano",
    isPano: true,
    fetchImpl,
  });
  assert.equal(isPano, true);
});

test("world id prefers world_id, then id, then metadata", () => {
  const preferred = toPublicOperation("op", {
    done: true,
    response: { world_id: "from-world-id", id: "from-id", display_name: "Named", assets: {} },
  });
  assert.equal(preferred.worldId, "from-world-id");
  assert.equal(preferred.displayName, "Named");

  const legacy = toPublicOperation("op", { done: true, response: { id: "legacy-id", assets: {} } });
  assert.equal(legacy.worldId, "legacy-id");

  const nested = toPublicOperation("op", {
    done: true,
    response: { world: { world_id: "nested-id", id: "nested-legacy", display_name: "Nested", assets: {} } },
  });
  assert.equal(nested.worldId, "nested-id");
  assert.equal(nested.displayName, "Nested");

  const fromMetadata = toPublicOperation("op", {
    done: false,
    metadata: { world_id: "meta-id" },
    response: {},
  });
  assert.equal(fromMetadata.worldId, "meta-id");
  assert.equal(fromMetadata.cost, null);
});

test("a blank title falls back to World when name and caption are empty", () => {
  assert.equal(operationTitle({ sentName: "  ", displayName: "", caption: "" }), "World");
});

test("in-progress operations do not invent a percentage", () => {
  const operation = toPublicOperation("op-1", {
    operation_id: "op-1",
    done: false,
    metadata: { progress: { status: "IN_PROGRESS", description: "World generation in progress" } },
    response: null,
  });
  assert.equal(operation.done, false);
  assert.equal(operation.progress, null);
  assert.equal(operation.description, "World generation in progress");
  assert.equal(operation.splatVariants.length, 0);
});

test("splat variants drop non-https urls", () => {
  assert.deepEqual(splatVariants({ "100k": "http://insecure/a.spz", "500k": "https://cdn.example/a.spz" }), [
    { id: "500k", label: "500k splats", url: "https://cdn.example/a.spz" },
  ]);
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
