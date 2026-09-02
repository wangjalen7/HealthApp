import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBarcode } from "./barcode-normalization.ts";

test("keeps API lookup digits unchanged for EAN-13 and UPC-A", () => {
  assert.deepEqual(normalizeBarcode("0034000470693", "ean13"), {
    canonical: "00034000470693",
    providerBarcode: "0034000470693",
  });
  assert.deepEqual(normalizeBarcode("034000470693", "upc_a"), {
    canonical: "00034000470693",
    providerBarcode: "034000470693",
  });
});

test("automatically accepts a valid EAN-8 without a manual type", () => {
  assert.deepEqual(normalizeBarcode("96385074", "unknown"), {
    canonical: "00000096385074",
    providerBarcode: "96385074",
  });
});

test("validates UPC-E through UPC-A expansion but queries OFF with UPC-E", () => {
  assert.deepEqual(normalizeBarcode("04252614", "upc_e"), {
    canonical: "00000004252614",
    providerBarcode: "04252614",
  });
  assert.deepEqual(normalizeBarcode("4252614", "unknown"), {
    canonical: "00000004252614",
    providerBarcode: "04252614",
  });
});

test("rejects invalid or unsupported manual barcode values", () => {
  assert.equal(normalizeBarcode("12345678", "unknown"), undefined);
  assert.equal(normalizeBarcode("12345", "unknown"), undefined);
});
