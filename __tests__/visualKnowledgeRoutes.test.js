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
});
