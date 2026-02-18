import express, { type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { ingest } from './ingest.js';
import type { HaePayload } from '../types/hae.js';

export function createApp(db: Database.Database, opts: { token?: string } = {}) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.post('/api/ingest', (req: Request, res: Response) => {
    // Optional bearer token auth
    if (opts.token) {
      const authHeader = req.headers['authorization'] ?? '';
      const apiKey = (req.headers['x-api-key'] as string) ?? '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (bearer !== opts.token && apiKey !== opts.token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    try {
      const payload = req.body as HaePayload;
      if (!payload?.data) {
        res.status(400).json({ error: 'Missing data field' });
        return;
      }

      ingest(db, payload, {
        target: (req.query['target'] as string) ?? 'default',
        sessionId: (req.headers['session-id'] as string) ?? null,
        automationName: req.headers['automation-name'] as string | undefined,
        automationPeriod: req.headers['automation-period'] as string | undefined,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('Ingest error:', err);
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  return app;
}
