// bot/index.js — nosmoke-bot (base + flags: DB/ONBOARDING/SOS/PAYMENTS/CONTENT/ADMIN)
require('dotenv').config();

const { Telegraf } = require('telegraf');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const FLAGS = require('./lib/flags');

// ---- config
const BOT_TOKEN = process.env.BOT_TOKEN;
const DOMAIN    = (process.env.DOMAIN || 'https://bot.chatnzt.ru').replace(/\/+$/, '');
const PORT      = Number(process.env.PORT || 3000);
const BUILD_AT  = process.env.BUILD_AT || new Date().toISOString();
const SECRET    = process.env.TELEGRAM_SECRET;
const STRICT    = (process.env.ANTISPAM_STRICT || '0') === '1';

// ===== uptime fmt =====
const STARTED_AT = Date.now();
function fmt(ms){
  const s = Math.floor(ms/1000);
  const d = Math.floor(s/86400);
  const h = Math.floor((s%86400)/3600);
  const m = Math.floor((s%3600)/60);
  const sec = s%60;
  const out = [];
  if (d) out.push(d+'d');
  if (h) out.push(h+'h');
  if (m) out.push(m+'m');
  out.push(sec+'s');
  return out.join(' ');
}

// ===== quiet hours =====
let quietRange = (process.env.QUIET_DEFAULT || '23:00-07:00').trim();
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
                   : (minutes >= from || minutes < to);
}

// ===== bot =====
if (!BOT_TOKEN) { console.error('BOT_TOKEN is missing. Put it to .env'); process.exit(1); }
const bot = new Telegraf(BOT_TOKEN);

// ===== logging (messages.log + daily YYYY-MM-DD_messages.log) =====
const logsDir = path.join(__dirname, 'logs');
const mainLog = path.join(logsDir, 'messages.log');
function todayFile() {
  const day = new Date().toISOString().slice(0,10);
  return path.join(logsDir, `${day}_messages.log`);
}
try { fs.mkdirSync(logsDir, { recursive: true }); } catch {}
function writeLogLine(line) {
  try { fs.appendFileSync(mainLog, line + '\n'); } catch {}
  try { fs.appendFileSync(todayFile(), line + '\n'); } catch {}
}

// ===== allowlist + rate-limit (антиспам) =====
const allowedPath = path.join(logsDir, 'allowed.json');
let allowed = new Set();
try { const j = JSON.parse(fs.readFileSync(allowedPath,'utf8')); allowed = new Set(j.ids || []);} catch {}
function saveAllowed(){ try { fs.writeFileSync(allowedPath, JSON.stringify({ids: [...allowed]})); } catch {} }
let recentByUser = new Map();

// --- anti-spam middleware ---
bot.use((ctx, next) => {
  try {
    const uid = ctx.from?.id;
    const txt = ctx.message?.text || '';
    if (!uid) return next();
    const isCommand = typeof txt === 'string' && txt.startsWith('/');

    if (typeof txt === 'string' && /^\/start(\s|$)/.test(txt)) { allowed.add(uid); saveAllowed(); return next(); }

    // rate limit: >8 сообщений за 10 секунд (не душим команды)
    const now = Date.now();
    const arr = (recentByUser.get(uid) || []).filter(t => now - t < 10000);
    arr.push(now); recentByUser.set(uid, arr);
    if (!isCommand && arr.length > 8) {
      writeLogLine(`[${new Date().toISOString()}] ${ctx.from?.username||uid}: BLOCKED (rate-limit)`);
      return;
    }

    // контентные хьюристики: в STRICT — для всех, иначе — только для не-allowlist; команды не режем
    if ((STRICT || !allowed.has(uid)) && !isCommand) {
      const urlLike  = /(https?:\/\/|[a-z0-9.-]+\.[a-z]{2,})(\/|\b)/i.test(txt);
      const keywords = /(casino|bonus|promo\s*code|deposit|slots?|jetacas|crypto|withdrawals?|no\s*id|verification)/i.test(txt);
      if (urlLike || keywords) {
        writeLogLine(`[${new Date().toISOString()}] ${ctx.from?.username||uid}: BLOCKED (spam)`);
        return;
      }
    }
  } catch {}
  return next();
});

// log incoming messages (после антиспама)
bot.use(async (ctx, next) => {
  try {
    const u = ctx.from;
    const from = u?.username || u?.id || 'unknown';
    const txt = ctx.message?.text || ctx.updateType;
    if (txt) writeLogLine(`[${new Date().toISOString()}] ${from}: ${txt}`);
  } catch {}
  await next();
});

// ===== base commands =====
bot.start(ctx => ctx.reply('Привет! Я жив. Команды: /ping, /echo, /quiet, /stats, /health, /uptime, /version, /about'));
bot.command('ping', ctx => ctx.reply('pong'));
bot.command('help', ctx => ctx.reply([
  'Доступные команды:',
  '/ping — проверка',
  '/echo <текст> — повторю текст',
  '/quiet [HH:MM-HH:MM] — показать/изменить тихие часы',
  '/stats — аптайм и статистика по логам',
  '/health — ok',
  '/uptime — время работы',
  '/version — версия и билд',
  '/about — инфо',
].join('\n')));

bot.command('echo', ctx => {
  const full = ctx.message?.text || '';
  const m = full.match(/^\/echo(@\w+)?\s+([\s\S]+)/);
  return ctx.reply(m ? m[2] : 'Пусто');
});

