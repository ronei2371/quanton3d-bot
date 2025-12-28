import { connectToMongo, isConnected } from "../../db.js";

function shouldInitMongo() {
  return Boolean(process.env.MONGODB_URI);
}

function shouldInitRAG() {
  return Boolean(process.env.OPENAI_API_KEY) && shouldInitMongo();
}

async function ensureMongoReady() {
  if (!shouldInitMongo()) {
    return false;
  }
  if (!isConnected()) {
    try {
      await connectToMongo();
    } catch (err) {
      console.warn("⚠️ MongoDB indisponível para rota pública:", err.message);
      return false;
    }
  }
  return true;
}

export {
  ensureMongoReady,
  shouldInitMongo,
  shouldInitRAG
};
