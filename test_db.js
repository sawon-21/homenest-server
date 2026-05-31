const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
console.log('Testing connection to:', uri.replace(/:[^:@/]+@/, ':****@'));

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log('Connected successfully to server');
    const adminDb = client.db().admin();
    const info = await adminDb.serverInfo();
    console.log('Server Info:', info);
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.close();
  }
}

run();