bot.command('quiet', ctx => {
  const full = ctx.message?.text || '';
  const m = full.match(/^\/quiet(?:@\w+)?(?:\s+(\d{2}:\d{2}-\d{2}:\d{2}))?$/);
  if (!m) return ctx.reply(`Текущие «тихие часы»: ${quietRange}\nФормат: /quiet HH:MM-HH:MM`);
  if (!m[1]) return ctx.reply(`Текущие «тихие часы»: ${quietRange}`);
  const ok = /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(m[1]);
  if (!ok) return ctx.reply('Формат времени неверный. Пример: /quiet 22:00-07:00');
  quietRange = m[1];
  return ctx.reply(`Готово. Новые «тихие часы»: ${quietRange}`);
});

bot.command('about', ctx => ctx.reply(
  'NoSmoke-bot — Telegram-бот для поддержки отказа от курения.\nСтек: Node 20, Telegraf, Docker, Caddy (webhook).\nКоманды: /ping /echo /quiet /stats /health /uptime /version /about'
));
bot.command('health', ctx => ctx.reply('ok'));
bot.command('uptime', ctx => ctx.reply(fmt(Date.now() - STARTED_AT)));

function gatherLogs() {
  try {
    const files = fs.readdirSync(logsDir)
      .filter(fn => /^\d{4}-\d{2}-\d{2}_messages\.log$/.test(fn))
      .sort();
    if (files.length === 0) {
      if (fs.existsSync(mainLog)) return fs.readFileSync(mainLog, 'utf8').split(/\r?\n/).filter(Boolean);
      return [];
    }
    let lines = [];
    for (const fn of files) {
      const txt = fs.readFileSync(path.join(logsDir, fn), 'utf8');
      if (txt) lines = lines.concat(txt.split(/\r?\n/).filter(Boolean));
    }
    return lines;
  } catch { return []; }
}
bot.command('stats', ctx => {
  const lines = gatherLogs();
  const total = lines.length;
  const todayPrefix = new Date().toISOString().slice(0,10);
  const today = lines.filter(l => l.startsWith('[' + todayPrefix)).length;
  const tail = lines.slice(-10);
  const msg = [
    `uptime: ${fmt(Date.now() - STARTED_AT)}`,
    `today: ${today}`,
    `total: ${total}`,
    `last 10:`,
    ...tail
  ].join('\n');
  return ctx.reply(msg, { disable_web_page_preview: true });
});

bot.command('version', (ctx) => {
  let version = '0.0.0';
  try { version = require('./package.json').version || version; } catch {}
  const builtAt = BUILD_AT;
  return ctx.reply(`version: ${version}\nbuild: ${builtAt}`);
});

// ===== feature registration (behind flags) =====
const deps = { logsDir, writeLogLine, isQuietNow, parseRange, fmt };

(async () => {
  // DB
  if (FLAGS.FF_DB) {
    try {
      const { connect } = require('./db/mongo');
      const uri = process.env.MONGO_URI, dbName = process.env.MONGO_DB || 'nosmoke';
      if (!uri) throw new Error('MONGO_URI not set');
      await connect(uri, dbName);
      console.log('MongoDB connected');
    } catch (e) {
      console.error('FF_DB enabled but failed:', e.message);
    }
  }

  // Optional features
  const enable = (flag, name, loader) => {
    if (!flag) return;
    try { loader(); console.log(`Feature "${name}" enabled`); }
    catch (e) { console.error(`Feature "${name}" failed:`, e.message); }
  };

  enable(FLAGS.FF_CONTENT,   'content',   () => require('./features/content').register(bot, deps));
  enable(FLAGS.FF_ONBOARDING,'onboarding',() => require('./features/onboarding').register(bot, deps));
  enable(FLAGS.FF_SOS,       'sos',       () => require('./features/sos').register(bot, deps));
  enable(FLAGS.FF_PAYMENTS,  'payments',  () => require('./features/payments').register(bot, deps));
  enable(FLAGS.FF_ADMIN,     'admin',     () => require('./features/admin').register(bot, deps));
})();

// ===== webhook server with HTTP endpoints =====
const WEBHOOK_PATH = `/bot${BOT_TOKEN}`;
const server = http.createServer((req, res) => {
  if (req.method === 'HEAD' && req.url === '/health') { res.writeHead(200); return res.end(); }
  if (req.method === 'GET'  && req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (req.method === 'GET'  && req.url === '/uptime') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(fmt(Date.now() - STARTED_AT)); return; }
  if (req.method === 'GET'  && req.url === '/version') {
    let version = '0.0.0'; try { version = require('./package.json').version || version; } catch {}
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('version: ' + version + '\nbuild: ' + BUILD_AT);
    return;
  }
  // /healthz JSON — только при FF_ADMIN=1
  if (FLAGS.FF_ADMIN && req.method === 'GET' && req.url === '/healthz') {
    let version = '0.0.0'; try { version = require('./package.json').version || version; } catch {}
    const body = JSON.stringify({
      status: 'ok',
      version, build: BUILD_AT,
      uptime_s: Math.floor((Date.now() - STARTED_AT)/1000),
      flags: FLAGS,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  if (req.method === 'POST' && req.url === WEBHOOK_PATH) {
    return bot.webhookCallback(WEBHOOK_PATH, SECRET ? { secretToken: SECRET } : {})(req, res);
  }
  res.writeHead(403); res.end();
});

server.listen(PORT, async () => {
  try {
    if (SECRET) {
      await bot.telegram.setWebhook(`${DOMAIN}${WEBHOOK_PATH}`, { secret_token: SECRET });
    } else {
      await bot.telegram.setWebhook(`${DOMAIN}${WEBHOOK_PATH}`);
    }
    console.log(`HTTP server + webhook on ${PORT}`);
  } catch (e) {
    console.error('Failed to set webhook:', e);
  }
});
