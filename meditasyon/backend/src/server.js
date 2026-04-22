import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

import { initDb } from "./storage/db.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { moodsRouter } from "./routes/moods.js";
import { sleepRouter } from "./routes/sleep.js";
import { chatRouter } from "./routes/chat.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:8080";

app.use(helmet());
app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api", meRouter);
app.use("/api/moods", moodsRouter);
app.use("/api/sleep", sleepRouter);
app.use("/api/chat", chatRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

await initDb();

app.listen(port, () => {
  console.log(`[gaia-backend] listening on http://localhost:${port}`);
});

