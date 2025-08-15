"use strict";

const https = require("https");
const crypto = require("crypto");

const SHOP_ID = process.env.YK_SHOP_ID;
const SECRET_KEY = process.env.YK_SECRET_KEY;

function createYkPayment({ amount, description, metadata }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      amount: { value: amount, currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: "https://t.me/AI_Chatnzt_bot" },
      description,
      metadata
    });

    const req = https.request({
      hostname: "api.yookassa.ru",
      path: "/v3/payments",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": crypto.randomUUID(),
        "Content-Length": Buffer.byteLength(body),
        "Authorization": "Basic " + Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString("base64"),
        "User-Agent": "AI-Chatnzt-Bot/1.0"
      }
    }, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const obj = JSON.parse(data || "{}");
            const url = obj?.confirmation?.confirmation_url;
            return url ? resolve(url) : reject(new Error("YK: confirmation_url missing"));
          } catch {
            return reject(new Error("YK: bad JSON"));
          }
        }
        reject(new Error(`YK: status ${res.statusCode} ${data}`));
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

module.exports.enable = function enable(app, bot, db) {
  console.log('Feature "sub" enabled');

  const PAY_URL = "https://bot.chatnzt.ru/pay?kind=sub&days=30";

  const WELCOME_HTML = [
    "Привет! 👋 Мы — Алексей и Дмитрий, создатели <b>AI Chatnzt — Никотинозависимая терапия</b>.",
    "",
    "Если ты читаешь это сообщение, значит внутри тебя уже есть желание избавиться от сигарет. И мы знаем, как сделать так, чтобы это получилось легко, без срывов и мук.",
    "",
    "Наш AI — не просто «умный собеседник». Это нейросеть, натренированная на сотнях тысяч научных публикаций и реальных историй людей, которые уже избавились от курения. Мы собрали опыт лучших методик, проверенных исследований и живых примеров побед над зависимостью, чтобы твой путь был легче и короче.",
    "",
    "Она изучает твои привычки, находит моменты, когда ты особенно уязвим перед сигаретой, и именно в эти минуты подсказывает, что делать, чтобы не сорваться.",
    "",
    "🔥 Ты больше не один на этой войне. Мы будем рядом 24/7 — в твоём телефоне, в каждом моменте, когда рука тянется за пачкой.",
    "",
    "💳 <b>Стоимость курса:</b> 790 руб.",
    "⏳ <b>Длительность:</b> 30 дней.",
    "",
    "Если ты готов сделать первый шаг — жми «Оформить подписку» прямо сейчас.",
    "",
    'Продолжая пользоваться ботом, вы соглашаетесь с <a href="https://disk.yandex.ru/i/yQ2FfOtBdy_NTw">условиями оферты</a>.',
    "",
    "Мои команды: /ping, /echo, /quiet, /stats, /health, /uptime, /version, /about"
  ].join("\n");

  async function upsertUser(tgId) {
    try {
      if (!db) return;
      const tg_id = String(tgId);
      await db.collection("users").updateOne(
        { tg_id },
        { $setOnInsert: { tg_id, createdAt: new Date() }, $set: { updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (e) {
      console.error("start: upsert user failed:", e?.message || e);
    }
  }

  async function sendWelcome(chatId, tgId) {
    await upsertUser(tgId);
    const opts = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: "Оформить подписку на 30 дней", url: PAY_URL }]]
      }
    };
    if (bot?.sendMessage) return bot.sendMessage(chatId, WELCOME_HTML, opts); // node-telegram-bot-api
    if (bot?.telegram?.sendMessage) return bot.telegram.sendMessage(chatId, WELCOME_HTML, opts); // telegraf
  }

  // /start — регистрируем обработчики (оба стека на всякий случай)
  if (bot?.onText) bot.onText(/^\/start\b/i, (msg) => sendWelcome(msg.chat.id, msg.from?.id));
  if (bot?.command) bot.command("start", (ctx) => sendWelcome(ctx.chat.id, ctx.from?.id));

  // /pay — редирект на YooKassa (sub 30 дней)
  if (app?.get) {
    app.get("/pay", async (req, res, next) => {
      try {
        if ((req.query.kind || "") !== "sub") return next();
        if (!SHOP_ID || !SECRET_KEY) return res.status(500).send("payments: YK creds missing");

        const days = Number(req.query.days) || 30;
        const tgId = req.query.tg_id || req.query.tg || null;

        const confirmationUrl = await createYkPayment({
          amount: "790.00",
          description: "AI Chatnzt: Подписка 30 дней",
          metadata: { tg_id: tgId, kind: "sub", days }
        });

        return res.redirect(302, confirmationUrl);
      } catch (e) {
        console.error("sub: /pay error", e?.message || e);
        return res.status(500).send("create payment error");
      }
    });
  }
};
