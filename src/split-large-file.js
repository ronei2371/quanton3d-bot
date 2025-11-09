import fs from "fs";

// Caminho do seu arquivo de conhecimento
const inputFile = "conhecimento.txt";

// Cria a pasta "chunks" se ela não existir
if (!fs.existsSync("chunks")) {
  fs.mkdirSync("chunks");
}

// Lê todo o conteúdo do arquivo
const content = fs.readFileSync(inputFile, "utf8");

// Divide em blocos de aproximadamente 10.000 caracteres
const parts = content.match(/(.|\n){1,10000}/g);

parts.forEach((chunk, i) => {
  const fileName = `chunks/chunk_${i + 1}.txt`;
  fs.writeFileSync(fileName, chunk);
  console.log(`✅ Gerado: ${fileName}`);
});

console.log(`✨ Total de ${parts.length} partes criadas com sucesso.`);
