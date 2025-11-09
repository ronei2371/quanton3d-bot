import fs from "fs";

// Lê o arquivo
const content = fs.readFileSync("conhecimento.txt", "utf-8");

// Divide em blocos de ~800 palavras (ajuste se quiser)
const chunks = content.match(/(.|\n){1,4000}/g);

chunks.forEach((chunk, index) => {
  fs.writeFileSync(`chunks/chunk_${index + 1}.txt`, chunk);
});

console.log(`✅ Gerado ${chunks.length} arquivos em /chunks`);

