import jwt from "jsonwebtoken";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function issueAccessToken({ userId, email }) {
  const ttl = Number(process.env.JWT_ACCESS_TTL_SECONDS || 900);
  return jwt.sign(
    { sub: userId, email, typ: "access" },
    mustEnv("JWT_ACCESS_SECRET"),
    { expiresIn: ttl }
  );
}

export function issueRefreshToken({ userId, email }) {
  const ttl = Number(process.env.JWT_REFRESH_TTL_SECONDS || 60 * 60 * 24 * 30);
  return jwt.sign(
    { sub: userId, email, typ: "refresh" },
    mustEnv("JWT_REFRESH_SECRET"),
    { expiresIn: ttl }
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, mustEnv("JWT_ACCESS_SECRET"));
  if (payload?.typ !== "access") throw new Error("wrong_token_type");
  return payload;
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, mustEnv("JWT_REFRESH_SECRET"));
  if (payload?.typ !== "refresh") throw new Error("wrong_token_type");
  return payload;
}

