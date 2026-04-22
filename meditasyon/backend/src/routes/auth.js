import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { getDb } from "../storage/db.js";
import { newId, sha256Base64 } from "../utils/crypto.js";
import { issueAccessToken, issueRefreshToken, verifyRefreshToken } from "../utils/jwt.js";

export const authRouter = express.Router();

const EmailPasswordSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
});

function nowMs() {
  return Date.now();
}

function jsonError(res, status, error, details) {
  return res.status(status).json(details ? { error, details } : { error });
}

function tokensResponse(user) {
  const accessToken = issueAccessToken({ userId: user.id, email: user.email });
  const refreshToken = issueRefreshToken({ userId: user.id, email: user.email });
  return { accessToken, refreshToken };
}

async function storeRefreshToken(db, { userId, refreshToken }) {
  const payload = verifyRefreshToken(refreshToken); // also validates signature
  const expiresAt = typeof payload.exp === "number" ? payload.exp * 1000 : nowMs() + 30 * 864e5;
  const id = newId();
  const tokenHash = sha256Base64(refreshToken);

  await db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`
  ).run(id, userId, tokenHash, nowMs(), expiresAt);

  return { id, expiresAt };
}

authRouter.post("/register", async (req, res) => {
  const parsed = EmailPasswordSchema.safeParse(req.body);
  if (!parsed.success) return jsonError(res, 400, "invalid_body", parsed.error.flatten());

  const { email, password } = parsed.data;
  const db = getDb();

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return jsonError(res, 409, "email_in_use");

  const id = newId();
  const passwordHash = bcrypt.hashSync(password, 10);
  await db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(id, email, passwordHash, nowMs());

  const tokens = tokensResponse({ id, email });
  await storeRefreshToken(db, { userId: id, refreshToken: tokens.refreshToken });

  return res.json({ user: { id, email }, ...tokens });
});

authRouter.post("/login", async (req, res) => {
  const parsed = EmailPasswordSchema.safeParse(req.body);
  if (!parsed.success) return jsonError(res, 400, "invalid_body", parsed.error.flatten());

  const { email, password } = parsed.data;
  const db = getDb();

  const user = await db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  if (!user) return jsonError(res, 401, "invalid_credentials");

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return jsonError(res, 401, "invalid_credentials");

  const tokens = tokensResponse({ id: user.id, email: user.email });
  await storeRefreshToken(db, { userId: user.id, refreshToken: tokens.refreshToken });

  return res.json({ user: { id: user.id, email: user.email }, ...tokens });
});

authRouter.post("/refresh", async (req, res) => {
  const BodySchema = z.object({ refreshToken: z.string().min(10) });
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return jsonError(res, 400, "invalid_body", parsed.error.flatten());

  const { refreshToken } = parsed.data;
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return jsonError(res, 401, "invalid_refresh");
  }

  const db = getDb();
  const tokenHash = sha256Base64(refreshToken);
  const row = await db
    .prepare(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token_hash = ?`
    )
    .get(tokenHash);

  if (!row || row.revoked_at) return jsonError(res, 401, "invalid_refresh");
  if (typeof row.expires_at === "number" && row.expires_at <= nowMs()) return jsonError(res, 401, "refresh_expired");

  const user = await db.prepare("SELECT id, email FROM users WHERE id = ?").get(row.user_id);
  if (!user) return jsonError(res, 401, "invalid_refresh");

  // rotate
  await db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?").run(nowMs(), row.id);
  const tokens = tokensResponse({ id: user.id, email: user.email });
  await storeRefreshToken(db, { userId: user.id, refreshToken: tokens.refreshToken });

  return res.json({ user: { id: user.id, email: user.email }, ...tokens });
});

