import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Pega o caminho de ONDE o script está (a pasta /src)
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// Pega o caminho da pasta "pai" (a raiz do projeto)
const rootDir = path.resolve(scriptDir, "..");

// 1. CORREÇÃO: Aponta o arquivo de entrada para a pasta raiz
const inputFile = path.join(rootDir, "conhecimento.txt");

// A pasta de saída (chunks) continua sendo criada dentro de /src
const chunksDir = path.join(scriptDir, "chunks");
if (!fs.existsSync(chunksDir)) {
  fs.mkdirSync(chunksDir, { recursive: true });
}

console.log(`Lendo arquivo: ${inputFile}`);
const content = fs.readFileSync(inputFile, "utf8");
console.log("Arquivo lido, iniciando divisão...");

const parts = content.match(/(.|\n){1,10000}/g) || []; // Divide a cada 10k chars

parts.forEach((chunk, i) => {
  const fileName = path.join(chunksDir, `chunk_${i + 1}.txt`);
  fs.writeFileSync(fileName, chunk);
  console.log(`✅ Gerado: ${fileName}`);
});

console.log(`✨ Total de ${parts.length} partes criadas com sucesso.`);
