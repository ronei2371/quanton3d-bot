import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Pega o caminho da pasta atual (a pasta /src)
const baseDir = path.dirname(fileURLToPath(import.meta.url));

// 1. O arquivo de entrada está na MESMA pasta
const inputFile = path.join(baseDir, "conhecimento.txt");

// A pasta de saída (chunks) também será criada dentro de /src
const chunksDir = path.join(baseDir, "chunks");
if (!fs.existsSync(chunksDir)) {
  fs.mkdirSync(chunksDir, { recursive: true });
}

console.log(`Lendo arquivo: ${inputFile}`);
const content = fs.readFileSync(inputFile, "utf8");
console.log("Arquivo lido, iniciando divisão...");

// 2. MUDANÇA: Dividir a cada 8.000 caracteres
const parts = content.match(/(.|\n){1,8000}/g) || []; // Divide a cada 8k chars

parts.forEach((chunk, i) => {
  const fileName = path.join(chunksDir, `chunk_${i + 1}.txt`);
  fs.writeFileSync(fileName, chunk);
  console.log(`✅ Gerado: ${fileName}`);
});

console.log(`✨ Total de ${parts.length} partes criadas com sucesso.`);
