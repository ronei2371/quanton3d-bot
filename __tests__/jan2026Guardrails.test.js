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
  });
});
