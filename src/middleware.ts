/**
 * Edge gate for the signed-in area.
 *
 * This only checks that a well-formed, unexpired session cookie is present —
 * it cannot reach the database, so it is a cheap first pass, never the
 * authorisation decision. Every page and service re-reads the user's role,
 * status and team memberships from the database before acting.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "cadence_session";

/** Paths reachable without a session. */
const PUBLIC_PREFIXES = ["/login", "/invite", "/api/cron"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  let valid = false;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), {
        issuer: "cadence",
        audience: "cadence-app",
      });
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (isPublic(pathname)) {
    // Someone already signed in has no reason to see the login form.
    if (valid && pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHENTICATED", error: "You need to sign in to do that." },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (token) response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
