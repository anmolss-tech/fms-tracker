import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "fms_tracker";
const API_TOKEN = String(process.env.TRACKER_API_TOKEN || "").trim();
const MAX_BATCH = 500;

const GLOBAL_CACHE_KEY = "__fmsTrackerMongoCacheV2";

function getCache() {
  if (!globalThis[GLOBAL_CACHE_KEY]) {
    globalThis[GLOBAL_CACHE_KEY] = {
      clientPromise: null,
      indexesReady: false,
    };
  }
  return globalThis[GLOBAL_CACHE_KEY];
}

async function getMongo() {
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  const cache = getCache();
  if (!cache.clientPromise) {
    const client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 0,
    });
    cache.clientPromise = client.connect()
      .then(() => client)
      .catch((error) => {
        cache.clientPromise = null;
        throw error;
      });
  }

  const client = await cache.clientPromise;
  const db = client.db(DB_NAME);
  const collections = {
    usage: db.collection("usage_events"),
    phone: db.collection("phone_calls"),
    whatsapp: db.collection("whatsapp_calls"),
    french: db.collection("french_sessions"),
    users: db.collection("users"),
    devices: db.collection("devices"),
  };

  if (!cache.indexesReady) {
    await Promise.all([
      collections.usage.createIndex({ deviceId: 1, eventId: 1 }, { unique: true }),
      collections.phone.createIndex({ deviceId: 1, eventId: 1 }, { unique: true }),
      collections.whatsapp.createIndex({ deviceId: 1, eventId: 1 }, { unique: true }),
      collections.french.createIndex({ deviceId: 1, sessionId: 1 }, { unique: true }),
      collections.usage.createIndex({ userId: 1, startedAt: -1 }),
      collections.phone.createIndex({ userId: 1, startedAt: -1 }),
      collections.whatsapp.createIndex({ userId: 1, startedAt: -1 }),
      collections.french.createIndex({ userId: 1, startedAt: -1 }),
      collections.users.createIndex({ userId: 1 }, { unique: true }),
      collections.devices.createIndex({ deviceId: 1 }, { unique: true }),
      collections.devices.createIndex({ userId: 1, deviceName: 1 }),
    ]);
    cache.indexesReady = true;
  }

  return { client, db, collections };
}

const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(express.json({ limit: "4mb" }));

