import { NextResponse } from "next/server";

import { forbiddenResponse, getShopApiAccess, hasAdminPermission, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SettingsPatchBody {
  shopEnabled?: boolean;
  checkoutEnabled?: boolean;
  maintenanceMode?: boolean;
  defaultDeliveryFeeStarsCents?: number;
  freeDeliveryThresholdStarsCents?: number;
}

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "settings:view")) {
    return forbiddenResponse();
  }

  const config = await readShopAdminConfig();
  return NextResponse.json({ settings: config.settings });
}

export async function PATCH(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "settings:manage")) {
    return forbiddenResponse();
  }

  let payload: SettingsPatchBody;

  try {
    payload = (await request.json()) as SettingsPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const config = await mutateShopAdminConfig((current) => ({
    ...current,
    settings: {
      ...current.settings,
      shopEnabled: typeof payload.shopEnabled === "boolean" ? payload.shopEnabled : current.settings.shopEnabled,
      checkoutEnabled:
        typeof payload.checkoutEnabled === "boolean" ? payload.checkoutEnabled : current.settings.checkoutEnabled,
      maintenanceMode:
        typeof payload.maintenanceMode === "boolean" ? payload.maintenanceMode : current.settings.maintenanceMode,
      defaultDeliveryFeeStarsCents:
        typeof payload.defaultDeliveryFeeStarsCents === "number" && Number.isFinite(payload.defaultDeliveryFeeStarsCents)
          ? Math.max(0, Math.round(payload.defaultDeliveryFeeStarsCents))
          : current.settings.defaultDeliveryFeeStarsCents,
      freeDeliveryThresholdStarsCents:
        typeof payload.freeDeliveryThresholdStarsCents === "number" && Number.isFinite(payload.freeDeliveryThresholdStarsCents)
          ? Math.max(0, Math.round(payload.freeDeliveryThresholdStarsCents))
          : current.settings.freeDeliveryThresholdStarsCents,
      updatedAt: now,
    },
    updatedAt: now,
  }));

  return NextResponse.json({ settings: config.settings });
}
