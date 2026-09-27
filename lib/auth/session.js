import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Copy .env.example to .env.local and fill it in.");
  }
  return process.env.JWT_SECRET;
}

export function signSession(userId) {
  return jwt.sign({ sub: String(userId) }, secret(), { expiresIn: SESSION_TTL_SECONDS });
}

export async function setSessionCookie(userId) {
  const token = signSession(userId);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// Returns the authenticated user's id, or null if the session is missing, expired or invalid.
// Deliberately swallows jwt errors (expired/malformed) rather than throwing: an invalid session
// should behave like "signed out", not like a server error.
export async function getSessionUserId() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret());
    return payload.sub;
  } catch {
    return null;
  }
}
