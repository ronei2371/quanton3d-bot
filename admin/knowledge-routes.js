import { addDocument, listDocuments } from '../rag-search.js';
import { connectToMongo, isConnected } from '../db.js';
import { requireAdmin } from './security.js';

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map(tag => String(tag).trim())
    .filter(Boolean)
    .slice(0, 50);
}

function validateKnowledgePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('payload_invalid');
    return { valid: false, errors };
  }

  const { title, content, source, tags } = payload;
  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push('title_required');
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    errors.push('content_required');
  }
  if (typeof tags !== 'undefined' && !Array.isArray(tags)) {
    errors.push('tags_must_be_array');
  }
  if (typeof source !== 'undefined' && (typeof source !== 'string' || !source.trim())) {
    errors.push('source_invalid');
  }

  const normalized = {
    title: typeof title === 'string' ? title.trim() : '',
    content: typeof content === 'string' ? content.trim() : '',
    source: typeof source === 'string' && source.trim() ? source.trim() : 'admin_import',
    tags: normalizeTags(tags)
  };

  return { valid: errors.length === 0, errors, normalized };
}

async function ensureMongoConnection() {
  if (!isConnected()) {
    await connectToMongo();
  }
}

export function attachKnowledgeRoutes(app) {
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!ADMIN_SECRET || !ADMIN_JWT_SECRET) {
    console.warn('[admin] Rotas de conhecimento desativadas: ADMIN_SECRET/ADMIN_JWT_SECRET ausentes.');
    return;
  }

  const requireAdminJwt = requireAdmin(ADMIN_JWT_SECRET);

  app.post('/admin/knowledge/import', requireAdminJwt, async (req, res) => {
    const validation = validateKnowledgePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'validation_failed', details: validation.errors });
    }

    try {
      await ensureMongoConnection();
      const result = await addDocument(
        validation.normalized.title,
        validation.normalized.content,
        validation.normalized.source,
        validation.normalized.tags
      );

      return res.status(201).json({ ok: true, documentId: result.documentId });
    } catch (error) {
      console.error('[admin] Falha ao importar conhecimento:', error);
      return res.status(500).json({ error: 'knowledge_import_failed', message: error.message });
    }
  });

  app.get('/admin/knowledge/list', requireAdminJwt, async (_req, res) => {
    try {
      await ensureMongoConnection();
      const documents = await listDocuments();
      return res.json({ ok: true, total: documents.length, documents });
    } catch (error) {
      console.error('[admin] Falha ao listar conhecimentos:', error);
      return res.status(500).json({ error: 'knowledge_list_failed', message: error.message });
    }
  });

  console.log('[admin] Rotas de conhecimento ativadas: /admin/knowledge/import, /admin/knowledge/list');
}

export default attachKnowledgeRoutes;
