import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

function authorized(c) {
  const configured = process.env.AURA_API_TOKEN;
  const header = c.req.header('authorization') || '';
  return Boolean(configured) && header === `Bearer ${configured}`;
}

app.get('/health', (c) => c.json({
  ok: true,
  service: 'AURA',
  mode: 'node-runtime',
  agentApiProtected: Boolean(process.env.AURA_API_TOKEN),
}));

app.post('/api/agent', async (c) => {
  if (!authorized(c)) return c.json({ ok: false, error: 'Unauthorized.' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) return c.json({ ok: false, error: 'task is required' }, 400);
  if (task.length > 12000) return c.json({ ok: false, error: 'task is too large' }, 413);
  return c.json({
    ok: true,
    agent: 'AURA',
    task,
    status: 'planned',
    note: 'Node runtime is protected. Connector execution and approval gates must be confirmed by the runtime before any action is reported as completed.',
  });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT || 8787) });
