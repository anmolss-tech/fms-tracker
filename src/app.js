import "dotenv/config";
import crypto from "crypto";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "fms_tracker";
const ADMIN_TOKEN = String(process.env.TRACKER_API_TOKEN || "").trim();
const MAX_WEEKS_PER_REQUEST = 12;
const GLOBAL_CACHE_KEY = "__fmsTrackerMongoCacheV4";

function getCache() {
  if (!globalThis[GLOBAL_CACHE_KEY]) {
    globalThis[GLOBAL_CACHE_KEY] = { clientPromise: null, indexesReady: false };
  }
  return globalThis[GLOBAL_CACHE_KEY];
}

async function getMongo() {
  if (!MONGODB_URI) throw new Error("Missing MONGODB_URI environment variable.");
  const cache = getCache();
  if (!cache.clientPromise) {
    const client = new MongoClient(MONGODB_URI, { maxPoolSize: 10, minPoolSize: 0 });
    cache.clientPromise = client.connect().then(() => client).catch((error) => {
      cache.clientPromise = null;
      throw error;
    });
  }
  const client = await cache.clientPromise;
  const db = client.db(DB_NAME);
  const collections = {
    users: db.collection("users"),
    devices: db.collection("devices"),
    weekly: db.collection("weekly_activity"),
    commands: db.collection("device_commands"),
    live: db.collection("device_live_state"),
    // Kept only so older v1.2 APKs do not immediately break during migration.
    usage: db.collection("usage_events"),
    phone: db.collection("phone_calls"),
    whatsapp: db.collection("whatsapp_calls"),
    french: db.collection("french_sessions"),
  };

  if (!cache.indexesReady) {
    await Promise.all([
      collections.users.createIndex({ userId: 1 }, { unique: true }),
      collections.devices.createIndex({ deviceId: 1 }, { unique: true }),
      collections.devices.createIndex({ userId: 1, deviceName: 1 }),
      collections.weekly.createIndex({ userId: 1, deviceId: 1, weekStart: 1 }, { unique: true }),
      collections.weekly.createIndex({ userId: 1, weekStart: -1 }),
      collections.commands.createIndex({ commandId: 1 }, { unique: true }),
      collections.commands.createIndex({ deviceId: 1, status: 1, createdAt: -1 }),
      collections.commands.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }),
      collections.live.createIndex({ deviceId: 1 }, { unique: true }),
      collections.usage.createIndex({ deviceId: 1, eventId: 1 }, { unique: true }),
      collections.phone.createIndex({ deviceId: 1, eventId: 1 }, { unique: true }),
      collections.whatsapp.createIndex({ deviceId: 1, eventId: 1 }, { unique: true }),
      collections.french.createIndex({ deviceId: 1, sessionId: 1 }, { unique: true }),
    ]);
    cache.indexesReady = true;
  }
  return { db, collections };
}

const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(express.json({ limit: "4mb" }));
app.use(express.static("public", { maxAge: "5m", etag: true }));

function cleanText(value, maxLength = 200) {
  if (value == null) return null;
  return String(value).trim().slice(0, maxLength);
}
function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  if (String(req.headers.authorization || "") !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

async function requireDevice(req, res, next) {
  try {
    const deviceId = cleanText(req.headers["x-device-id"], 180);
    const secret = cleanText(req.headers["x-device-secret"], 300);
    if (!deviceId || !secret) return res.status(401).json({ ok: false, error: "Missing device credentials" });
    const { collections } = await getMongo();
    const device = await collections.devices.findOne({ deviceId, secretHash: sha256(secret) });
    if (!device) return res.status(401).json({ ok: false, error: "Invalid device credentials" });
    req.trackerDevice = device;
    next();
  } catch (error) {
    console.error("Device auth error:", error);
    res.status(500).json({ ok: false, error: "Device authentication failed" });
  }
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "French Made Simple tracker API",
    version: "1.7.0",
    node: process.version,
    hosting: process.env.VERCEL ? "vercel" : "node",
    syncPolicy: "weekly-summary-with-heart-checkpoints",
    contentManifest: "/content/manifest.json",
    dashboard: "/dashboard/",
    remoteDevicePolicy: "live-call-heartbeat + queued-snapshot-commands",
  });
});

