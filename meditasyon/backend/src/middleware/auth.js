import { verifyAccessToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice("Bearer ".length) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

