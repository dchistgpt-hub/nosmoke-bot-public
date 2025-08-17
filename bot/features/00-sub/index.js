"use strict";

// Фича "подписка": приветствие на /start и checkout через YooKassa
// НИ ОТ ЧЕГО ВНЕШНЕГО не зависит, кроме ENV и существующего app/bot.

const https = require("https");
const { URLSearchParams } = require("url");

function enable(app, bot, db) {
  const DOMAIN    = process.env.DOMAIN || "";
  const OFFER_URL = process.env.OFFER_URL || "";
  const SHOP_ID   = process.env.YK_SHOP_ID || "";
  const SECRET    = process.env.YK_SECRET_KEY || "";
  const BOT_UNAME = process.env.BOT_USERNAME || ""; // не обязателен

  // --- 1) /start: привет и кнопка оплаты ---
  const welcomeHtml = [
    'Привет! 👋 Мы — Алексей и Дмитрий, создатели <b>AI Chatnzt — Никотинозависимая терапия</b>.',
    '',
    'Если ты читаешь это сообщение, значит внутри тебя уже есть желание избавиться от сигарет. И мы знаем, как сделать так, чтобы это получилось легко, без срывов и мук.',
    '',
    'Наш AI — не просто «умный собеседник». Это нейросеть, натренированная на сотнях тысяч научных публикаций и реальных историй людей, которые уже избавились от курения. Мы собрали опыт лучших методик, проверенных исследований и живых примеров побед над зависимостью, чтобы твой путь был легче и короче.',
    '',
    'Она изучает твои привычки, находит моменты, когда ты особенно уязвим перед сигаретой, и именно в эти минуты подсказывает, что делать, чтобы не сорваться.',
    '',
    '🔥 Ты больше не один на этой войне. Мы будем рядом 24/7 — в твоём телефоне, в каждом моменте, когда рука тянется за пачкой.',
    '',
    '💳 <b>Стоимость курса:</b> 790 руб.',
    '⏳ <b>Длительность:</b> 30 дней.',
    '',
    `Если ты готов сделать первый шаг — жми «Оформить подписку на 30 дней — 790 ₽» прямо сейчас.`,
    '',
    `Продолжая пользоваться ботом, вы соглашаетесь с <a href="${OFFER_URL || '#'}">условиями оферты</a>.`,
    '',
    'Мои команды: /ping, /echo, /quiet, /stats, /health, /uptime, /version, /about'
  ].join('\n');

  function startKeyboard(uid) {
    const url = `${DOMAIN}/sub/checkout?plan=30d&uid=${encodeURIComponent(uid || "")}`;
    return {
      inline_keyboard: [
        [{ text: 'Оформить подписку на 30 дней — 790 ₽', callback_data: 'yk:sub:790' }]
      ]
    };
  }

  bot.start(async (ctx) => {
    const uid = ctx.from?.id || "";
    try {
      await ctx.reply(welcomeHtml, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: startKeyboard(uid),
      });
    } catch (e) {
      console.error("sub: /start send error:", (e && e.message) || e);
    }
  });

  // --- 2) GET /sub/checkout: создание платежа в YooKassa и редирект ---
  app.get("/sub/checkout", async (req, res) => {
    const plan = String(req.query.plan || "30d");
    const tgId = String(req.query.uid  || "");
    // без кредов отвечаем честно, чтобы не путать
    if (!SHOP_ID || !SECRET) {
      return res.status(500).send("payments: YK creds missing");
    }
    // 790 RUB = фиксированная цена курса
    const body = {
      amount: { value: "790.00", currency: "RUB" },
      capture: true,
      description: "AI Chatnzt: 30-day sub",
      confirmation: {
        type: "redirect",
        return_url: BOT_UNAME ? `https://t.me/${BOT_UNAME}` : (DOMAIN || "https://t.me")
      },
      metadata: { tg_id: tgId, kind: "sub", plan }
    };
    const data = JSON.stringify(body);

    const auth = Buffer.from(`${SHOP_ID}:${SECRET}`).toString("base64");
    const options = {
      hostname: "api.yookassa.ru",
      path: "/v3/payments",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        "Authorization": `Basic ${auth}`,
        "Content-Length": Buffer.byteLength(data)
      },
    };

    const reqYK = https.request(options, (resp) => {
      let chunks = "";
      resp.on("data", d => chunks += d);
      resp.on("end", () => {
        try {
          const j = JSON.parse(chunks || "{}");
          const url = j?.confirmation?.confirmation_url;
          if (url) {
            return res.redirect(302, url);
          }
          console.error("create payment: no confirmation_url", j);
          return res.status(502).send("create payment error");
        } catch (e) {
          console.error("create payment parse error:", e?.message||e);
          return res.status(502).send("create payment error");
        }
      });
    });
    reqYK.on("error", (e) => {
      console.error("create payment HTTP error:", e?.message||e);
      res.status(502).send("create payment error");
    });
    reqYK.end(data);
  });

  console.log('Feature "sub" enabled');
}

module.exports = { enable };
