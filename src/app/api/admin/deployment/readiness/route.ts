import { NextResponse } from "next/server";

import { readAdminDeploymentReadiness } from "@/lib/server/admin-deployment-readiness";
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

  const status = await readAdminDeploymentReadiness(request);
  return NextResponse.json(status);
}
