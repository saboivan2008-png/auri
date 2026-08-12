import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'AURA', mode: 'runtime' }));

app.post('/api/agent', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) return c.json({ error: 'task is required' }, 400);
  return c.json({
    ok: true,
    agent: 'AURA',
    task,
    status: 'accepted',
    note: 'Tool execution will be routed through configured connectors and approval gates.'
  });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT || 8787) });
