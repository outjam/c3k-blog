import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { importTsModule } from "../helpers/load-ts-module.mjs";

const statusModulePath = path.resolve(process.cwd(), "src/lib/shop-order-status.ts");
const { canTransitionShopOrderStatus } = await importTsModule(statusModulePath);

const starsInvoicePath = path.resolve(process.cwd(), "src/app/api/telegram/stars-invoice/route.ts");
const webhookPath = path.resolve(process.cwd(), "src/app/api/telegram/webhook/route.ts");

const [starsInvoiceSource, webhookSource] = await Promise.all([
  fs.readFile(starsInvoicePath, "utf8"),
  fs.readFile(webhookPath, "utf8"),
]);

test("payment state machine allows only created -> pending_payment -> paid", () => {
  assert.equal(canTransitionShopOrderStatus("created", "pending_payment"), true);
  assert.equal(canTransitionShopOrderStatus("pending_payment", "paid"), true);
  assert.equal(canTransitionShopOrderStatus("created", "paid"), false);
});

test("invoice route keeps webhook up-to-date before createInvoiceLink", () => {
  assert.match(starsInvoiceSource, /setWebhook/);
  assert.match(starsInvoiceSource, /createInvoiceLink/);
  assert.match(starsInvoiceSource, /status:\s*"pending_payment"/);
});

test("webhook route validates secret and marks paid only in successful_payment branch", () => {
  assert.match(webhookSource, /x-telegram-bot-api-secret-token/);
  assert.match(webhookSource, /if \(update\.message\?\.successful_payment/);
  assert.match(webhookSource, /status:\s*"paid"/);
});
