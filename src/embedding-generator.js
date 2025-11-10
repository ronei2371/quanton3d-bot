import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChromaClient } from "chromadb";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient({ path: "./quanton3d-db" });

async function gerarEmbeddings() {
  const baseDir = path.dirname(new URL(import.meta.url).pathname);
  const files = fs.readdirSync(baseDir).filter(f => f.startsWith("chunk_") && f.endsWith(".txt"));

  for (let i = 0; i < files.length; i++) {
    const content = fs.readFileSync(path.join(baseDir, files[i]), "utf8");
    const emb = await client.embeddings.create({
      model: "text-embedding-3-large",
      input: content
    });
    await chroma.add({
      ids: [`doc_${i}`],
      embeddings: [emb.data[0].embedding],
      documents: [content]
    });
    console.log(`✅ Embedding ${i + 1}/${files.length} gerado com sucesso (${files[i]})`);
  }

  console.log("✨ Todos os embeddings foram gerados com sucesso!");
}

gerarEmbeddings();
