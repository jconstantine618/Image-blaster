import assert from "node:assert/strict";
import test from "node:test";
import { framesMatch, sharedFrame } from "./image-frame";
import { readImageSize } from "./image-size";

test("shared frame keeps one aspect ratio and does not upscale", () => {
  const large = sharedFrame([
    { width: 4000, height: 3000 },
    { width: 2000, height: 1500 },
  ]);
  assert.equal(large.cropped, false);
  assert.deepEqual({ width: large.width, height: large.height }, { width: 1920, height: 1440 });

  const small = sharedFrame([
    { width: 800, height: 600 },
    { width: 1600, height: 1200 },
  ]);
  assert.equal(small.cropped, false);
  assert.deepEqual({ width: small.width, height: small.height }, { width: 800, height: 600 });
});

test("a different aspect ratio is marked for cropping to the first photo", () => {
  const frame = sharedFrame([
    { width: 4000, height: 3000 },
    { width: 1920, height: 1080 },
  ]);
  assert.equal(frame.cropped, true);
  assert.equal(frame.width, 1920);
  assert.equal(frame.height, 1440);
});

test("png and jpeg headers report the same pixel size", () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x04, 0x00,
    0x00, 0x00, 0x03, 0x00,
  ]);
  const jpeg = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    0x03, 0x00,
    0x04, 0x00,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  assert.deepEqual(readImageSize(png), { width: 1024, height: 768 });
  assert.deepEqual(readImageSize(jpeg), { width: 1024, height: 768 });
  assert.equal(framesMatch([readImageSize(png)!, readImageSize(jpeg)!]), true);
});
