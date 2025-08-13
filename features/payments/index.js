"use strict";
const crypto = require("crypto");
const https  = require("https");

function uuid(){ return (crypto.randomUUID?.() || crypto.randomBytes(16).toString("hex")); }
function buildPayKeyboard(){
  return { inline_keyboard: [
    [{ text: "Курс 30 дней — 799 ₽", callback_data: "yk:sub:799" }],
    [ { text: "SOS +50 — 99 ₽",  callback_data: "yk:sos:50:99"  },
      { text: "SOS +100 — 159 ₽",callback_data: "yk:sos:100:159"} ],
    [ { text: "SOS +500 — 349 ₽", callback_data: "yk:sos:500:349"  },
      { text: "SOS +1000 — 499 ₽",callback_data: "yk:sos:1000:499"} ],
  ]};
}

const SNI_HOST = process.env.YK_SNI_HOST || "api.yookassa.ru";
const HOSTS = (process.env.YK_API_HOSTS || "172.17.0.1:8443,185.71.78.133,109.235.165.99,api.yookassa.ru")
  .split(",").map(s=>s.trim()).filter(Boolean);

function parseHost(h){ const parts = h.split(":"); return { host: parts[0], port: parts[1] ? Number(parts[1]) : 443 }; }

function ykHTTPSOnce(target, payload, idemKey, auth){
  return new Promise((resolve,reject)=>{
    const hp = parseHost(target);
    const dataStr = JSON.stringify(payload);
    const agent = new https.Agent({ keepAlive:true, timeout: 25000 });
    const req = https.request({
      agent, hostname: hp.host, port: hp.port,
      servername: SNI_HOST, // TLS SNI
      path: "/v3/payments", method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataStr),
        "Idempotence-Key": idemKey,
        "Authorization": "Basic " + auth,
        "Host": SNI_HOST, // HTTP Host = домен
      },
      timeout: 12000
    }, (res)=>{
      let buf=""; res.on("data", c=>buf+=c);
      res.on("end", ()=>{
        if (res.statusCode>=200 && res.statusCode<300){
          try { resolve(JSON.parse(buf)); } catch(e){ reject(new Error("YK parse error: " + e.message)); }
        } else {
          reject(new Error("YK HTTP " + res.statusCode + ": " + buf.slice(0,500)));
        }
      });
    });
    req.on("timeout", ()=>{ req.destroy(new Error("CONNECT_TIMEOUT")); });
    req.on("error", reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function ykHTTPS(payload, idemKey, auth){
  let lastErr;
  for (let i=0;i<HOSTS.length;i++){
    try { return await ykHTTPSOnce(HOSTS[i], payload, idemKey, auth); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("YK connect failed");
}

async function createYKPayment(opts){
  const ctx         = opts.ctx;
  const amount      = opts.amount;
  const description = opts.description;
  const kind        = opts.kind;
  const sos_pack    = opts.sos_pack;

  const SHOP_ID    = process.env.YK_SHOP_ID;
  const SECRET_KEY = process.env.YK_SECRET_KEY;
  const RETURN_URL = process.env.YK_RETURN_URL || "https://t.me/chatnztbot";
  if (!SHOP_ID || !SECRET_KEY) throw new Error("YK creds missing");

  const idemKey = uuid();
  const auth = Buffer.from(SHOP_ID + ":" + SECRET_KEY).toString("base64");

  const payload = {
    amount: { value: Number(amount).toFixed(2), currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: RETURN_URL },
    description: description,
    metadata: {
      tg_id: String(ctx.from && ctx.from.id ? ctx.from.id : ""),
      username: (ctx.from && ctx.from.username) ? ctx.from.username : "",
      kind: kind,
      sos_pack: sos_pack || 0,
      source: "telegram:/pay"
    }
  };

  const data = await ykHTTPS(payload, idemKey, auth);
  return data && data.confirmation ? data.confirmation.confirmation_url : null;
}

function _extractBot(a){ if (!a) return null; if (a.telegram) return a; if (a.bot) return a.bot; return null; }

async function registerPayments(a){
  const bot = _extractBot(a);
  if (!bot) throw new Error("payments.register: bot missing");
  if ((process.env.PAY_PROVIDER || "yookassa") !== "yookassa"){
    console.log("Feature \"payments\": PAY_PROVIDER != yookassa — UI disabled");
    return;
  }
  console.log("Feature \"payments\" enabled (YK UI)");

  bot.command("pay", async (ctx)=>{ try{
    await ctx.reply("Оплата через YooKassa — выберите пакет:", { reply_markup: buildPayKeyboard() });
  }catch(e){ console.error("/pay error", e); await ctx.reply("Ошибка при подготовке оплаты. Попробуйте позже."); }});

  bot.action("pay:open", async (ctx)=>{ try{
    await ctx.answerCbQuery();
    await ctx.reply("Оплата через YooKassa — выберите пакет:", { reply_markup: buildPayKeyboard() });
  }catch(e){ console.error("pay:open error", e); }});

  bot.action(/^yk:(sub|sos):([0-9]+)(?::([0-9]+))?$/, async (ctx)=>{ try{
    await ctx.answerCbQuery();
    const kind = ctx.match[1];
    const qty  = Number(ctx.match[2]);
    const amount = (kind === "sub") ? 799 : Number(ctx.match[3]);
    var description;
    if (kind === "sub") description = "NoSmokeBot: курс 30 дней";
    else description = "NoSmokeBot: SOS +" + qty;

    const url = await createYKPayment({
      ctx: ctx,
      amount: amount,
      description: description,
      kind: (kind === "sub") ? "subscription" : "sos",
      sos_pack: (kind === "sos") ? qty : 0
    });

    if (!url) {
      await ctx.reply("Не удалось сформировать ссылку на оплату. Попробуйте ещё раз.");
      return;
    }
    await ctx.reply(
      "Готово! Откройте страницу YooKassa и завершите платёж.",
      { reply_markup: { inline_keyboard: [[{ text: "Оплатить " + amount + " ₽", url: url }]] } }
    );
  }catch(e){
    console.error("yk:* error", e);
    await ctx.reply("Ошибка при подготовке оплаты. Попробуйте позже.");
  }});
}

module.exports = { register: registerPayments, default: { register: registerPayments } };
