import crypto from "node:crypto";

export function newId() {
  return crypto.randomUUID();
}

export function sha256Base64(input) {
  return crypto.createHash("sha256").update(String(input)).digest("base64");
}

