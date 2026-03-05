import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { getShopOrderById, upsertShopOrder } from "@/lib/server/shop-orders-store";
import type { ShopOrder } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateArtistSupportOrderBody {
  kind?: "donation" | "subscription";
  amountStarsCents?: number;
  comment?: string;
}

const ORDER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const clampMoney = (value: unknown): number => {
  const normalized = Math.round(Number(value ?? 0));
  if (!Number.isFinite(normalized)) {
    return 100;
  }

  return Math.max(1, normalized);
};

const generateOrderCode = (): string => {
  const bytes = randomBytes(6);
  let raw = "";

  for (let index = 0; index < bytes.length; index += 1) {
    raw += ORDER_ALPHABET[bytes[index] % ORDER_ALPHABET.length];
  }

  return `${raw.slice(0, 3)}-${raw.slice(3, 6)}`;
};

const createUniqueOrderCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const orderCode = generateOrderCode();
    const exists = await getShopOrderById(orderCode);
    if (!exists) {
      return orderCode;
    }
  }

  throw new Error("order_code_generation_failed");
};

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: CreateArtistSupportOrderBody;

  try {
    payload = (await request.json()) as CreateArtistSupportOrderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { slug } = await context.params;
  const kind = payload.kind === "subscription" ? "subscription" : "donation";
  const amountStarsCents = clampMoney(payload.amountStarsCents);

  const config = await readShopAdminConfig();
  const artist = Object.values(config.artistProfiles).find((entry) => entry.slug === slug && entry.status === "approved");

  if (!artist) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  if (kind === "subscription" && !artist.subscriptionEnabled) {
    return NextResponse.json({ error: "Subscription is disabled for this artist" }, { status: 409 });
  }

  if (kind === "donation" && !artist.donationEnabled) {
    return NextResponse.json({ error: "Donations are disabled for this artist" }, { status: 409 });
  }

  const orderCode = await createUniqueOrderCode().catch(() => null);
  if (!orderCode) {
    return NextResponse.json({ error: "Failed to generate order code" }, { status: 503 });
  }

  const now = new Date().toISOString();
  const productId = `${kind === "donation" ? "don" : "sub"}-${artist.telegramUserId}`;
  const itemTitle = kind === "donation" ? `Донат артисту ${artist.displayName}` : `Подписка на ${artist.displayName}`;
  const invoiceStars = Math.max(1, Math.ceil(amountStarsCents / 100));
  const customerName = [auth.firstName, auth.lastName].filter(Boolean).join(" ") || `Telegram ${auth.telegramUserId}`;

  const order: ShopOrder = {
    id: orderCode,
    createdAt: now,
    updatedAt: now,
    status: "created",
    invoiceStars,
    totalStarsCents: amountStarsCents,
    deliveryFeeStarsCents: 0,
    discountStarsCents: 0,
    delivery: "digital_download",
    promoCode: undefined,
    address: "Digital support",
    customerName,
    phone: "unknown",
    email: auth.username ? `${auth.username}@telegram.local` : undefined,
    comment: String(payload.comment ?? "").trim().slice(0, 280),
    telegramUserId: auth.telegramUserId,
    telegramUsername: auth.username || undefined,
    telegramFirstName: auth.firstName || undefined,
    telegramLastName: auth.lastName || undefined,
    payment: {
      currency: "XTR",
      amount: invoiceStars,
      invoicePayloadHash: "",
      status: "created",
      updatedAt: now,
    },
    items: [
      {
        productId,
        title: itemTitle,
        quantity: 1,
        priceStarsCents: amountStarsCents,
      },
    ],
    history: [
      {
        id: `${Date.now()}-created`,
        at: now,
        fromStatus: null,
        toStatus: "created",
        actor: "user",
        actorTelegramId: auth.telegramUserId,
        note: kind === "donation" ? "Создан донат артисту" : "Создана подписка на артиста",
      },
    ],
  };

  await upsertShopOrder(order);

  return NextResponse.json({
    order,
    artist: {
      telegramUserId: artist.telegramUserId,
      slug: artist.slug,
      displayName: artist.displayName,
    },
    kind,
  });
}
