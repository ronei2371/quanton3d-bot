import { spawnSync } from 'node:child_process';

describe('authRoutes env validation', () => {
  it('fails fast when required auth env vars are missing', () => {
    const result = spawnSync(
      'node',
      ['-e', "import('./src/routes/authRoutes.js').catch((err) => { console.error(err.message); process.exit(1); })"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ADMIN_PASSWORD: '',
          ADMIN_JWT_SECRET: ''
        }
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain('Missing required auth env vars');
  });

  it('allows missing ADMIN_USER when other required env vars exist', () => {
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
  });
});
