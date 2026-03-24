import { NextResponse } from "next/server";

import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import { getC3kDesktopRuntimeContract } from "@/lib/server/desktop-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const webAppOrigin = resolvePublicBaseUrl(request);
  const runtimeContract = await getC3kDesktopRuntimeContract({ webAppOrigin });

  return NextResponse.json({
    ok: true,
    runtime: runtimeContract,
  });
}
