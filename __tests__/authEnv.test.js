import { spawnSync } from 'node:child_process';

describe('authRoutes env validation', () => {
  it('loads with fallback when required auth env vars are missing', () => {
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
    expect(result.stderr.toString()).toContain('Credenciais admin ausentes');
  });

  it('loads with fallback when ADMIN_USER is missing', () => {
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
    expect(result.stderr.toString()).toContain('Credenciais admin ausentes');
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
    expect(result.stderr.toString()).not.toContain('Credenciais admin ausentes');
  });
});
