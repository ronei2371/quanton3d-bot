import express from 'express';
import request from 'supertest';
import chatRoutes from '../src/routes/chatRoutes.js';

describe('chatRoutes upload validation', () => {
  it('rejects non-image uploads with 400', async () => {
    const app = express();
    app.use('/api', chatRoutes);

    const response = await request(app)
      .post('/api/ask-with-image')
      .attach('image', Buffer.from('not-an-image'), {
        filename: 'test.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Apenas imagens são permitidas.');
  });
});
