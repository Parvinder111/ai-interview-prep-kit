import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const PROTECTED_PAGE_PREFIXES = ["/dashboard", "/kit", "/weak-spots"];
const PROTECTED_API_PREFIXES = ["/api/kits", "/api/weak-spots"];

function hasValidSession(req) {
  const token = req.cookies.get("session")?.value;
  if (!token) return false;
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

// Runs before every request: a signed-out visitor cannot reach protected pages or API endpoints
// (Section 1). Session verification happens here (Edge-compatible) rather than per-route so it
// cannot be forgotten on a new route.
export function middleware(req) {
  const { pathname } = req.nextUrl;
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) => pathname.startsWith(p));
  const isProtectedApi = PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isProtectedPage && !isProtectedApi) return NextResponse.next();

  if (hasValidSession(req)) return NextResponse.next();

  if (isProtectedApi) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/kit/:path*", "/api/kits/:path*", "/weak-spots/:path*", "/api/weak-spots/:path*"],
  // jsonwebtoken depends on Node's `crypto` module, which the default Edge middleware runtime
  // does not provide — this must run on the Node.js runtime, not Edge.
  runtime: "nodejs",
};
