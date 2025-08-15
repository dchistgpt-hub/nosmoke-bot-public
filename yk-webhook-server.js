"use strict";
const http = require("node:http");
const { MongoClient } = require("mongodb");

// ---- config helpers
const PORT  = Number(process.env.YK_SIDE_PORT || 3102);
const LOGIN = process.env.YK_WEBHOOK_LOGIN  || "yk_user";
const PASS  = process.env.YK_WEBHOOK_PASSWORD || "super-secret";
const MONGO = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGODB_URL || "mongodb://mongo:27017/app";
const dbName = (uri) => ((uri.split("/").pop() || "app").split("?")[0] || "app");

async function upsertPayment(db, payload) {
  const obj = typeof payload === "string" ? JSON.parse(payload) : payload;
  const id  = (obj?.object?.id) || obj.id || ("local_" + Date.now());
  const doc = {
    id,
    event: obj.event || null,
    amount: obj?.object?.amount?.value || null,
    at: new Date(),
    description: obj?.object?.description || null,
    meta: obj?.object?.metadata || null,
    raw: obj
  };
  await db.collection("payments").updateOne({ id }, { $setOnInsert: doc }, { upsert: true });
  return doc;
}

module.exports.start = () => {
  let client=null, db=null;
  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith("/yk-webhook")) { res.statusCode = 404; return res.end("not found"); }

    // Basic auth
    const hdr = req.headers["authorization"] || "";
    if (!hdr.startsWith("Basic ")) { res.statusCode = 401; return res.end("unauthorized"); }
    const raw = Buffer.from(hdr.slice(6), "base64").toString();
    const i = raw.indexOf(":");
    const ok = i >= 0 && raw.slice(0,i) === LOGIN && raw.slice(i+1) === PASS;
    if (!ok) { res.statusCode = 401; return res.end("unauthorized"); }

    // Body -> Mongo
    let body = ""; req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        if (!client) { client = new MongoClient(MONGO); await client.connect(); db = client.db(dbName(MONGO)); }
        const doc = await upsertPayment(db, body || "{}");
        console.log("yk side webhook: got", doc.event || "(no event)");
        res.end("ok");
      } catch (e) {
        console.error("yk side webhook error:", e.message);
        res.statusCode = 500; res.end("error");
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log("yk side webhook listening on", PORT);
  });
  return server;
};

if (require.main === module) module.exports.start();