app.get("/health", async (_req, res) => {
  try {
    const { db } = await getMongo();
    await db.command({ ping: 1 });
    res.json({ ok: true, database: DB_NAME, version: "1.7.0", node: process.version, hosting: process.env.VERCEL ? "vercel" : "node", time: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Private-test bootstrap: the server issues a per-installation secret once the user saves a profile.
// No shared secret has to be embedded into the APK.
app.post("/api/v1/devices/register", async (req, res) => {
  try {
    const userId = cleanText(req.body?.userId, 80);
    const userName = cleanText(req.body?.userName, 120);
    const deviceId = cleanText(req.body?.deviceId, 180);
    const deviceName = cleanText(req.body?.deviceName, 180);
    if (!userId || !userName || !deviceId || !deviceName) {
      return res.status(400).json({ ok: false, error: "userId, userName, deviceId and deviceName are required" });
    }

    const secret = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const { collections } = await getMongo();
    await Promise.all([
      collections.users.updateOne(
        { userId },
        { $set: { userId, userName, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      ),
      collections.devices.updateOne(
        { deviceId },
        {
          $set: { deviceId, deviceName, userId, userName, secretHash: sha256(secret), lastRegisteredAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      ),
    ]);
    res.json({ ok: true, deviceId, deviceSecret: secret });
  } catch (error) {
    console.error("Register device error:", error);
    res.status(500).json({ ok: false, error: "Device registration failed" });
  }
});

function normalizeSession(item) {
  const startedAt = safeDate(item?.startedAt);
  const endedAt = safeDate(item?.endedAt);
  if (!startedAt || !endedAt || endedAt <= startedAt) return null;
  return {
    startedAt,
    endedAt,
    durationSeconds: Math.max(0, Math.round(finite(item?.durationSeconds))),
  };
}

function normalizeWeek(week, identity) {
  const weekStart = cleanText(week?.weekStart, 20);
  const weekEnd = cleanText(week?.weekEnd, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart || "") || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd || "")) return null;

  const apps = Array.isArray(week.apps) ? week.apps.slice(0, 300).map((appRow) => ({
    packageName: cleanText(appRow?.packageName, 220) || "unknown",
    appName: cleanText(appRow?.appName, 220) || "Unknown app",
    category: cleanText(appRow?.category, 40) || "unknown",
    totalSeconds: Math.max(0, Math.round(finite(appRow?.totalSeconds))),
    days: Array.isArray(appRow?.days) ? appRow.days.slice(0, 7).map((day) => ({
      date: cleanText(day?.date, 20),
      totalSeconds: Math.max(0, Math.round(finite(day?.totalSeconds))),
      sessions: Array.isArray(day?.sessions) ? day.sessions.slice(0, 200).map(normalizeSession).filter(Boolean) : [],
    })) : [],
  })) : [];

  const calls = Array.isArray(week.phoneCalls) ? week.phoneCalls.slice(0, 1000).map((call) => ({
    eventId: cleanText(call?.eventId, 120),
    phoneNumber: cleanText(call?.phoneNumber, 80),
    contactName: cleanText(call?.contactName, 220),
    direction: cleanText(call?.direction, 40) || "other",
    startedAt: safeDate(call?.startedAt),
    durationSeconds: Math.max(0, Math.round(finite(call?.durationSeconds))),
  })).filter((call) => call.eventId && call.startedAt) : [];

  const whatsappCalls = Array.isArray(week.whatsappCalls) ? week.whatsappCalls.slice(0, 1000).map((call) => ({
    eventId: cleanText(call?.eventId, 120),
    contactName: cleanText(call?.contactName, 220),
    phoneNumber: cleanText(call?.phoneNumber, 80),
    direction: cleanText(call?.direction, 40) || "unknown",
    startedAt: safeDate(call?.startedAt),
    durationSeconds: Math.max(0, Math.round(finite(call?.durationSeconds))),
    matchConfidence: cleanText(call?.matchConfidence, 80),
  })).filter((call) => call.eventId && call.startedAt) : [];

  const messages = Array.isArray(week?.messages) ? week.messages.slice(0, 1500).map((item) => ({
    packageName: cleanText(item?.packageName, 220) || "unknown",
    appName: cleanText(item?.appName, 220) || "Unknown app",
    date: cleanText(item?.date, 20),
    senderName: cleanText(item?.senderName, 220),
    phoneNumber: cleanText(item?.phoneNumber, 80),
    matchConfidence: cleanText(item?.matchConfidence, 80),
    incomingCount: Math.max(0, Math.round(finite(item?.incomingCount))),
    firstAt: safeDate(item?.firstAt),
    lastAt: safeDate(item?.lastAt),
  })).filter((item) => item.date && item.incomingCount > 0) : [];

  const frenchDays = Array.isArray(week?.french?.days) ? week.french.days.slice(0, 7).map((day) => ({
    date: cleanText(day?.date, 20),
    studySeconds: Math.max(0, Math.round(finite(day?.studySeconds))),
    cardsPracticed: Math.max(0, Math.round(finite(day?.cardsPracticed))),
    sessions: Math.max(0, Math.round(finite(day?.sessions))),
  })) : [];

  const pandaDays = Array.isArray(week?.panda?.days) ? week.panda.days.slice(0, 7).map((day) => ({
    date: cleanText(day?.date, 20),
    count: Math.max(0, Math.round(finite(day?.count))),
  })).filter((day) => day.date) : [];

  return {
    userId: identity.userId,
    userName: identity.userName,
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    weekStart,
    weekEnd,
    apps,
    phoneCalls: calls,
    whatsappCalls,
    messages,
    french: {
      studySeconds: Math.max(0, Math.round(finite(week?.french?.studySeconds))),
      cardsPracticed: Math.max(0, Math.round(finite(week?.french?.cardsPracticed))),
      sessions: Math.max(0, Math.round(finite(week?.french?.sessions))),
      days: frenchDays,
    },
    panda: {
      checkins: Math.max(0, Math.round(finite(week?.panda?.checkins))),
      days: pandaDays,
    },
    updatedAt: new Date(),
  };
}

app.post("/api/v1/sync/weekly", requireDevice, async (req, res) => {
  try {
    const device = req.trackerDevice;
    const userId = cleanText(req.body?.userId, 80);
    const deviceId = cleanText(req.body?.deviceId, 180);
    if (userId !== device.userId || deviceId !== device.deviceId) {
      return res.status(403).json({ ok: false, error: "Identity does not match registered device" });
    }
    const syncReason = cleanText(req.body?.syncReason, 40) || "weekly";
    const weeks = (Array.isArray(req.body?.weeks) ? req.body.weeks : [])
      .slice(0, MAX_WEEKS_PER_REQUEST)
      .map((week) => normalizeWeek(week, device))
      .filter(Boolean)
      .map((week) => ({ ...week, lastSyncReason: syncReason }));
    if (!weeks.length) return res.json({ ok: true, acceptedWeekStarts: [] });

    const { collections } = await getMongo();
    await collections.weekly.bulkWrite(weeks.map((week) => ({
      updateOne: {
        filter: { userId: week.userId, deviceId: week.deviceId, weekStart: week.weekStart },
        update: { $set: week, $setOnInsert: { createdAt: new Date() } },
        upsert: true,
      },
    })), { ordered: false });

    const now = new Date();
    await Promise.all([
      collections.users.updateOne({ userId: device.userId }, { $set: { lastSyncAt: now, userName: device.userName } }),
      collections.devices.updateOne(
        { deviceId: device.deviceId },
        { $set: { lastSyncAt: now, lastSyncReason: syncReason, ...(syncReason === "heart-checkpoint" ? { lastCheckpointAt: now } : {}), lastSeenIp: req.ip } }
      ),
    ]);
    res.json({ ok: true, acceptedWeekStarts: weeks.map((week) => week.weekStart) });
  } catch (error) {
    console.error("Weekly sync error:", error);
    res.status(500).json({ ok: false, error: "Weekly sync failed" });
  }
});


// Device live/current-call heartbeat. This is sent by the notification listener whenever
// Android exposes an ongoing regular or WhatsApp call notification. It is intentionally
// lightweight and does not upload call audio or message bodies.
app.post("/api/v1/device/live-call", requireDevice, async (req, res) => {
  try {
    const device = req.trackerDevice;
    const call = req.body?.currentCall && typeof req.body.currentCall === "object" ? req.body.currentCall : {};
    const now = new Date();
    const currentCall = {
      active: Boolean(call.active),
      type: cleanText(call.type, 40) || "none",
      contactName: cleanText(call.contactName, 220),
      phoneNumber: cleanText(call.phoneNumber, 80),
      direction: cleanText(call.direction, 40) || "unknown",
      startedAt: call.startedAt ? new Date(finite(call.startedAt)) : null,
      durationSeconds: Math.max(0, Math.round(finite(call.durationSeconds))),
      confidence: cleanText(call.confidence, 80) || "unknown",
      descriptor: cleanText(call.descriptor, 260),
      detection: cleanText(call.detection, 80),
      packageName: cleanText(call.packageName, 220),
    };
    const { collections } = await getMongo();
    await Promise.all([
      collections.live.updateOne(
        { deviceId: device.deviceId },
        { $set: { deviceId: device.deviceId, userId: device.userId, userName: device.userName, deviceName: device.deviceName, currentCall, observedAt: now, sourceHint: cleanText(req.body?.sourceHint, 80) } },
        { upsert: true }
      ),
      collections.devices.updateOne({ deviceId: device.deviceId }, { $set: { lastSeenAt: now } }),
    ]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Live call update error:", error);
    res.status(500).json({ ok: false, error: "Could not update live call" });
  }
});

// Device-side command polling. Dashboard requests are queued here. Android also checks
// this queue from notification activity, app foreground, and a 15-minute WorkManager fallback.
app.get("/api/v1/device/commands/pending", requireDevice, async (req, res) => {
  try {
    const device = req.trackerDevice;
    const { collections } = await getMongo();
    const commands = await collections.commands.find(
      { deviceId: device.deviceId, status: "pending" },
      { projection: { _id: 0, commandId: 1, type: 1, createdAt: 1 } }
    ).sort({ createdAt: 1 }).limit(5).toArray();
    await collections.devices.updateOne({ deviceId: device.deviceId }, { $set: { lastSeenAt: new Date() } });
    res.json({ ok: true, commands });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Could not load pending commands" });
  }
});

app.post("/api/v1/device/commands/:commandId/result", requireDevice, async (req, res) => {
  try {
    const device = req.trackerDevice;
    const commandId = cleanText(req.params.commandId, 120);
    const { collections } = await getMongo();
    const command = await collections.commands.findOne({ commandId, deviceId: device.deviceId });
    if (!command) return res.status(404).json({ ok: false, error: "Command not found" });
    const result = req.body?.result && typeof req.body.result === "object" ? req.body.result : {};
    const completedAt = new Date();
    await collections.commands.updateOne(
      { commandId, deviceId: device.deviceId },
      { $set: { status: "completed", completedAt, result } }
    );
    await collections.devices.updateOne(
      { deviceId: device.deviceId },
      { $set: { lastSeenAt: completedAt, lastRemoteSnapshotAt: completedAt } }
    );
    if (result.currentCall) {
      const c = result.currentCall;
      await collections.live.updateOne(
        { deviceId: device.deviceId },
        { $set: {
          deviceId: device.deviceId, userId: device.userId, userName: device.userName, deviceName: device.deviceName,
          currentCall: {
            active: Boolean(c.active), type: cleanText(c.type, 40) || "none", contactName: cleanText(c.contactName, 220),
            phoneNumber: cleanText(c.phoneNumber, 80), direction: cleanText(c.direction, 40) || "unknown",
            startedAt: c.startedAt ? new Date(finite(c.startedAt)) : null, durationSeconds: Math.max(0, Math.round(finite(c.durationSeconds))),
            confidence: cleanText(c.confidence, 80) || "unknown", descriptor: cleanText(c.descriptor, 260),
            detection: cleanText(c.detection, 80), packageName: cleanText(c.packageName, 220)
          }, observedAt: completedAt, sourceHint: "command_result"
        }}, { upsert: true }
      );
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Could not save command result" });
  }
});

app.post("/api/v1/admin/devices/:deviceId/commands", requireAdmin, async (req, res) => {
  try {
    const deviceId = cleanText(req.params.deviceId, 180);
    const type = cleanText(req.body?.type, 40) || "refresh_logs";
    if (!['refresh_logs','current_call'].includes(type)) return res.status(400).json({ ok: false, error: "Unsupported command" });
    const { collections } = await getMongo();
    const device = await collections.devices.findOne({ deviceId }, { projection: { _id: 0, secretHash: 0, lastSeenIp: 0 } });
    if (!device) return res.status(404).json({ ok: false, error: "Device not found" });
    const commandId = crypto.randomUUID();
    const now = new Date();
    await collections.commands.insertOne({ commandId, deviceId, userId: device.userId, type, status: "pending", createdAt: now });
    res.json({ ok: true, commandId, type, status: "pending", note: "The device processes this on its next background wake/notification, app foreground, or periodic command check." });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Could not queue command" });
  }
});

app.get("/api/v1/admin/commands/:commandId", requireAdmin, async (req, res) => {
  try {
    const commandId = cleanText(req.params.commandId, 120);
    const { collections } = await getMongo();
    const command = await collections.commands.findOne({ commandId }, { projection: { _id: 0 } });
    if (!command) return res.status(404).json({ ok: false, error: "Command not found" });
    res.json({ ok: true, command });
  } catch (error) { res.status(500).json({ ok: false, error: "Could not load command" }); }
});

app.get("/api/v1/admin/devices/:deviceId/live", requireAdmin, async (req, res) => {
  try {
    const deviceId = cleanText(req.params.deviceId, 180);
    const { collections } = await getMongo();
    const [device, live] = await Promise.all([
      collections.devices.findOne({ deviceId }, { projection: { _id: 0, secretHash: 0, lastSeenIp: 0 } }),
      collections.live.findOne({ deviceId }, { projection: { _id: 0 } }),
    ]);
    if (!device) return res.status(404).json({ ok: false, error: "Device not found" });
    if (live?.currentCall?.active && live.currentCall.startedAt) {
      const startedMs = new Date(live.currentCall.startedAt).getTime();
      if (Number.isFinite(startedMs) && startedMs > 0) {
        live.currentCall.durationSeconds = Math.max(
          Number(live.currentCall.durationSeconds || 0),
          Math.floor((Date.now() - startedMs) / 1000)
        );
      }
    }
    res.json({ ok: true, device, live: live || null, serverNow: new Date() });
  } catch (error) { res.status(500).json({ ok: false, error: "Could not load live device state" }); }
});

app.get("/api/v1/users", requireAdmin, async (_req, res) => {
  try {
    const { collections } = await getMongo();
    const users = await collections.users.find({}, { projection: { _id: 0 } }).sort({ userName: 1 }).toArray();
    res.json({ ok: true, users });
  } catch (error) { res.status(500).json({ ok: false, error: "Could not load users" }); }
});

app.get("/api/v1/devices", requireAdmin, async (req, res) => {
  try {
    const userId = cleanText(req.query?.userId, 80);
    if (!userId) return res.status(400).json({ ok: false, error: "userId is required" });
    const { collections } = await getMongo();
    const devices = await collections.devices.find({ userId }, { projection: { _id: 0, secretHash: 0, lastSeenIp: 0 } }).toArray();
    res.json({ ok: true, devices });
  } catch (error) { res.status(500).json({ ok: false, error: "Could not load devices" }); }
});

app.get("/api/v1/dashboard/summary", requireAdmin, async (req, res) => {
  try {
    const userId = cleanText(req.query?.userId, 80);
    const deviceId = cleanText(req.query?.deviceId, 180);
    if (!userId) return res.status(400).json({ ok: false, error: "userId is required" });
    const requestedWeeks = Math.min(52, Math.max(1, Math.round(finite(req.query?.weeks, 4))));
    const from = new Date();
    from.setDate(from.getDate() - requestedWeeks * 7);
    const fromKey = from.toISOString().slice(0, 10);
    const { collections } = await getMongo();
    const docs = await collections.weekly.find({
      userId,
      weekStart: { $gte: fromKey },
      ...(deviceId ? { deviceId } : {}),
    }, { projection: { _id: 0 } }).sort({ weekStart: -1 }).toArray();
    res.json({ ok: true, userId, deviceId: deviceId || null, weeks: docs });
  } catch (error) { res.status(500).json({ ok: false, error: "Dashboard summary failed" }); }
});

function normalizeLegacyIdentity(body) {
  const userId = cleanText(body?.userId, 80);
  const userName = cleanText(body?.userName, 120);
  const deviceId = cleanText(body?.deviceId, 180);
  const deviceName = cleanText(body?.deviceName, 180);
  return userId && userName && deviceId && deviceName ? { userId, userName, deviceId, deviceName } : null;
}

async function legacyUpsertMany(collection, records, idField) {
  if (!records.length) return [];
  await collection.bulkWrite(records.map((record) => ({
    updateOne: {
      filter: { deviceId: record.deviceId, [idField]: record[idField] },
      update: { $set: record, $setOnInsert: { createdAt: new Date() } },
      upsert: true,
    },
  })), { ordered: false });
  return records.map((record) => record[idField]);
}

// Temporary v1.2 compatibility while the new APK is being rolled out.
app.post("/api/v1/sync/batch", requireAdmin, async (req, res) => {
  try {
    const identity = normalizeLegacyIdentity(req.body);
    if (!identity) return res.status(400).json({ ok: false, error: "Missing identity" });
    const { collections } = await getMongo();
    const usage = (Array.isArray(req.body?.usageEvents) ? req.body.usageEvents : []).slice(0, 500).map((item) => ({
      ...identity, eventId: cleanText(item?.eventId, 120), packageName: cleanText(item?.packageName, 220) || "unknown",
      appName: cleanText(item?.appName, 220) || "Unknown app", category: cleanText(item?.category, 40) || "unknown",
      startedAt: new Date(finite(item?.startedAt)), endedAt: new Date(finite(item?.endedAt)), durationSeconds: Math.max(0, Math.round(finite(item?.durationSeconds))), updatedAt: new Date(),
    })).filter((item) => item.eventId);
    const phone = (Array.isArray(req.body?.phoneCalls) ? req.body.phoneCalls : []).slice(0, 500).map((item) => ({
      ...identity, eventId: cleanText(item?.eventId, 120), phoneNumberMasked: cleanText(item?.phoneNumberMasked, 80), contactName: cleanText(item?.contactName, 220),
      direction: cleanText(item?.direction, 40) || "other", category: cleanText(item?.category, 40) || "social", source: cleanText(item?.source, 80) || "call_log",
      startedAt: new Date(finite(item?.startedAt)), durationSeconds: Math.max(0, Math.round(finite(item?.durationSeconds))), updatedAt: new Date(),
    })).filter((item) => item.eventId);
    const whatsapp = (Array.isArray(req.body?.whatsappCalls) ? req.body.whatsappCalls : []).slice(0, 500).map((item) => ({
      ...identity, eventId: cleanText(item?.eventId, 120), packageName: cleanText(item?.packageName, 220) || "com.whatsapp", contactLabel: cleanText(item?.contactLabel, 220),
      direction: cleanText(item?.direction, 40) || "unknown", category: cleanText(item?.category, 40) || "social", source: cleanText(item?.source, 80) || "best_effort_notification",
      confidence: cleanText(item?.confidence, 80) || "best_effort_notification", startedAt: new Date(finite(item?.startedAt)), endedAt: new Date(finite(item?.endedAt)),
      durationSeconds: Math.max(0, Math.round(finite(item?.durationSeconds))), updatedAt: new Date(),
    })).filter((item) => item.eventId);
    const french = (Array.isArray(req.body?.frenchSessions) ? req.body.frenchSessions : []).slice(0, 500).map((item) => ({
      ...identity, sessionId: cleanText(item?.sessionId, 120), startedAt: new Date(finite(item?.startedAt)), endedAt: new Date(finite(item?.endedAt)),
      durationSeconds: Math.max(0, Math.round(finite(item?.durationSeconds))), cardsPracticed: Math.max(0, Math.round(finite(item?.cardsPracticed))), updatedAt: new Date(),
    })).filter((item) => item.sessionId);
    const [usageEventIds, phoneCallIds, whatsappCallIds, frenchSessionIds] = await Promise.all([
      legacyUpsertMany(collections.usage, usage, "eventId"), legacyUpsertMany(collections.phone, phone, "eventId"),
      legacyUpsertMany(collections.whatsapp, whatsapp, "eventId"), legacyUpsertMany(collections.french, french, "sessionId"),
    ]);
    res.json({ ok: true, accepted: { usageEventIds, phoneCallIds, whatsappCallIds, frenchSessionIds } });
  } catch (error) {
    console.error("Legacy sync error:", error);
    res.status(500).json({ ok: false, error: "Legacy sync failed" });
  }
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled tracker API error:", error);
  if (!res.headersSent) res.status(500).json({ ok: false, error: "Internal server error" });
});

export default app;
