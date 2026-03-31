// quanton3d-bot/apiRoutes.js
/**
 * ApiRoutes principal - com correções:
 * - usa authMiddleware (src/middleware/authMiddleware.js)
 * - PUT /contact/:id -> atualiza todas as coleções (sem return dentro do loop)
 * - DELETE /gallery/:id -> hard delete (deleteOne) e helper que limpa outras coleções
 * - getGalleryCollections inclui 'visualKnowledge'
 *
 * IMPORTANTE: este arquivo assume que a conexão ao Mongo está disponível em:
 *    req.app.locals.db  OU  global.db
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const authMiddleware = require('./src/middleware/authMiddleware'); // já criado por você

// helper para obter o db sem depender de localização fixa
function getDb(req) {
  return (req && req.app && req.app.locals && req.app.locals.db) || global.db || null;
}

// --- helpers --- //
function resolveId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : id;
}

function getGalleryCollections(db) {
  // mantenha os nomes de coleções conforme seu banco
  return [
    db.collection('gallery'),
    db.collection('gallery_backup'),
    db.collection('visualKnowledge'), // adicionado explicitamente
  ];
}

async function deleteGalleryAcrossCollections(db, _id) {
  const collections = getGalleryCollections(db);
  for (const col of collections) {
    try {
      await col.deleteOne({ _id });
    } catch (err) {
      console.warn(`[deleteGalleryAcrossCollections] erro ao deletar em ${col.collectionName}:`, err.message);
    }
  }
}

// --- rotas --- //

// exemplo: rota de health / ping
router.get('/health', (req, res) => res.json({ ok: true }));

// PUT /contact/:id -> atualiza todas as coleções possíveis sem retornar cedo
router.put('/contact/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    if (!db) return res.status(500).json({ error: 'DB não disponível' });

    const { id } = req.params;
    const update = req.body || {};
    const collections = [
      db.collection('contacts'),
      db.collection('messages'),
      db.collection('pedidos'),
    ];

    const _id = resolveId(id);

    let updatedCount = 0;
    const updatedDocs = [];

    for (const collection of collections) {
      let query = _id ? { _id } : { id }; // legacy fallback
      const result = await collection.findOneAndUpdate(
        query,
        { $set: update },
        { returnDocument: 'after' }
      );
      const updated = result?.value || null;
      if (updated) {
        updatedCount++;
        updatedDocs.push({ collection: collection.collectionName || 'unknown', doc: updated });
      }
      // NOTE: NÃO retornar aqui — queremos varrer todas as coleções
    }

    return res.json({ ok: true, updatedCount, updated: updatedDocs });
  } catch (err) {
    console.error('[PUT /contact/:id] erro', err);
    return res.status(500).json({ error: 'Erro interno ao atualizar contato' });
  }
});

// DELETE /gallery/:id -> hard delete
router.delete('/gallery/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    if (!db) return res.status(500).json({ error: 'DB não disponível' });

    const { id } = req.params;
    const _id = resolveId(id);

    const galleryCollection = db.collection('gallery');
    const result = await galleryCollection.deleteOne({ _id });

    if (result.deletedCount && result.deletedCount > 0) {
      // opcional: limpar em outras coleções que também guardariam referências
      await deleteGalleryAcrossCollections(db, _id);
      return res.json({ ok: true, deletedCount: result.deletedCount });
    } else {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }
  } catch (err) {
    console.error('[DELETE /gallery/:id] erro', err);
    return res.status(500).json({ error: 'Erro interno ao deletar item da galeria' });
  }
});

// (Opcional) rota para aprovar a imagem na galeria
// Depende do seu backend — este é um padrão: POST /gallery/:id/approve
router.post('/gallery/:id/approve', authMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    if (!db) return res.status(500).json({ error: 'DB não disponível' });

    const { id } = req.params;
    const _id = resolveId(id);

    const galleryCollection = db.collection('gallery');
    const result = await galleryCollection.findOneAndUpdate(
      { _id },
      { $set: { approved: true, approvedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (result.value) {
      return res.json({ ok: true, updated: result.value });
    } else {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }
  } catch (err) {
    console.error('[POST /gallery/:id/approve] erro', err);
    return res.status(500).json({ error: 'Erro interno ao aprovar item da galeria' });
  }
});

// exporta router
module.exports = router;
