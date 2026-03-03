import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const schemaPath = path.resolve(process.cwd(), "db/schema.sql");
const schema = await fs.readFile(schemaPath, "utf8");

const REQUIRED_TABLES = [
  "users",
  "products",
  "categories",
  "subcategories",
  "orders",
  "order_items",
  "order_status_history",
  "payments",
  "promo_usage",
  "admin_members",
  "blog_posts",
  "post_comments",
  "post_reactions",
];

const REQUIRED_FUNCTIONS = [
  "c3k_get_app_state",
  "c3k_put_app_state",
  "c3k_upsert_order_snapshot",
  "c3k_get_order_snapshot",
  "c3k_list_order_snapshots",
];

test("schema contains required production tables", () => {
  for (const table of REQUIRED_TABLES) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`, "i"));
  }
});

test("schema contains required RPC functions", () => {
  for (const fn of REQUIRED_FUNCTIONS) {
    assert.match(schema, new RegExp(`CREATE OR REPLACE FUNCTION\\s+${fn}\\b`, "i"));
  }
});
