import express from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getDb } from "../storage/db.js";
import { newId } from "../utils/crypto.js";

export const moodsRouter = express.Router();

const MoodCreateSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  moodValue: z.number().min(0).max(1),
  note: z.string().max(1000).optional().nullable(),
});

function nowMs() {
  return Date.now();
}

moodsRouter.post("/", requireAuth, (req, res) => {
  const parsed = MoodCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

  const { entryDate, moodValue, note } = parsed.data;
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM mood_entries WHERE user_id = ? AND entry_date = ?")
    .get(req.user.id, entryDate);

  if (existing) {
    db.prepare(
      "UPDATE mood_entries SET mood_value = ?, note = ? WHERE id = ?"
    ).run(moodValue, note ?? null, existing.id);
    return res.json({ ok: true, id: existing.id, entryDate, moodValue, note: note ?? null });
  }

  const id = newId();
  db.prepare(
    "INSERT INTO mood_entries (id, user_id, entry_date, mood_value, note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, req.user.id, entryDate, moodValue, note ?? null, nowMs());

  return res.json({ ok: true, id, entryDate, moodValue, note: note ?? null });
});

moodsRouter.get("/", requireAuth, (req, res) => {
  const QuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "invalid_query", details: parsed.error.flatten() });

  const { from, to } = parsed.data;
  const db = getDb();

  let sql =
    "SELECT id, entry_date as entryDate, mood_value as moodValue, note, created_at as createdAt FROM mood_entries WHERE user_id = ?";
  const params = [req.user.id];

  if (from) {
    sql += " AND entry_date >= ?";
    params.push(from);
  }
  if (to) {
    sql += " AND entry_date <= ?";
    params.push(to);
  }
  sql += " ORDER BY entry_date DESC";

  const rows = db.prepare(sql).all(...params);
  return res.json({ items: rows });
});

