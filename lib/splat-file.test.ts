import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the mock courtyard splat is a sequence of 32-byte records", () => {
  const bytes = readFileSync(new URL("../public/mock/courtyard.splat", import.meta.url));
  assert.equal(bytes.length % 32, 0);
  assert.ok(bytes.length / 32 > 1000);
});
