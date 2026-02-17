import express from 'express';
import request from 'supertest';
import { apiRoutes } from '../src/routes/apiRoutes.js';

describe('visual knowledge compatibility routes', () => {
  it('responds on GET /api/visual-knowledge (not 404)', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);

    const response = await request(app).get('/api/visual-knowledge');

    expect([200, 503, 500]).toContain(response.status);
    expect(response.status).not.toBe(404);
  });

  it('responds on POST /api/visual-knowledge (not 404)', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);

    const response = await request(app)
      .post('/api/visual-knowledge')
      .send({ title: 'teste', imageUrl: 'https://example.com/test.png' });

    expect([201, 400, 503, 500]).toContain(response.status);
    expect(response.status).not.toBe(404);
  });
codex/revise-todo-bot-e-painel-administrativo-t3a4re

  it('responds on action routes used by admin panel (not 404)', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);

    const itemResponse = await request(app).get('/api/visual-knowledge/507f1f77bcf86cd799439011');
    const approveResponse = await request(app)
      .post('/api/visual-knowledge/507f1f77bcf86cd799439011/approve')
      .send({ defectType: 'Ok', diagnosis: 'Ok', solution: 'Ok' });

    expect(itemResponse.status).not.toBe(404);
    expect(approveResponse.status).not.toBe(404);
    expect([200, 400, 404, 500, 503]).toContain(itemResponse.status);
    expect([200, 400, 404, 500, 503]).toContain(approveResponse.status);
  });

  main
});
