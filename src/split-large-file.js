import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const baseDir   = path.dirname(fileURLToPath(import.meta.url));
const inputFile = path.join(baseDir, "conhecimento.txt");
const outDir    = path.join(baseDir, "chunks");

// 👉 ajuste aqui o tamanho do pedaço (ex.: 20k chars = bem menos arquivos)
const CHUNK_SIZE = 20000;

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const content = fs.readFileSync(inputFile, "utf8");

// split determinístico por caracteres (sem regex)
let count = 0;
for (let i = 0; i < content.length; i += CHUNK_SIZE) {
  const chunk = content.slice(i, i + CHUNK_SIZE);
  const file  = path.join(outDir, `chunk_${++count}.txt`);
  fs.writeFileSync(file, chunk);
  console.log(`✅ Gerado: ${file}`);
}

console.log(`✨ Total de ${count} partes criadas com sucesso.`);