function requireToken(req, res, next) {
  if (!API_TOKEN) return next();
  const value = String(req.headers.authorization || "");
  if (value !== `Bearer ${API_TOKEN}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

function safeArray(value) {
  return Array.isArray(value) ? value.slice(0, MAX_BATCH) : [];
}

function asFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value, maxLength = 200) {
  if (value == null) return null;
  return String(value).trim().slice(0, maxLength);
}

function normalizeIdentity(body) {
  const userId = cleanText(body?.userId, 80);
  const userName = cleanText(body?.userName, 120);
  const deviceId = cleanText(body?.deviceId, 160);
  const deviceName = cleanText(body?.deviceName, 160);
  if (!userId || !userName || !deviceId || !deviceName) return null;
  return { userId, userName, deviceId, deviceName };
}

function normalizeUsage(item, identity) {
  const eventId = cleanText(item?.eventId, 120);
  if (!eventId) return null;
  return {
    userId: identity.userId,
    deviceId: identity.deviceId,
    eventId,
    packageName: cleanText(item.packageName, 200) || "unknown",
    appName: cleanText(item.appName, 200) || "Unknown app",
    category: cleanText(item.category, 40) || "unknown",
    startedAt: new Date(asFiniteNumber(item.startedAt)),
    endedAt: new Date(asFiniteNumber(item.endedAt)),
    durationSeconds: Math.max(0, Math.round(asFiniteNumber(item.durationSeconds))),
    updatedAt: new Date(),
  };
}

function normalizePhone(item, identity) {
  const eventId = cleanText(item?.eventId, 120);
  if (!eventId) return null;
  return {
    userId: identity.userId,
    deviceId: identity.deviceId,
    eventId,
    phoneNumberMasked: cleanText(item.phoneNumberMasked, 30),
    contactName: cleanText(item.contactName, 200),
    direction: cleanText(item.direction, 40) || "other",
    category: cleanText(item.category, 40) || "social",
    source: cleanText(item.source, 80) || "call_log",
    startedAt: new Date(asFiniteNumber(item.startedAt)),
    durationSeconds: Math.max(0, Math.round(asFiniteNumber(item.durationSeconds))),
    updatedAt: new Date(),
  };
}

function normalizeWhatsApp(item, identity) {
  const eventId = cleanText(item?.eventId, 120);
  if (!eventId) return null;
  return {
    userId: identity.userId,
    deviceId: identity.deviceId,
    eventId,
    packageName: cleanText(item.packageName, 200) || "com.whatsapp",
    contactLabel: cleanText(item.contactLabel, 200),
    direction: cleanText(item.direction, 40) || "unknown",
    category: cleanText(item.category, 40) || "social",
    source: cleanText(item.source, 80) || "best_effort_notification",
    confidence: cleanText(item.confidence, 80) || "best_effort_notification",
    startedAt: new Date(asFiniteNumber(item.startedAt)),
    endedAt: new Date(asFiniteNumber(item.endedAt)),
    durationSeconds: Math.max(0, Math.round(asFiniteNumber(item.durationSeconds))),
    updatedAt: new Date(),
  };
}

function normalizeFrench(item, identity) {
  const sessionId = cleanText(item?.sessionId, 120);
  if (!sessionId) return null;
  return {
    userId: identity.userId,
    deviceId: identity.deviceId,
    sessionId,
    startedAt: new Date(asFiniteNumber(item.startedAt)),
    endedAt: new Date(asFiniteNumber(item.endedAt)),
    durationSeconds: Math.max(0, Math.round(asFiniteNumber(item.durationSeconds))),
    cardsPracticed: Math.max(0, Math.round(asFiniteNumber(item.cardsPracticed))),
    updatedAt: new Date(),
  };
}

async function upsertMany(collection, records, idField) {
  if (!records.length) return [];
  const operations = records.map((record) => ({
    updateOne: {
      filter: { deviceId: record.deviceId, [idField]: record[idField] },
      update: {
        $set: record,
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  }));
  await collection.bulkWrite(operations, { ordered: false });
  return records.map((record) => record[idField]);
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "French Made Simple tracker API",
    hosting: process.env.VERCEL ? "vercel" : "node",
    syncPolicy: "weekly-client-batch",
  });
});

app.get("/health", async (_req, res) => {
  try {
    const { db } = await getMongo();
    await db.command({ ping: 1 });
    res.json({
      ok: true,
      database: DB_NAME,
      hosting: process.env.VERCEL ? "vercel" : "node",
      time: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/v1/users", requireToken, async (_req, res) => {
  try {
    const { collections } = await getMongo();
    const users = await collections.users
      .find({}, { projection: { _id: 0 } })
      .sort({ userName: 1 })
      .toArray();
    res.json({ ok: true, users });
  } catch (error) {
    console.error("Users error:", error);
    res.status(500).json({ ok: false, error: "Could not load users" });
  }
});

app.get("/api/v1/devices", requireToken, async (req, res) => {
  try {
    const userId = cleanText(req.query?.userId, 80);
    if (!userId) return res.status(400).json({ ok: false, error: "userId is required" });
    const { collections } = await getMongo();
    const devices = await collections.devices
      .find({ userId }, { projection: { _id: 0, lastSeenIp: 0 } })
      .sort({ lastSyncAt: -1 })
      .toArray();
    res.json({ ok: true, userId, devices });
  } catch (error) {
    console.error("Devices error:", error);
    res.status(500).json({ ok: false, error: "Could not load devices" });
  }
});

app.get("/api/v1/dashboard/summary", requireToken, async (req, res) => {
  try {
    const userId = cleanText(req.query?.userId, 80);
    const deviceId = cleanText(req.query?.deviceId, 160);
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId is required" });
    }

    const requestedDays = Math.round(asFiniteNumber(req.query?.days, 7));
    const days = Math.min(365, Math.max(1, requestedDays));
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = {
      userId,
      startedAt: { $gte: from },
      ...(deviceId ? { deviceId } : {}),
    };

    const { collections } = await getMongo();
    const [categoryRows, appRows, phoneRows, whatsappRows, frenchRows] = await Promise.all([
      collections.usage.aggregate([
        { $match: match },
        { $group: { _id: "$category", seconds: { $sum: "$durationSeconds" } } },
        { $sort: { seconds: -1 } },
      ]).toArray(),
      collections.usage.aggregate([
        { $match: match },
        { $group: { _id: { packageName: "$packageName", appName: "$appName", category: "$category" }, seconds: { $sum: "$durationSeconds" } } },
        { $sort: { seconds: -1 } },
        { $limit: 12 },
      ]).toArray(),
      collections.phone.aggregate([
        { $match: match },
        { $group: { _id: null, seconds: { $sum: "$durationSeconds" }, count: { $sum: 1 } } },
      ]).toArray(),
      collections.whatsapp.aggregate([
        { $match: match },
        { $group: { _id: null, seconds: { $sum: "$durationSeconds" }, count: { $sum: 1 } } },
      ]).toArray(),
      collections.french.aggregate([
        { $match: match },
        { $group: { _id: null, seconds: { $sum: "$durationSeconds" }, cards: { $sum: "$cardsPracticed" }, sessions: { $sum: 1 } } },
      ]).toArray(),
    ]);

    const categories = Object.fromEntries(
      categoryRows.map((row) => [row._id || "unknown", row.seconds || 0])
    );
    const trackedSeconds = Object.values(categories).reduce(
      (sum, value) => sum + Number(value || 0),
      0
    );
    const distractingSeconds = Number(categories.distracting || 0);
    const procrastinationScore = trackedSeconds > 0
      ? Math.round((distractingSeconds / trackedSeconds) * 100)
      : 0;

    res.json({
      ok: true,
      userId,
      deviceId: deviceId || null,
      days,
      from: from.toISOString(),
      to: new Date().toISOString(),
      trackedSeconds,
      distractingSeconds,
      procrastinationScore,
      categories,
      topApps: appRows.map((row) => ({
        packageName: row._id.packageName,
        appName: row._id.appName,
        category: row._id.category,
        seconds: row.seconds || 0,
      })),
      phoneCalls: phoneRows[0] || { seconds: 0, count: 0 },
      whatsappCalls: whatsappRows[0] || { seconds: 0, count: 0 },
      french: frenchRows[0] || { seconds: 0, cards: 0, sessions: 0 },
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    res.status(500).json({ ok: false, error: "Dashboard summary failed" });
  }
});

app.post("/api/v1/sync/batch", requireToken, async (req, res) => {
  try {
    const identity = normalizeIdentity(req.body);
    if (!identity) {
      return res.status(400).json({
        ok: false,
        error: "userId, userName, deviceId and deviceName are required",
      });
    }

    const usage = safeArray(req.body.usageEvents)
      .map((item) => normalizeUsage(item, identity))
      .filter(Boolean);
    const phone = safeArray(req.body.phoneCalls)
      .map((item) => normalizePhone(item, identity))
      .filter(Boolean);
    const whatsapp = safeArray(req.body.whatsappCalls)
      .map((item) => normalizeWhatsApp(item, identity))
      .filter(Boolean);
    const french = safeArray(req.body.frenchSessions)
      .map((item) => normalizeFrench(item, identity))
      .filter(Boolean);

    const { collections } = await getMongo();
    const [usageEventIds, phoneCallIds, whatsappCallIds, frenchSessionIds] = await Promise.all([
      upsertMany(collections.usage, usage, "eventId"),
      upsertMany(collections.phone, phone, "eventId"),
      upsertMany(collections.whatsapp, whatsapp, "eventId"),
      upsertMany(collections.french, french, "sessionId"),
    ]);

    const now = new Date();
    await Promise.all([
      collections.users.updateOne(
        { userId: identity.userId },
        {
          $set: {
            userId: identity.userId,
            userName: identity.userName,
            lastSyncAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      ),
      collections.devices.updateOne(
        { deviceId: identity.deviceId },
        {
          $set: {
            deviceId: identity.deviceId,
            deviceName: identity.deviceName,
            userId: identity.userId,
            userName: identity.userName,
            lastSyncAt: now,
            lastSeenIp: req.ip,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      ),
    ]);

    res.json({
      ok: true,
      identity,
      accepted: {
        usageEventIds,
        phoneCallIds,
        whatsappCallIds,
        frenchSessionIds,
      },
    });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ ok: false, error: "Sync failed" });
  }
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled tracker API error:", error);
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

export default app;
