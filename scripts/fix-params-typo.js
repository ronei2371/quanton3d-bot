import dotenv from "dotenv";
import { connectToMongo, Parametros, closeMongo } from "../db.js";

dotenv.config();

const TARGET = "0.05mmmm";
const REPLACEMENT = "0.05mm";

function replaceValues(value, stats) {
  if (typeof value === "string") {
    if (value.includes(TARGET)) {
      stats.replacements += (value.match(new RegExp(TARGET, "g")) || []).length;
      return value.replaceAll(TARGET, REPLACEMENT);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceValues(item, stats));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, replaceValues(val, stats)])
    );
  }

  return value;
}

async function main() {
  const stats = {
    inspected: 0,
    updated: 0,
    replacements: 0
  };

  await connectToMongo();

  const cursor = Parametros.find().cursor();

  // eslint-disable-next-line no-restricted-syntax
  for await (const doc of cursor) {
    stats.inspected += 1;

    const parametros = doc.parametros || {};
    const serialized = JSON.stringify(parametros);
    if (!serialized.includes(TARGET)) {
      continue;
    }

    const cleaned = replaceValues(parametros, stats);
    doc.parametros = cleaned;
    doc.markModified("parametros");
    await doc.save();
    stats.updated += 1;
  }

  console.log(`[cleanup] Inspecionados: ${stats.inspected}`);
  console.log(`[cleanup] Documentos atualizados: ${stats.updated}`);
  console.log(`[cleanup] Ocorrências corrigidas: ${stats.replacements}`);

  await closeMongo();
}

main().catch(async (err) => {
  console.error("[cleanup] Falha ao corrigir parametros:", err);
  await closeMongo();
  process.exit(1);
});
