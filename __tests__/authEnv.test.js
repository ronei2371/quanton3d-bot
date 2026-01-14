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
          ADMIN_USER: '',
          ADMIN_JWT_SECRET: ''
        }
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain('Missing required auth env vars');
  });
});
