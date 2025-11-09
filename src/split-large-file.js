import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const baseDir = path.dirname(fileURLToPath(import.meta.url));

// arquivo de entrada na mesma pasta
const inputFile = path.join(baseDir, "conhecimento.txt");

// pasta "chunks" dentro de /src
const chunksDir = path.join(baseDir, "chunks");
if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });

const content = fs.readFileSync(inputFile, "utf8");
const parts = content.match(/(.|\n){1,10000}/g) || []; // ~10k chars

parts.forEach((chunk, i) => {
  const fileName = path.join(chunksDir, `chunk_${i + 1}.txt`);
  fs.writeFileSync(fileName, chunk);
  console.log(`✅ Gerado: ${fileName}`);
});

console.log(`✨ Total de ${parts.length} partes criadas com sucesso.`);
