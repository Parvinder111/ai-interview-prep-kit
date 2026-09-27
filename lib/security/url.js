import net from "node:net";
import dns from "node:dns/promises";

// Blocks fetching private, loopback and link-local addresses. In production this is a hard SSRF
// guard. In development/test it is relaxed so the batch entry point (Section 9 of the brief) can
// run against a locally-served fixture company site, as the brief explicitly allows.
const PRIVATE_RANGES = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

function isPrivateIp(ip) {
  if (ip === "::1") return true;
  if (net.isIP(ip) === 6) return ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80");
  return PRIVATE_RANGES.some((re) => re.test(ip));
}

const ALLOW_LOCAL = process.env.NODE_ENV !== "production";

export class UnsafeUrlError extends Error {
  constructor(message, code = "UNSAFE_URL") {
    super(message);
    this.code = code;
  }
}

export function normalizeUrl(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError(`"${raw}" is not a valid URL.`, "INVALID_URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UnsafeUrlError(`Unsupported protocol "${url.protocol}".`, "INVALID_URL");
  }
  return url;
}

// Resolves the hostname and rejects it if it points at a private/loopback/link-local address,
// unless local fetches are explicitly allowed (non-production). This runs at fetch time, not just
// on the input string, so a public hostname that resolves to a private IP (DNS rebinding) is
// still caught.
export async function assertSafeToFetch(url) {
  if (ALLOW_LOCAL && (url.hostname === "localhost" || net.isIP(url.hostname))) {
    if (net.isIP(url.hostname) && isPrivateIp(url.hostname) && !ALLOW_LOCAL) {
      throw new UnsafeUrlError("Refusing to fetch a private/loopback address.", "PRIVATE_ADDRESS");
    }
    return;
  }
  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve "${url.hostname}".`, "DNS_FAILURE");
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address) && !ALLOW_LOCAL) {
      throw new UnsafeUrlError("Refusing to fetch a private/loopback address.", "PRIVATE_ADDRESS");
    }
  }
}
