import crypto from "node:crypto";

export function computeDedupeHash(jd, companyUrl) {
  return crypto
    .createHash("sha256")
    .update(`${jd.trim().toLowerCase()}::${companyUrl.trim().toLowerCase()}`)
    .digest("hex");
}
