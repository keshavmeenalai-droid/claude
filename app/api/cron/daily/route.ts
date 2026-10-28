import { NextResponse, type NextRequest } from "next/server";
import { constantTimeEqual } from "@/lib/auth";
import { runDailyCheck } from "@/lib/daily";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by Vercel Cron once a day (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !constantTimeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDbConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  try {
    const summary = await runDailyCheck("cron");
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
