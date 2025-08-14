const http = require("http");
const { MongoClient } = require("mongodb");

// --- Config ---
const PORT = Number(process.env.PORT || 3102);
const USER = process.env.YK_WEBHOOK_LOGIN || "yk_user";
const PASS = process.env.YK_WEBHOOK_PASSWORD || "super-secret";

// Mongo helpers
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
  } catch (_) {
    return "app";
  }
}

let _mongoCli = null;
async function getDb() {
  if (!_mongoCli) {
    _mongoCli = new MongoClient(resolveMongoUri(), { ignoreUndefined: true });
    await _mongoCli.connect();
  }
  return _mongoCli.db(resolveDbName(resolveMongoUri()));
}

function ok(res, text="ok") { res.writeHead(200, {"Content-Type":"text/plain; charset=utf-8"}); res.end(text); }
function unauthorized(res) { res.writeHead(401); res.end(); }

function checkBasicAuth(req) {
  const h = req.headers["authorization"] || "";
  if (!h.startsWith("Basic ")) return false;
  const raw = Buffer.from(h.slice(6), "base64").toString("utf8");
  return raw === `${USER}:${PASS}`;
}

async function upsertPayment(payload) {
  const db = await getDb();
  const obj = typeof payload === "string" ? JSON.parse(payload) : payload;

  // YK структура
  const id = (obj && obj.object && obj.object.id) || obj.id || ("local_" + Date.now());
  const event = obj.event || null;
  const amount = (obj.object && obj.object.amount && obj.object.amount.value) || null;
  const description = (obj.object && obj.object.description) || null;
  const meta = (obj.object && obj.object.metadata) || null;

  const res = await db.collection("payments").updateOne(
    { id },
    {
      $setOnInsert: {
        id,
        createdAt: new Date()
      },
      $set: {
        event,
        amount,
        at: new Date(),
        description,
        meta,
        raw: obj
      }
    },
    { upsert: true }
  );
  return res.upsertedCount > 0 ? "ok" : "already";
}

function start() {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url.startsWith("/yk-webhook")) {
      // простое health/ok
      if (req.method === "POST") ok(res, "ignored");
      else ok(res, "ok");
      return;
    }

    if (!checkBasicAuth(req)) {
      unauthorized(res);
      return;
    }

    try {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", async () => {
        try {
          const reply = await upsertPayment(body || "{}");
          console.log("yk side webhook: got", (JSON.parse(body).event || "(no event)"));
          ok(res, reply);
        } catch (e) {
          console.error("yk side webhook error:", e.message || e);
          ok(res, "ignored");
        }
      });
    } catch (e) {
      console.error("yk side webhook fatal:", e.message || e);
      ok(res, "ignored");
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`yk side webhook listening on ${PORT}`);
  });
}

module.exports = { start };

// запущен как standalone
if (require.main === module) {
  start();
}
