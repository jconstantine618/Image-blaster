import assert from "node:assert/strict";
import test from "node:test";
import { assetUrl, fetchOperation, splatVariants, startWorldGeneration, toPublicOperation, WORLDLABS_API } from "./worldlabs";

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
    displayName: "Studio",
    isPano: false,
    textPrompt: "A quiet studio",
    fetchImpl,
  });

  assert.equal(operationId, "op-123");
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.headers.get("WLT-Api-Key"), "secret-key");
  const generate = JSON.parse(calls[2]?.body ?? "{}") as {
    model: string;
    world_prompt: { type: string; is_pano: string; image_prompt: { source: string; media_asset_id: string } };
  };
  assert.equal(generate.model, "marble-1.1");
  assert.equal(generate.world_prompt.type, "image");
  assert.equal(generate.world_prompt.is_pano, "false");
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
      response: {
        id: "world-9",
        display_name: "Studio",
        world_marble_url: "https://marble.worldlabs.ai/world/world-9",
        assets: {
          caption: "A studio",
          thumbnail_url: "https://cdn.example/thumb.jpg",
          splats: {
            spz_urls: {
              full_res: "https://cdn.example/full.spz",
              "100k": "https://cdn.example/100k.spz",
              "500k": "https://cdn.example/500k.spz",
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
  assert.equal(operation.coordinateFrame, "marble");
  assert.equal(operation.semantics.metricScaleFactor, 1.23);
  assert.equal(operation.semantics.groundPlaneOffset, 0.42);
  assert.deepEqual(
    operation.splatVariants.map((variant) => variant.id),
    ["100k", "500k", "full_res"],
  );
  assert.equal(assetUrl(operation, "splat", "500k"), "https://cdn.example/500k.spz");
  assert.equal(assetUrl(operation, "splat"), "https://cdn.example/100k.spz");
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
