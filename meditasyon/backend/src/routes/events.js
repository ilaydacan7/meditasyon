import express from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.js";
import { getDb } from "../storage/db.js";
import { newId } from "../utils/crypto.js";

export const eventsRouter = express.Router();

const EventCreateSchema = z.object({
  eventType: z.string().min(2).max(80),
  eventData: z.record(z.unknown()).optional(),
});

function nowMs() {
  return Date.now();
}

eventsRouter.post("/", requireAuth, async (req, res) => {
  const parsed = EventCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

  const db = getDb();
  const id = newId();
  const { eventType, eventData } = parsed.data;

  await db.prepare(
    "INSERT INTO user_events (id, user_id, event_type, event_data, created_at) VALUES (?, ?, ?, ?::jsonb, ?)"
  ).run(id, req.user.id, eventType, JSON.stringify(eventData || {}), nowMs());

  return res.json({ ok: true, id });
});
