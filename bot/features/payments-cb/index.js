"use strict";
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { Markup } = require("telegraf");

function ykCreate(amount, description, meta) {
  return new Promise((resolve, reject) => {
    const SHOP_ID = process.env.YK_SHOP_ID || process.env.YOOKASSA_SHOP_ID || process.env.SHOP_ID;
    const SECRET  = process.env.YK_SECRET_KEY || process.env.YOOKASSA_SECRET_KEY || process.env.SECRET_KEY;
    if (!SHOP_ID || !SECRET) return reject(new Error("YK creds missing"));

    const payload = JSON.stringify({
      amount: { value: Number(amount).toFixed(2), currency: "RUB" },
      capture: true,
      description,
      metadata: meta || {},
      confirmation: { type: "redirect", return_url: "https://t.me/" + (process.env.BOT_USERNAME || "") }
    });

    const idem = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
    const auth = "Basic " + Buffer.from(`${SHOP_ID}:${SECRET}`).toString("base64");

    const req = https.request({
      hostname: "bot.chatnzt.ru",
      port: 443,
      path: "/yk-create",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Idempotence-Key": idem,
        "Authorization": auth,
        "Content-Length": Buffer.byteLength(payload)
      },
      timeout: 20000
    }, (r) => {
      let body = "";
      r.setEncoding("utf8");
      r.on("data", ch => body += ch);
      r.on("end", () => {
        console.log("payments-cb: status", r.statusCode, String(body).slice(0, 160));
        try {
          const j = JSON.parse(body || "{}");
          const href = j && j.confirmation && j.confirmation.confirmation_url;
          if (href) return resolve(href);
          reject(new Error("no confirmation url"));
        } catch (e) { reject(e); }
      });
    });
    req.on("timeout", () => { console.error("payments-cb: req timeout"); req.destroy(new Error("timeout")); });
    req.on("error", (e) => { console.error("payments-cb: req error:", e.code || e.message); reject(e); });
    req.end(payload);
  });
}

module.exports.register = function register(bot) {
  bot.on("callback_query", async (ctx, next) => {
    const data = ctx?.update?.callback_query?.data || "";
    const uid  = ctx?.from?.id;
    if (data.startsWith("yk:sub:")) {
      const price = Number(data.split(":")[2] || "0");
      try { await ctx.answerCbQuery("Готовлю ссылку на оплату…"); } catch {}
      try {
        const href = await ykCreate(price, "AI Chatnzt: 30-day sub", { tg_id: String(uid||""), kind:"sub", plan:"30d" });
        await ctx.reply("Открой ссылку для оплаты 👇",
          Markup.inlineKeyboard([[Markup.button.url(`Оплатить ${price} ₽`, href)]]));
        console.log("payments-cb: sent href to", uid);
      } catch (e) {
        console.error("payments-cb: final error:", (e && e.message) || e);
        try { await ctx.reply("Не удалось создать платёж. Попробуй ещё раз позже."); } catch {}
      }
      return;
    }
    if (typeof next === "function") await next();
  });
};
