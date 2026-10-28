import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Cron endpoint authenticates with CRON_SECRET itself; login page must stay reachable.
  if (pathname.startsWith("/api/cron") || pathname === "/login") return NextResponse.next();

  const ok = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
