const https = require("https");
const { MongoClient } = require("mongodb");

// env (dotenv по желанию)
try { require("dotenv").config(); } catch (_) {}

const TG_TOKEN = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN || process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_TG_ID;
const QUIET = (process.env.QUIET_OVERRIDE_PAYMENTS || "0") === "1";
const ALERT = (process.env.ALERT_PAYMENTS || "1") === "1";

function resolveMongoUri() {
  return (
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URL ||
    "mongodb://mongo:27017/app"
  );
}
function resolveDbName(uri) {
  try {
    const tail = uri.split("/").pop() || "app";
    return (tail.split("?")[0] || "app") || "app";
  } catch (_) { return "app"; }
}

let _cli = null;
async function db() {
  if (!_cli) {
    _cli = new MongoClient(resolveMongoUri(), { ignoreUndefined: true });
    await _cli.connect();
  }
  return _cli.db(resolveDbName(resolveMongoUri()));
}

function sendMessage(chat_id, text) {
  return new Promise((resolve) => {
    if (!TG_TOKEN || !chat_id) return resolve({ status: 0 });
    const data = JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true });
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${TG_TOKEN}/sendMessage`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode || 0 }));
    });
    req.on("error", () => resolve({ status: 0 }));
    req.end(data);
  });
}

async function tick() {
  if (QUIET || !ALERT) return; // не оповещаем по флагам

  const dbc = await db();
  const items = await dbc.collection("payments")
    .find({
      event: "payment.succeeded",
      $or: [{ notified_user: { $ne: true } }, { notified_admin: { $ne: true } }]
    })
    .sort({ _id: -1 })
    .limit(20)
    .toArray();

  for (const p of items) {
    const id = p.id;
    const sum = p.amount || "-";
    const desc = p.description || "-";
    const tg = p.meta && p.meta.tg_id;

    // Покупателю
    if (tg && p.notified_user !== true) {
      const text = [
        "Спасибо! Оплата принята ✅",
        `ID: <code>${id}</code>`,
        `Сумма: <b>${sum}</b> RUB`,
        desc !== "-" ? `Описание: ${desc}` : ""
      ].filter(Boolean).join("\n");
      const r = await sendMessage(tg, text);
      console.log("payments-notifier: buyer notify", id, tg, r.status);
      if (r.status === 200) {
        await dbc.collection("payments").updateOne({ id }, { $set: { notified_user: true, notifiedUserAt: new Date() } });
        console.log("payments-notifier: buyer notified", id, tg);
      }
    }

    // Админу
    if (ADMIN_ID && p.notified_admin !== true) {
      const textA = [
        "✅ Оплата успешна",
        `ID: <code>${id}</code>`,
        `Сумма: <b>${sum}</b> RUB`,
        `TG: <code>${tg || "-"}</code>`,
        desc ? `Описание: ${desc}` : ""
      ].filter(Boolean).join("\n");
      const rA = await sendMessage(ADMIN_ID, textA);
      console.log("payments-notifier: admin notify", id, rA.status);
      if (rA.status === 200) {
        await dbc.collection("payments").updateOne({ id }, { $set: { notified_admin: true, notifiedAdminAt: new Date() } });
        console.log("payments-notifier: admin notified", id);
      }
    }
  }
}

function start() {
  console.log("payments: notifier started (quiet=", QUIET, "alert=", ALERT, ")");
  setInterval(tick, 3000);
  // запустить сразу один проход
  tick().catch(()=>{});
}

module.exports = { start };

// standalone
if (require.main === module) start();
