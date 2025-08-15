// bot/index.js
require('dotenv').config();
// ===== quiet hours =====
let quietRange = (process.env.QUIET_DEFAULT || '23:00-07:00').trim();
// «23:00-07:00» → { from: 23*60, to: 7*60 } (минуты с начала суток)
function parseRange(str) {
  const [h1, h2] = str.split('-')
    .map(t => t.split(':').map(Number))
    .map(([h, m]) => h * 60 + (m || 0));
  return { from: h1, to: h2 };
}
function isQuietNow() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const { from, to } = parseRange(quietRange);
  return from < to ? (minutes >= from && minutes < to)
                   : (minutes >= from || minutes < to); // диапазон через полночь
}
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const DOMAIN    = process.env.DOMAIN;           // https://bot.chatnzt.ru
const PORT      = process.env.PORT || 3000;     // тот же порт, что в Caddyfile

const bot = new Telegraf(BOT_TOKEN);

// ===== middleware: лог всех входящих сообщений =====
const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(__dirname, '../logs/messages.log');

bot.use(async (ctx, next) => {
  if (ctx.message && ctx.message.text) {                // текстовые сообщения
    const line = `[${new Date().toISOString()}] ` +
                 `${ctx.from.username || ctx.from.id}: ` +
                 `${ctx.message.text}\n`;
    fs.promises.appendFile(LOG_FILE, line).catch(console.error);
  }
  await next();                                         // передаём дальше
});

// ----- handlers ------------------------------------------------
bot.start(ctx => ctx.reply('Привет! Бот на веб-хуке.'));
bot.command('ping', ctx => ctx.reply('pong ✅'));
// /quiet            — показать текущий диапазон
// /quiet HH:MM-HH:MM — задать новый
bot.command('quiet', ctx => {
  const arg = ctx.message.text.replace('/quiet', '').trim();
  if (!arg) {
    return ctx.reply(`🤫 Тихие часы сейчас: ${quietRange}`);
  }
  // быстрая проверка формата
  if (!/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(arg)) {
    return ctx.reply('❗ Формат: /quiet HH:MM-HH:MM  (пример: /quiet 22:00-08:00)');
  }
  quietRange = arg;
  ctx.reply(`✅ Тихие часы обновлены: ${quietRange}`);
});
bot.command('help', ctx => {
  const helpText = `
Команды бота:
/start – приветствие
/ping  – проверка «живой?»
/help  – показывает это сообщение
`;
  ctx.reply(helpText);
});
bot.command('echo', ctx => {
  // ctx.message.text выглядит так: "/echo что-то"
  // убираем первые 6 символов "/echo "
  const msg = ctx.message.text.slice(6).trim();
  if (msg.length === 0) {
    return ctx.reply('❗ Какой текст повторить? Пиши /echo ваш_текст');
  }
  ctx.reply(msg);
});
// /about — краткая справка + ссылка на репозиторий
const aboutMsg = `
NoSmoke-bot — Telegram-бот для поддержки чата
Версия: 0.1

Доступные команды:
• /start — приветствие
• /ping  — проверка «живой?»
• /echo <текст> — бот повторяет текст
• /quiet — показать или изменить «тихие часы»
• /about — эта справка

Исходники на GitHub:
https://github.com/dchistgpt-hub/nosmoke-bot
`;

bot.command('about', ctx => ctx.reply(aboutMsg));

bot.use(async (ctx, next) => {
  if (ctx.updateType === 'message' && isQuietNow()) {
    // ничего не отвечаем
    return;
  }
  await next();
});
// ---------------------------------------------------------------

// путь вида /bot123:AA...
const WEBHOOK_PATH = `/bot${BOT_TOKEN}`;

(async () => {
  // регистрируем веб-хук у Telegram
  await bot.telegram.setWebhook(`${DOMAIN}${WEBHOOK_PATH}`);
  // запускаем HTTP-сервер внутри контейнера
  bot.startWebhook(WEBHOOK_PATH, null, PORT);
  console.log(`Webhook started on port ${PORT}`);
})();
