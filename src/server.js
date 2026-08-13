import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

const app = new Hono();

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'https://api.openai.com'],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: [],
  },
  crossOriginEmbedderPolicy: false,
}));

function authorized(c) {
  const configured = process.env.AURA_API_TOKEN;
  const header = c.req.header('authorization') || '';
  return Boolean(configured) && header === `Bearer ${configured}`;
}

function systemPrompt() {
  return 'You are AURA, an AI business agent. Turn the owner goal into a concise actionable plan. Never claim a connector action happened unless the runtime confirms it. Financial, trading, payment, messaging, deployment, deletion, or other irreversible actions require explicit owner approval. If a connector is not configured, say so and provide the next integration step.';
}

app.get('/', (c) => c.html(`<!doctype html><html lang="sk"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AURA Space</title><style>body{margin:0;background:#07070a;color:#f7f7fb;font-family:system-ui,-apple-system,sans-serif}main{max-width:980px;margin:auto;padding:90px 24px}.eyebrow{letter-spacing:.16em;text-transform:uppercase;color:#8f93a3;font-size:12px}h1{font-size:clamp(54px,10vw,110px);line-height:.9;letter-spacing:-.06em;margin:18px 0}.g{background:linear-gradient(100deg,#fff,#8d8dff,#65e6d8);background-clip:text;color:transparent}p{color:#b5b8c5;line-height:1.7;max-width:650px;font-size:20px}.btn{display:inline-block;margin-top:24px;padding:14px 20px;border-radius:14px;background:#fff;color:#08080a;font-weight:800;text-decoration:none}</style><main><div class="eyebrow">AURA Space · AI Operating System</div><h1>Intelligence that <span class="g">works.</span></h1><p>AURA je pracovný AI agent pre firmy. Premýšľa nad cieľmi, pripravuje operácie a drží citlivé akcie pod kontrolou vlastníka.</p><a class="btn" href="/health">Check AURA</a></main></html>`));

app.get('/health', (c) => c.json({
  ok: true,
  service: 'AURA',
  mode: 'node-runtime',
  agentApiProtected: Boolean(process.env.AURA_API_TOKEN),
  aiConfigured: Boolean(process.env.OPENAI_API_KEY),
  model: process.env.AURA_MODEL || 'gpt-5.6',
}));

app.post('/api/agent', async (c) => {
  if (!authorized(c)) return c.json({ ok: false, error: 'Unauthorized.' }, 401);
  if (!process.env.OPENAI_API_KEY) return c.json({ ok: false, error: 'AURA AI is not configured.' }, 503);
  const body = await c.req.json().catch(() => ({}));
  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) return c.json({ ok: false, error: 'task is required' }, 400);
  if (task.length > 12000) return c.json({ ok: false, error: 'task is too large' }, 413);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.AURA_MODEL || 'gpt-5.6',
        input: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: task },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return c.json({ ok: false, error: 'AI provider request failed.' }, response.status);
    return c.json({ ok: true, agent: 'AURA', status: 'planned', response: data });
  } catch {
    return c.json({ ok: false, error: 'AI provider unavailable or timed out.' }, 504);
  }
});

serve({ fetch: app.fetch, port: Number(process.env.PORT || 8787) });
