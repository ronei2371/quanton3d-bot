const fs = require('fs');

// Função para dividir o texto em chunks
function splitIntoChunks(text, chunkSize = 3000, overlap = 300) {
  const chunks = [];
  let start = 0;
  const textLength = text.length; // Corrigido: use .length em JS, não len()
  while (start < textLength) {
    let end = start + chunkSize;
    if (end > textLength) end = textLength; // Evita overflow no último chunk
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start > textLength - chunkSize) break; // Evita loops infinitos se overlap grande
  }
  return chunks;
}

// Ler o arquivo original
const filePath = './conhecimento.txt'; // Assuma na mesma pasta; ajuste se necessário
let text;
try {
  text = fs.readFileSync(filePath, 'utf-8');
} catch (error) {
  console.error(`Erro ao ler ${filePath}: ${error.message}`);
  process.exit(1);
}

// Dividir e salvar chunks
const chunks = splitIntoChunks(text);
chunks.forEach((chunk, index) => {
  const chunkFileName = `chunk_${index + 1}.txt`;
  fs.writeFileSync(chunkFileName, chunk, 'utf-8');
  console.log(`Criado ${chunkFileName} com ${chunk.length} caracteres.`);
});

console.log(`Divisão concluída! Gerados ${chunks.length} chunks.`);
