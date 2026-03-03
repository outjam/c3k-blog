import { NextResponse } from "next/server";

import { forbiddenResponse, getShopApiAccess, hasAdminPermission, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { PromoDiscountType } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PromoCreateBody {
  code?: string;
  label?: string;
  discountType?: PromoDiscountType;
  discountValue?: number;
  minSubtotalStarsCents?: number;
  active?: boolean;
  usageLimit?: number | null;
  expiresAt?: string | null;
}

interface PromoPatchBody extends PromoCreateBody {
  currentCode?: string;
}

const normalizeCode = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
};

const parseDiscountType = (value: unknown): PromoDiscountType => {
  return value === "fixed" ? "fixed" : "percent";
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "promos:view")) {
    return forbiddenResponse();
  }

  const config = await readShopAdminConfig();
  return NextResponse.json({ promos: config.promoCodes });
}

export async function POST(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "promos:manage")) {
    return forbiddenResponse();
  }

  let payload: PromoCreateBody;

  try {
    payload = (await request.json()) as PromoCreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = normalizeCode(payload.code);

  if (!code) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const config = await mutateShopAdminConfig((current) => {
    if (current.promoCodes.some((promo) => promo.code === code)) {
      return current;
    }

    const promo = {
      code,
      label: String(payload.label ?? code).trim().slice(0, 80),
      discountType: parseDiscountType(payload.discountType),
      discountValue: Math.max(1, Math.round(Number(payload.discountValue ?? 10))),
      minSubtotalStarsCents: Math.max(0, Math.round(Number(payload.minSubtotalStarsCents ?? 0))),
      active: payload.active ?? true,
      usageLimit:
        typeof payload.usageLimit === "number" && Number.isFinite(payload.usageLimit) && payload.usageLimit > 0
          ? Math.round(payload.usageLimit)
          : undefined,
      usedCount: 0,
      expiresAt: payload.expiresAt ? String(payload.expiresAt) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    return {
      ...current,
      promoCodes: [promo, ...current.promoCodes],
      updatedAt: now,
    };
  });

  return NextResponse.json({ promos: config.promoCodes });
}

export async function PATCH(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "promos:manage")) {
    return forbiddenResponse();
  }

  let payload: PromoPatchBody;

  try {
    payload = (await request.json()) as PromoPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const currentCode = normalizeCode(payload.currentCode);
  const nextCode = payload.code ? normalizeCode(payload.code) : undefined;

  if (!currentCode) {
    return NextResponse.json({ error: "Invalid currentCode" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const config = await mutateShopAdminConfig((current) => {
    const promos = current.promoCodes.map((promo) => {
      if (promo.code !== currentCode) {
        return promo;
      }

      return {
        ...promo,
        code: nextCode || promo.code,
        label: typeof payload.label === "string" ? payload.label.trim().slice(0, 80) : promo.label,
        discountType: typeof payload.discountType === "string" ? parseDiscountType(payload.discountType) : promo.discountType,
        discountValue:
          typeof payload.discountValue === "number" && Number.isFinite(payload.discountValue)
            ? Math.max(1, Math.round(payload.discountValue))
            : promo.discountValue,
        minSubtotalStarsCents:
          typeof payload.minSubtotalStarsCents === "number" && Number.isFinite(payload.minSubtotalStarsCents)
            ? Math.max(0, Math.round(payload.minSubtotalStarsCents))
            : promo.minSubtotalStarsCents,
        active: typeof payload.active === "boolean" ? payload.active : promo.active,
        usageLimit:
          typeof payload.usageLimit === "number" && Number.isFinite(payload.usageLimit) && payload.usageLimit > 0
            ? Math.round(payload.usageLimit)
            : payload.usageLimit === null
              ? undefined
              : promo.usageLimit,
        expiresAt: payload.expiresAt === null ? undefined : payload.expiresAt ? String(payload.expiresAt) : promo.expiresAt,
        updatedAt: now,
      };
    });

    return {
      ...current,
      promoCodes: promos,
      updatedAt: now,
    };
  });

  return NextResponse.json({ promos: config.promoCodes });
}

export async function DELETE(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "promos:manage")) {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const code = normalizeCode(url.searchParams.get("code"));

  if (!code) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const config = await mutateShopAdminConfig((current) => ({
    ...current,
    promoCodes: current.promoCodes.filter((promo) => promo.code !== code),
    updatedAt: now,
  }));

  return NextResponse.json({ promos: config.promoCodes });
}
