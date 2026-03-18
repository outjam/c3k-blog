import { NextResponse } from "next/server";

import {
  listStorageAssets,
  listStorageBags,
  listStorageHealthEvents,
  listStorageMemberships,
  listStorageNodes,
} from "@/lib/server/storage-registry-store";
import { listStorageDeliveryRequests } from "@/lib/server/storage-delivery-store";
import { listStorageIngestJobs } from "@/lib/server/storage-ingest-store";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "storage:view")) {
    return forbiddenResponse();
  }

  const [assets, bags, nodes, memberships, deliveryRequests, ingestJobs, healthEvents] = await Promise.all([
    listStorageAssets(),
    listStorageBags(),
    listStorageNodes(),
    listStorageMemberships(),
    listStorageDeliveryRequests({ limit: 100 }),
    listStorageIngestJobs({ limit: 100 }),
    listStorageHealthEvents(),
  ]);

  return NextResponse.json({
    assets,
    bags,
    nodes,
    memberships,
    deliveryRequests,
    ingestJobs,
    healthEvents: healthEvents.slice(0, 100),
  });
}
