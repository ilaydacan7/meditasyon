import express from "express";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { requireAuth } from "../middleware/auth.js";

export const chatRouter = express.Router();

const BodySchema = z.object({
  message: z.string().min(1).max(2000),
});

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (String(key).toLowerCase().startsWith("replace")) return null;
  return new GoogleGenerativeAI(key);
}

function systemPrompt() {
  return [
    "Sen Gaia uygulamasında çalışan bir içerik uzmanısın (meditasyon, nefes, uyku rutini, duygu düzenleme).",
    "Tonun: yumuşak, kısa, destekleyici ve yargılamayan.",
    "Kullanıcıdan kişisel veri isteme. Teşhis koyma. Tıbbi/psikiyatrik tavsiye verme.",
    "Kriz/zarar verme niyeti veya acil durum varsa, profesyonel yardım ve acil hatlara yönlendir.",
    "Yanıtları Türkçe ver ve mümkünse 3-6 maddelik uygulanabilir öneriler sun.",
  ].join("\n");
}

chatRouter.post("/", requireAuth, async (req, res) => {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

  const client = getClient();
  if (!client) return res.status(500).json({ error: "gemini_not_configured" });

  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt(),
    });

    const result = await model.generateContent(parsed.data.message);
    const text = result?.response?.text?.() || "";
    return res.json({ reply: text.trim() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "gemini_error" });
  }
});

