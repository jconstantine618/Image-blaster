import assert from "node:assert/strict";
import test from "node:test";
import { createMockOperationId, MOCK_DURATION_MS, mockOperation, mockStartedAt } from "./mock-world";

test("mock operation ids round-trip and advance to a downloadable splat", () => {
  const started = Date.now() - 1000;
  const id = createMockOperationId(started, "ab12cd");
  assert.equal(mockStartedAt(id), started);

  const early = mockOperation(id, started + 1000);
  assert.ok(early);
  assert.equal(early.done, false);
  assert.equal(early.splatVariants.length, 0);
  assert.ok(early.progress !== null && early.progress > 0 && early.progress < 1);

  const done = mockOperation(id, started + MOCK_DURATION_MS + 50);
  assert.ok(done);
  assert.equal(done.done, true);
  assert.equal(done.status, "SUCCEEDED");
  assert.equal(done.coordinateFrame, "three");
  assert.equal(done.cost, null);
  assert.equal(done.splatVariants[0]?.url, "/mock/courtyard.splat");
});

test("rejects ids that are not mock operations", () => {
  assert.equal(mockOperation("not-an-id"), null);
  assert.equal(mockStartedAt("mock_notbase36_zz"), null);
});
