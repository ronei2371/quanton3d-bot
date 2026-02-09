import express from 'express';
import request from 'supertest';
import { buildAdminRoutes } from '../src/routes/adminRoutes.js';

describe('admin login fallback behavior', () => {
  it('does not fail with 500 when ADMIN_JWT_SECRET is missing', async () => {
    const previousJwt = process.env.ADMIN_JWT_SECRET;
    const previousUser = process.env.ADMIN_USER;
    const previousPassword = process.env.ADMIN_PASSWORD;

    delete process.env.ADMIN_JWT_SECRET;
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;

    const app = express();
    app.use(express.json());
    app.use('/admin', buildAdminRoutes());

    const response = await request(app)
      .post('/admin/login')
      .send({ user: 'admin', password: 'admin' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);

    if (previousJwt === undefined) delete process.env.ADMIN_JWT_SECRET;
    else process.env.ADMIN_JWT_SECRET = previousJwt;
    if (previousUser === undefined) delete process.env.ADMIN_USER;
    else process.env.ADMIN_USER = previousUser;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  });
});
