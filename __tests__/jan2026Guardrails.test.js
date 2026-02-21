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

  it('keeps chat compatibility routes available', () => {
    const server = read('server.js');

    expect(server).toContain("app.use('/api', chatRoutes)");
    expect(server).toContain("app.use('/chat', chatRoutes)");
  });

  it('keeps Render build flags aligned (CI=true and no-frozen-lockfile)', () => {
    const renderYaml = read('render.yaml');

    expect(renderYaml).toContain('pnpm install --no-frozen-lockfile');
    expect(renderYaml).toContain('key: CI');
    expect(renderYaml).toContain('value: "true"');
    expect(renderYaml).toContain('key: SKIP_INSTALL');
    expect(renderYaml).toContain('value: "false"');
  });

  it('does not allow hardcoded admin token fallback', () => {
    const adminRoutes = read('src/routes/adminRoutes.js');
    const apiRoutes = read('src/routes/apiRoutes.js');

    expect(adminRoutes).not.toContain('quanton3d_admin_secret');
    expect(apiRoutes).not.toContain('quanton3d_admin_secret');
  });
  it('has no merge conflict markers in critical route files', () => {
    const apiRoutes = read('src/routes/apiRoutes.js');
    const adminRoutes = read('src/routes/adminRoutes.js');

    for (const content of [apiRoutes, adminRoutes]) {
      expect(content).not.toContain('<<<<<<<');
      expect(content).not.toContain('=======');
      expect(content).not.toContain('>>>>>>>');
      expect(content).not.toContain('codex/review-site-and-bot-changes');
    }
  });

});
