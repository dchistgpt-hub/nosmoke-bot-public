"use strict";

/**
 * Subscription landing (start) feature.
 * Sends the welcome text + single button "Оформить подписку на 30 дней".
 * All side effects are inside enable(app, bot, db).
 */

module.exports.enable = function enable(app, bot, db) {
  const BASE =
    process.env.PUBLIC_BASE_URL ||
    process.env.PUBLIC_ORIGIN ||
    "https://bot.chatnzt.ru"; // поменяешь при желании

  const OFFER_URL = "https://disk.yandex.ru/i/yQ2FfOtBdy_NTw";

  const buildPayUrl = (ctx) => {
    const tgId = (ctx && ctx.from && ctx.from.id) ? String(ctx.from.id) : "";
    // UI "payments" уже проксируется на bot:3000, страница /pay есть.
    // Параметры — максимально нейтральные, чтобы не ломать текущую логику.
    const u = new URL("/pay", BASE);
    u.searchParams.set("kind", "sub");
    u.searchParams.set("term", "30");
    if (tgId) u.searchParams.set("tg_id", tgId);
    return u.toString();
  };

  const welcomeHtml =
`<b>Привет! 👋 Мы — Алексей и Дмитрий, создатели AI Chatnzt — Никотинозависимая терапия.</b>

Если ты читаешь это сообщение, значит внутри тебя уже есть желание избавиться от сигарет. И мы знаем, как сделать так, чтобы это получилось легко, без срывов и мук.

Наш AI — не просто «умный собеседник». Это нейросеть, натренированная на сотнях тысяч научных публикаций и реальных историй людей, которые уже избавились от курения. Мы собрали опыт лучших методик, проверенных исследований и живых примеров побед над зависимостью, чтобы твой путь был легче и короче.

Она изучает твои привычки, находит моменты, когда ты особенно уязвим перед сигаретой, и именно в эти минуты подсказывает, что делать, чтобы не сорваться.

🔥 Ты больше не один на этой войне. Мы будем рядом 24/7 — в твоём телефоне, в каждом моменте, когда рука тянется за пачкой.

💳 <b>Стоимость курса:</b> 790 руб.
⏳ <b>Длительность:</b> 30 дней.

Если ты готов сделать первый шаг — жми «Оформить подписку» прямо сейчас.

Продолжая пользоваться ботом, вы соглашаетесь с <a href="${OFFER_URL}">условиями оферты</a>.

Мои команды: /ping, /echo, /quiet, /stats, /health, /uptime, /version, /about`;

  // Главный обработчик /start — ставим рано и не зовём next(), чтобы блокировать старое приветствие
  bot.start(async (ctx) => {
    try {
      const keyboard = {
        inline_keyboard: [[
          { text: "Оформить подписку на 30 дней", url: buildPayUrl(ctx) }
        ]]
      };
      await ctx.reply(welcomeHtml, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
      return; // не вызываем next() → последующие /start-хендлеры не исполнятся
    } catch (e) {
      console.error("sub.start error:", e && e.message || e);
    }
  });

  console.log('Feature "sub" enabled');
};
