import express from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getDb } from "../storage/db.js";
import { newId } from "../utils/crypto.js";

export const sleepRouter = express.Router();

function nowMs() {
  return Date.now();
}

function todayDateStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

sleepRouter.get("/routine", requireAuth, async (req, res) => {
  const db = getDb();
  let routine = await db
    .prepare("SELECT id, title, active FROM sleep_routines WHERE user_id = ? AND active = 1 LIMIT 1")
    .get(req.user.id);

  if (!routine) {
    const id = newId();
    await db.prepare(
      "INSERT INTO sleep_routines (id, user_id, title, active, created_at) VALUES (?, ?, ?, 1, ?)"
    ).run(id, req.user.id, "Uyku Öncesi Rutinim", nowMs());
    routine = { id, title: "Uyku Öncesi Rutinim", active: 1 };
  }

  const items = await db
    .prepare(
      `SELECT id, label, sort_order as sortOrder
       FROM sleep_routine_items
       WHERE routine_id = ?
       ORDER BY sort_order ASC`
    )
    .all(routine.id);

  const date = todayDateStr();
  const checkins = await db
    .prepare(
      `SELECT routine_item_id as routineItemId, is_done as isDone
       FROM sleep_item_checkins
       WHERE user_id = ? AND checkin_date = ?`
    )
    .all(req.user.id, date);

  const doneByItemId = new Map(checkins.map((c) => [c.routineItemId, !!c.isDone]));
  const itemsWithDone = items.map((it) => ({ ...it, isDoneToday: doneByItemId.get(it.id) || false }));

  return res.json({ routine: { id: routine.id, title: routine.title }, date, items: itemsWithDone });
});

sleepRouter.put("/routine", requireAuth, async (req, res) => {
  const BodySchema = z.object({
    title: z.string().min(1).max(200),
    items: z
      .array(
        z.object({
          id: z.string().optional(),
          label: z.string().min(1).max(200),
        })
      )
      .max(50),
  });

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

  const db = getDb();
  let routine = await db
    .prepare("SELECT id FROM sleep_routines WHERE user_id = ? AND active = 1 LIMIT 1")
    .get(req.user.id);
  if (!routine) {
    routine = { id: newId() };
    await db.prepare(
      "INSERT INTO sleep_routines (id, user_id, title, active, created_at) VALUES (?, ?, ?, 1, ?)"
    ).run(routine.id, req.user.id, parsed.data.title, nowMs());
  } else {
    await db.prepare("UPDATE sleep_routines SET title = ? WHERE id = ?").run(parsed.data.title, routine.id);
  }

  const incoming = parsed.data.items;
  const existing = await db
    .prepare("SELECT id FROM sleep_routine_items WHERE routine_id = ?")
    .all(routine.id);
  const existingIds = existing.map((r) => r.id);
  const incomingIds = new Set(incoming.map((i) => i.id).filter(Boolean));

  // delete removed
  for (const id of existingIds) {
    if (!incomingIds.has(id)) {
      await db.prepare("DELETE FROM sleep_routine_items WHERE id = ?").run(id);
    }
  }

  // upsert items
  for (const [idx, it] of incoming.entries()) {
    const id = it.id && incomingIds.has(it.id) ? it.id : newId();
    const exists = it.id ? await db.prepare("SELECT id FROM sleep_routine_items WHERE id = ?").get(it.id) : null;
    if (exists) {
      await db.prepare("UPDATE sleep_routine_items SET label = ?, sort_order = ? WHERE id = ?").run(
        it.label,
        idx,
        id
      );
    } else {
      await db.prepare(
        "INSERT INTO sleep_routine_items (id, routine_id, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id, routine.id, it.label, idx, nowMs());
    }
  }

  return res.json({ ok: true, routineId: routine.id });
});

sleepRouter.put("/checkin", requireAuth, async (req, res) => {
  const BodySchema = z.object({
    routineItemId: z.string().min(1),
    checkinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    isDone: z.boolean(),
  });
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

  const { routineItemId, isDone } = parsed.data;
  const date = parsed.data.checkinDate || todayDateStr();
  const db = getDb();

  const existing = await db
    .prepare(
      "SELECT id FROM sleep_item_checkins WHERE user_id = ? AND routine_item_id = ? AND checkin_date = ?"
    )
    .get(req.user.id, routineItemId, date);

  if (existing) {
    await db.prepare("UPDATE sleep_item_checkins SET is_done = ? WHERE id = ?").run(isDone ? 1 : 0, existing.id);
    return res.json({ ok: true, id: existing.id });
  }

  const id = newId();
  await db.prepare(
    "INSERT INTO sleep_item_checkins (id, user_id, routine_item_id, checkin_date, is_done, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, req.user.id, routineItemId, date, isDone ? 1 : 0, nowMs());
  return res.json({ ok: true, id });
});

sleepRouter.put("/settings", requireAuth, async (req, res) => {
  const BodySchema = z.object({
    timeHHMM: z.string().regex(/^\d{2}:\d{2}$/),
    message: z.string().min(1).max(300),
    enabled: z.boolean(),
  });
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

  const { timeHHMM, message, enabled } = parsed.data;
  const db = getDb();

  const existing = await db.prepare("SELECT user_id FROM sleep_settings WHERE user_id = ?").get(req.user.id);
  if (existing) {
    await db.prepare(
      "UPDATE sleep_settings SET time_hhmm = ?, message = ?, enabled = ?, updated_at = ? WHERE user_id = ?"
    ).run(timeHHMM, message, enabled ? 1 : 0, nowMs(), req.user.id);
  } else {
    await db.prepare(
      "INSERT INTO sleep_settings (user_id, time_hhmm, message, enabled, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(req.user.id, timeHHMM, message, enabled ? 1 : 0, nowMs());
  }

  return res.json({ ok: true });
});

sleepRouter.get("/settings", requireAuth, async (req, res) => {
  const db = getDb();
  const row = await db
    .prepare("SELECT time_hhmm as timeHHMM, message, enabled FROM sleep_settings WHERE user_id = ?")
    .get(req.user.id);
  if (!row) return res.json({ settings: null });
  return res.json({ settings: { ...row, enabled: !!row.enabled } });
});

