type Env = {
  OPENAI_API_KEY?: string;
  AURA_MODEL?: string;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'AURA',
        runtime: 'cloudflare-workers',
        aiConfigured: Boolean(env.OPENAI_API_KEY),
        model: env.AURA_MODEL || 'gpt-5.6',
      });
    }

    if (url.pathname === '/api/agent' && request.method === 'POST') {
      if (!env.OPENAI_API_KEY) {
        return json({ ok: false, error: 'AURA AI is not configured: add OPENAI_API_KEY as a Worker secret.' }, 503);
      }

      const body = await request.json().catch(() => null) as { task?: unknown } | null;
      const task = typeof body?.task === 'string' ? body.task.trim() : '';
      if (!task) return json({ ok: false, error: 'task is required' }, 400);

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.AURA_MODEL || 'gpt-5.6',
          input: [
            {
              role: 'system',
              content: 'You are AURA, an AI business agent. Plan tasks clearly, use connected tools only when configured, and never execute financial or irreversible actions without explicit owner approval.',
            },
            { role: 'user', content: task },
          ],
        }),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) return json({ ok: false, error: 'AI provider request failed', provider: data }, response.status);

      return json({ ok: true, agent: 'AURA', response: data });
    }

    return json({ ok: true, service: 'AURA', message: 'AURA runtime online', endpoints: ['/health', '/api/agent'] });
  },
};
