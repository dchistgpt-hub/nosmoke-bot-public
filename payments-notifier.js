/**
 * /app/payments-notifier.js
 * Рассылает сообщения покупателю и админу по успешным платежам.
 * Идём по коллекции "payments" и отмечаем отправленные уведомления флагами.
 */

require("dotenv").config();
const https = require("node:https");
const { MongoClient } = require("mongodb");

const TG_TOKEN =
  process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN || process.env.TELEGRAM_TOKEN || "";

const ADMIN_TG_ID = process.env.ADMIN_TG_ID || "";
const QUIET = String(process.env.QUIET_OVERRIDE_PAYMENTS || "0") === "1"; // 1 — не отправлять
const ALERT = String(process.env.ALERT_PAYMENTS || "0") === "1";          // 1 — слать админу

function resolveMongoUri() {
  return (
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URL ||
    "mongodb://mongo:27017/app"
  );
}
function resolveDbName(uri) {
  const tail = (uri.split("/").pop() || "app").split("?")[0];
  return tail || "app";
}

function sendTG(chatId, text) {
  return new Promise((resolve, reject) => {
    if (!TG_TOKEN) return reject(new Error("TG_BOT_TOKEN missing"));
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TG_TOKEN}/sendMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 10000,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

async function processPayment(db, p) {
  const payments = db.collection("payments");
  const id = p.id || p.object?.id || ("local_" + Date.now());
  const meta = p.meta || p.object?.metadata || {};
  const tgId = meta.tg_id || meta.tgId || meta.user_id || null;
  const amount = p.amount || p.object?.amount?.value || "0.00";
  const currency = p.currency || p.object?.amount?.currency || "RUB";
  const description = p.description || p.object?.description || "";
  const kind = meta.kind || "-";

  // Покупателю
  if (tgId && p.buyer_notified !== true) {
    if (!QUIET) {
      const text =
        `Спасибо! Оплата принята ✅\n` +
        `${description}\n` +
        `Сумма: ${amount} ${currency}\n` +
        `Код оплаты: ${id}`;
      const st = await sendTG(tgId, text);
      console.log("payments-notifier: buyer notify", id, tgId, st);
    } else {
      console.log("payments-notifier: QUIET buyer skip", id, tgId);
    }
    await payments.updateOne({ _id: p._id }, { $set: { buyer_notified: true } });
    console.log("payments-notifier: buyer notified", id, tgId);
  }

  // Админу
  if (ALERT && ADMIN_TG_ID && p.admin_notified !== true) {
    if (!QUIET) {
      const text =
        `✅ Оплата успешна\n` +
        `ID: ${id}\n` +
        `Сумма: ${amount} ${currency}\n` +
        `Описание: ${description}\n` +
        `От: ${tgId || "-" }\n` +
        `Вид: ${kind}`;
      const st = await sendTG(ADMIN_TG_ID, text);
      console.log("payments-notifier: admin notify", id, st);
    } else {
      console.log("payments-notifier: QUIET admin skip", id);
    }
    await payments.updateOne({ _id: p._id }, { $set: { admin_notified: true } });
    console.log("payments-notifier: admin notified", id);
  }
}

async function tick(db) {
  const payments = db.collection("payments");
  const list = await payments
    .find({
      event: "payment.succeeded",
      $or: [
        { buyer_notified: { $exists: false } },
        { buyer_notified: false },
        { admin_notified: { $exists: false } },
        { admin_notified: false },
      ],
    })
    .sort({ _id: -1 })
    .limit(20)
    .toArray();

  for (const p of list) {
    try { await processPayment(db, p); }
    catch (e) { console.error("payments-notifier: process error", e && e.message || e); }
  }
}

async function start() {
  const uri = resolveMongoUri();
  const dbName = resolveDbName(uri);
  const cli = new MongoClient(uri);
  await cli.connect();
  const db = cli.db(dbName);
  console.log("payments: notifier started (quiet=", QUIET, "alert=", ALERT, ")");

  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await tick(db); }
    catch (e) { console.error("payments-notifier: tick error", e && e.message || e); }
    finally { busy = false; }
  }, 4000);
}

module.exports = { start };

if (require.main === module) {
  start().catch(e => {
    console.error("payments-notifier: fatal", e);
    process.exit(1);
  });
}
