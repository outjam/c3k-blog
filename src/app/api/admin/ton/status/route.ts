import { NextResponse } from "next/server";

import { readAdminTonEnvironmentStatus } from "@/lib/server/admin-ton-environment-status";
import { getPostgresHttpConfig } from "@/lib/server/postgres-http";
import { forbiddenResponse, getShopApiAccess, hasAdminPermission, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "dashboard:view")) {
    return forbiddenResponse();
  }

  if (!getPostgresHttpConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Postgres is not configured for admin TON status.",
      },
      { status: 503 },
    );
  }

  try {
    const status = await readAdminTonEnvironmentStatus(request);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to read TON environment status",
      },
      { status: 502 },
    );
  }
}
