import { NextResponse } from "next/server";

import { joinStorageProgram } from "@/lib/server/storage-registry-store";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface JoinProgramBody {
  walletAddress?: unknown;
  note?: unknown;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: JoinProgramBody;

  try {
    payload = (await request.json()) as JoinProgramBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const membership = await joinStorageProgram({
    telegramUserId: auth.telegramUserId,
    walletAddress: normalizeText(payload.walletAddress, 160),
    note: normalizeText(payload.note, 1200),
  });

  if (!membership) {
    return NextResponse.json({ error: "Failed to join storage program" }, { status: 500 });
  }

  return NextResponse.json({ membership });
}
