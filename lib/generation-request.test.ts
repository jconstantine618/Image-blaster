import assert from "node:assert/strict";
import test from "node:test";
import { generationKind, matchingFrames, validateGenerationFiles } from "./generation-request";

const photo = { name: "room.jpg", type: "image/jpeg", size: 1200 };

test("one photo and a panorama keep their own prices", () => {
  assert.equal(generationKind(1, false), "non-pano");
  assert.equal(generationKind(1, true), "pano");
  assert.equal(generationKind(3, false), "multi-image");
  assert.deepEqual(validateGenerationFiles([photo], true), { ok: true });
});

test("a panorama cannot be combined with other images", () => {
  const result = validateGenerationFiles([photo, { ...photo, name: "side.jpg" }], true);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /panorama/);
  }
});

test("auto layout stops at 8 photos and requires matching frames", () => {
  const nine = Array.from({ length: 9 }, (_, index) => ({ ...photo, name: `room-${index}.jpg` }));
  const tooMany = validateGenerationFiles(nine, false);
  assert.equal(tooMany.ok, false);

  const wide = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x02, 0x00, 0x04, 0x00, 0x01, 0x01, 0x11, 0x00,
  ]);
  const tall = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x00, 0x02, 0x00, 0x01, 0x01, 0x11, 0x00,
  ]);
  const mismatch = matchingFrames([wide, tall]);
  assert.equal(mismatch.ok, false);
  const match = matchingFrames([wide, wide]);
  assert.equal(match.ok, true);
});
