import fs from "fs";
import OpenAI from "openai";
import { recursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChromaClient } from "chromadb";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient({ path: "./quanton3d-db" });

async function gerarEmbeddings() {
  const texto = fs.readFileSync("./conhecimento.txt", "utf8");

  // divide em blocos de 800 tokens
  const splitter = new recursiveCharacterTextSplitter({ chunkSize: 3000, chunkOverlap: 300 });
  const chunks = await splitter.splitText(texto);

  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    const emb = await client.embeddings.create({
      model: "text-embedding-3-large",
      input: content
    });

    await chroma.add({
      ids: [`doc-${i}`],
      embeddings: [emb.data[0].embedding],
      metadatas: [{ source: "conhecimento", index: i }],
      documents: [content]
    });

    console.log(`✅ Embedding ${i + 1}/${chunks.length} salvo`);
  }

  console.log("🚀 Base de conhecimento vetorial gerada com sucesso!");
}

gerarEmbeddings();

