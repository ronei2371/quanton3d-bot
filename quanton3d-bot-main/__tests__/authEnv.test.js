import { spawnSync } from 'node:child_process';

describe('authRoutes env validation', () => {
  it('warns and blocks login when ADMIN_PASSWORD is missing', () => {
    const result = spawnSync(
      'node',
      ['-e', "import('./src/routes/authRoutes.js').catch((err) => { console.error(err.message); process.exit(1); })"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ADMIN_PASSWORD: '',
          ADMIN_JWT_SECRET: '',
          ADMIN_USER: ''
        }
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr.toString()).toContain('ADMIN_PASSWORD não configurada');
  });

  it('loads using default ADMIN_USER when env var is missing', () => {
    const result = spawnSync(
      'node',
      ['-e', "import('./src/routes/authRoutes.js')"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ADMIN_PASSWORD: 'test-password',
          ADMIN_JWT_SECRET: 'test-secret',
          ADMIN_USER: ''
        }
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr.toString()).not.toContain('ADMIN_PASSWORD não configurada');
  });

  it('loads when all required auth env vars exist', () => {
    const result = spawnSync(
      'node',
      ['-e', "import('./src/routes/authRoutes.js')"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ADMIN_PASSWORD: 'test-password',
          ADMIN_JWT_SECRET: 'test-secret',
          ADMIN_USER: 'admin'
        }
      }
    );

    expect(result.status).toBe(0);
  });
});
