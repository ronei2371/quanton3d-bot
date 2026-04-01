import { connectToMongo, getPrintParametersCollection, closeMongo } from '../db.js';

const clearPrintParameters = async () => {
  try {
    await connectToMongo();
    const collection = getPrintParametersCollection();
    const result = await collection.deleteMany({});
    console.log(`[MongoDB] Registros removidos de parametros: ${result.deletedCount}`);
  } catch (error) {
    console.error('[MongoDB] Falha ao limpar parametros:', error.message);
    process.exitCode = 1;
  } finally {
    await closeMongo();
  }
};

clearPrintParameters();
