import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { importTsModule } from "../helpers/load-ts-module.mjs";

const modulePath = path.resolve(process.cwd(), "src/lib/stars-format.ts");
const { formatStarsFromCents, starsCentsToInvoiceStars } = await importTsModule(modulePath);

test("formatStarsFromCents formats fixed 2 decimals", () => {
  assert.equal(formatStarsFromCents(0), "0.00");
  assert.equal(formatStarsFromCents(199), "1.99");
  assert.equal(formatStarsFromCents(-50), "0.00");
});

test("starsCentsToInvoiceStars rounds up and clamps minimum 1", () => {
  assert.equal(starsCentsToInvoiceStars(0), 1);
  assert.equal(starsCentsToInvoiceStars(1), 1);
  assert.equal(starsCentsToInvoiceStars(101), 2);
});
