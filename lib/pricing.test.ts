import assert from "node:assert/strict";
import test from "node:test";
import { quoteMarbleGeneration } from "./pricing";

test("marble-1.1 non-panorama image is about $1.26", () => {
  const quote = quoteMarbleGeneration("non-pano");
  assert.equal(quote.model, "marble-1.1");
  assert.equal(quote.panoCredits, 80);
  assert.equal(quote.worldCredits, 1500);
  assert.equal(quote.totalCredits, 1580);
  assert.equal(quote.usd, 1.26);
  assert.equal(quote.usdLabel, "$1.26");
});

test("marble-1.1 panorama skips the pano charge", () => {
  const quote = quoteMarbleGeneration("pano");
  assert.equal(quote.totalCredits, 1500);
  assert.equal(quote.usd, 1.2);
  assert.equal(quote.usdLabel, "$1.20");
});

test("marble-1.1 multi-image auto layout is about $1.28", () => {
  const quote = quoteMarbleGeneration("multi-image");
  assert.equal(quote.panoCredits, 100);
  assert.equal(quote.worldCredits, 1500);
  assert.equal(quote.totalCredits, 1600);
  assert.equal(quote.usd, 1.28);
  assert.equal(quote.usdLabel, "$1.28");
});
