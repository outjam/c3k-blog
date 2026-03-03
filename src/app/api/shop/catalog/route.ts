import { NextResponse } from "next/server";

import { getCatalogSnapshot } from "@/lib/server/shop-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getCatalogSnapshot();
  return NextResponse.json(snapshot);
}
