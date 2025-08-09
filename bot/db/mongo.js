let client = null, db = null;
async function connect(uri, dbName){
  const { MongoClient } = require('mongodb');
  client = new MongoClient(uri, { maxPoolSize: 5 });
  await client.connect();
  db = client.db(dbName);
  return db;
}
function getDb(){ if(!db) throw new Error('Mongo not connected'); return db; }
async function close(){ try{ await client?.close(); }catch{} client=null; db=null; }
module.exports = { connect, getDb, close };
