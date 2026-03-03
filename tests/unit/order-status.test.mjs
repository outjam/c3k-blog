import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { importTsModule } from "../helpers/load-ts-module.mjs";

const modulePath = path.resolve(process.cwd(), "src/lib/shop-order-status.ts");
const { FINAL_ORDER_STATUSES, canTransitionShopOrderStatus } = await importTsModule(modulePath);

test("payment state machine forbids direct created -> paid", () => {
  assert.equal(canTransitionShopOrderStatus("created", "paid"), false);
  assert.equal(canTransitionShopOrderStatus("created", "pending_payment"), true);
  assert.equal(canTransitionShopOrderStatus("pending_payment", "paid"), true);
});

test("final statuses include payment_failed and refunded", () => {
  assert.equal(FINAL_ORDER_STATUSES.has("payment_failed"), true);
  assert.equal(FINAL_ORDER_STATUSES.has("refunded"), true);
  assert.equal(FINAL_ORDER_STATUSES.has("processing"), false);
});
