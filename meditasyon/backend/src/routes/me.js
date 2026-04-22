import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDb } from "../storage/db.js";

export const meRouter = express.Router();

meRouter.get("/me", requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare("SELECT id, email, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "not_found" });
  return res.json({ user: { id: user.id, email: user.email, createdAt: user.created_at } });
});

