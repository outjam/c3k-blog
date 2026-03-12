import { NextResponse } from "next/server";

import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanitizeBaseUrl = (value: string | null): string => {
  const fallback = "https://your-project.vercel.app";

  if (!value) {
    return fallback;
  }

  const normalized = value.trim().replace(/\/+$/, "");
  return normalized || fallback;
};

export async function GET(request: Request) {
  const baseUrl = sanitizeBaseUrl(resolvePublicBaseUrl(request));

  return NextResponse.json({
    name: "Culture3k Social Music",
    url: baseUrl,
    iconUrl: `${baseUrl}/favicon.ico`,
    termsOfUseUrl: `${baseUrl}/terms`,
    privacyPolicyUrl: `${baseUrl}/privacy`,
  });
}

