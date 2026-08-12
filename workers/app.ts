type Env = {
  OPENAI_API_KEY?: string;
  AURA_MODEL?: string;
  AURA_API_TOKEN?: string;
  AURA_ALLOWED_ORIGIN?: string;
};

function corsHeaders(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.AURA_ALLOWED_ORIGIN || 'https://auri.saboivan2008.workers.dev',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(data: unknown, env: Env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(env) },
  });
}

function authorized(request: Request, env: Env) {
  const header = request.headers.get('authorization') || '';
  return Boolean(env.AURA_API_TOKEN) && header === `Bearer ${env.AURA_API_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(env) });
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'AURA',
        runtime: 'cloudflare-workers',
        aiConfigured: Boolean(env.OPENAI_API_KEY),
        agentApiProtected: Boolean(env.AURA_API_TOKEN),
        model: env.AURA_MODEL || 'gpt-5.6',
      }, env);
    }

    if (url.pathname === '/api/agent' && request.method === 'POST') {
      if (!env.OPENAI_API_KEY) {
        return json({ ok: false, error: 'AURA AI is not configured.' }, env, 503);
      }
      if (!authorized(request, env)) {
        return json({ ok: false, error: 'Unauthorized.' }, env, 401);
      }

      const body = await request.json().catch(() => null) as { task?: unknown } | null;
      const task = typeof body?.task === 'string' ? body.task.trim() : '';
      if (!task) return json({ ok: false, error: 'task is required' }, env, 400);
      if (task.length > 12000) return json({ ok: false, error: 'task is too large' }, env, 413);

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
      if (!response.ok) return json({ ok: false, error: 'AI provider request failed.' }, env, response.status);

      return json({ ok: true, agent: 'AURA', response: data }, env);
    }

    return json({ ok: true, service: 'AURA', message: 'AURA runtime online', endpoints: ['/health', '/api/agent'] }, env);
  },
};
