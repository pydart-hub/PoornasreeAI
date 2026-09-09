import { NextResponse } from "next/server";

export async function GET() {
  const target =
    process.env.GOOGLE_REVIEW_URL ||
    "https://share.google/vu3bpT7Unl4yIa5IH";

  return NextResponse.redirect(target, { status: 307 });
}
