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

// Código existente (não apague nada daqui pra cima)

// Nova função adicionada para gerar e uploadar embeddings dos chunks
async function generateEmbeddings() {
  const chunkFiles = fs.readdirSync(__dirname).filter(file => file.startsWith('chunk_') && file.endsWith('.txt'));
  for (let i = 0; i < chunkFiles.length; i++) {
    const text = fs.readFileSync(chunkFiles[i], 'utf-8');
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    }).then(res => res.data[0].embedding);

    await index.upsert([{
      id: chunkFiles[i],
      values: embedding,
      metadata: { file: chunkFiles[i], textPreview: text.slice(0, 200) }
    }]);
    console.log(`Embedding gerado e uploadado para ${chunkFiles[i]}`);
  }
  console.log('Todos embeddings prontos!');
}

// Para rodar, descomente: generateEmbeddings().catch(console.error);
