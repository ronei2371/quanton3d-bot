import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Diretrizes Técnicas Jan/2026 guardrails', () => {
  it('keeps /resins sourced from MongoDB collection parametros', () => {
    const apiRoutes = read('src/routes/apiRoutes.js');

    expect(apiRoutes).toContain('listCollections({ name: "parametros" })');
    expect(apiRoutes).toContain('getCollection("parametros")');
    expect(apiRoutes).not.toContain('print_parameters');
  });


  it('keeps pedidos fallback accessible when orders exists but is empty', () => {
    const apiRoutes = read('src/routes/apiRoutes.js');

    expect(apiRoutes).toContain("const ORDER_COLLECTION_NAMES = ['orders', 'pedidos', 'custom_requests']");
    expect(apiRoutes).toContain('const getAvailableOrderCollections = async () => {');
    expect(apiRoutes).toContain('collections.map((collection) => collection.find({}).toArray())');
    expect(apiRoutes).toContain('for (const collection of collections) {');
  });

  it('keeps chat compatibility routes available', () => {
    const server = read('server.js');

    expect(server).toContain("app.use('/api', chatRoutes)");
    expect(server).toContain("app.use('/chat', chatRoutes)");
    expect(server).toContain("app.use('/', chatRoutes)");
  });

  it('keeps root compatibility for public routes without /api', () => {
    const server = read('server.js');

    expect(server).toContain("app.use('/', apiRoutes)");
  });

  it('stores full share-settings payload from gallery form', () => {
    const apiRoutes = read('src/routes/apiRoutes.js');

    expect(apiRoutes).toContain('const GALLERY_NON_SETTINGS_FIELDS = new Set([');
    expect(apiRoutes).toContain('const extractSettingsFromBody = (body = {}) => {');
  });



  it('keeps /suggest-knowledge compatible with suggestion payload shape', () => {
    const adminRoutes = read('src/routes/adminRoutes.js');

    expect(adminRoutes).toContain('const { title, content, suggestion, tags, source, userName, userPhone, lastUserMessage, lastBotReply } = req.body || {};');
    expect(adminRoutes).toContain('const normalizedContent = (content || suggestion || "").toString().trim();');
    expect(adminRoutes).toContain('error: "Sugestão é obrigatória"');
  });

  it('keeps admin suggestions payload compatible with question/answer fields', () => {
    const adminRoutes = read('src/routes/adminRoutes.js');

    expect(adminRoutes).toContain('lastUserMessage: question');
    expect(adminRoutes).toContain('lastBotReply: answer');
    expect(adminRoutes).toContain("suggestion: sug.suggestion || sug.content || sug.conteudo || ''");
  });

  it('keeps Render build flags aligned (CI=true and no-frozen-lockfile)', () => {
    const renderYaml = read('render.yaml');

    expect(renderYaml).toContain('pnpm install --no-frozen-lockfile');
    expect(renderYaml).toContain('key: CI');
    expect(renderYaml).toContain('value: "true"');
    expect(renderYaml).toContain('key: SKIP_INSTALL');
    expect(renderYaml).toContain('value: "false"');
  });
});
