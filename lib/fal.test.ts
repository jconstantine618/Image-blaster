import assert from "node:assert/strict";
import test from "node:test";
import { buildFalInput, readFalResult } from "./fal";

test("hunyuan mesh input matches the image-blaster defaults", () => {
  const input = buildFalInput({
    task: "mesh",
    imageUrl: "https://v3.fal.media/files/example.png",
  });
  assert.deepEqual(input, {
    input_image_url: "https://v3.fal.media/files/example.png",
    generate_type: "Normal",
    enable_pbr: true,
    face_count: 50000,
  });
});

test("nano banana edit and elevenlabs sound inputs are scoped", () => {
  const edit = buildFalInput({
    task: "edit",
    prompt: "Isolate the chair",
    imageUrl: "data:image/jpeg;base64,abcd",
  });
  assert.equal((edit.image_urls as string[])[0], "data:image/jpeg;base64,abcd");
  assert.equal(edit.resolution, "1K");

  const sound = buildFalInput({ task: "sound", prompt: "Room tone", loop: true, durationSeconds: 12 });
  assert.equal(sound.text, "Room tone");
  assert.equal(sound.loop, true);
  assert.equal(sound.output_format, "mp3_44100_128");
  assert.equal(sound.prompt_influence, 0.3);
});

test("rejects arbitrary image hosts", () => {
  assert.throws(() => buildFalInput({ task: "mesh", imageUrl: "https://example.com/secret.png" }), /FAL-hosted/);
});

test("reads fal result urls", () => {
  const result = readFalResult({
    images: [{ url: "https://v3.fal.media/edit.png" }],
    model_urls: { glb: { url: "https://v3.fal.media/model.glb" } },
    audio: { url: "https://v3.fal.media/sound.mp3" },
  });
  assert.equal(result.imageUrl, "https://v3.fal.media/edit.png");
  assert.equal(result.glbUrl, "https://v3.fal.media/model.glb");
  assert.equal(result.audioUrl, "https://v3.fal.media/sound.mp3");
});
