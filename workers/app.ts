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
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(env),
    },
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

    if (url.pathname === '/') {
      return new Response('<meta http-equiv="refresh" content="0; url=/console">', {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    if (url.pathname === '/console') {
      return new Response(`<!doctype html><html lang="sk"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"><title>AURA Console</title><style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:20px;background:#111;color:#eee}textarea,input,button{width:100%;box-sizing:border-box;margin:8px 0;padding:12px;border-radius:10px;border:1px solid #444;background:#1d1d1d;color:#fff}button{cursor:pointer;background:#fff;color:#111;font-weight:700}pre{white-space:pre-wrap;background:#181818;padding:14px;border-radius:10px}</style><h1>AURA</h1><p>Live agent console</p><input id="token" type="password" autocomplete="off" placeholder="AURA API token"><textarea id="task" rows="6" maxlength="12000" placeholder="Zadaj úlohu AURE..."></textarea><button id="run">Spustiť AURU</button><pre id="out">Pripravená.</pre><script>const $=id=>document.getElementById(id);$('run').onclick=async()=>{const token=$('token').value.trim(),task=$('task').value.trim();if(!token||!task){$('out').textContent='Vyplň token a úlohu.';return}$('out').textContent='AURA pracuje…';try{const r=await fetch('/api/agent',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({task})});const d=await r.json();$('out').textContent=JSON.stringify(d,null,2)}catch(e){$('out').textContent='Chyba spojenia: '+e.message}}</script></html>`, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'AURA', runtime: 'cloudflare-workers', aiConfigured: Boolean(env.OPENAI_API_KEY), agentApiProtected: Boolean(env.AURA_API_TOKEN), model: env.AURA_MODEL || 'gpt-5.6' }, env);
    }

    if (url.pathname === '/api/agent' && request.method === 'POST') {
      if (!env.OPENAI_API_KEY) return json({ ok: false, error: 'AURA AI is not configured.' }, env, 503);
      if (!authorized(request, env)) return json({ ok: false, error: 'Unauthorized.' }, env, 401);
      const body = await request.json().catch(() => null) as { task?: unknown } | null;
      const task = typeof body?.task === 'string' ? body.task.trim() : '';
      if (!task) return json({ ok: false, error: 'task is required' }, env, 400);
      if (task.length > 12000) return json({ ok: false, error: 'task is too large' }, env, 413);

      let response: Response;
      try {
        response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: env.AURA_MODEL || 'gpt-5.6',
            input: [
              { role: 'system', content: 'You are AURA, an AI business agent. Plan tasks clearly, use connected tools only when configured, and never execute financial or irreversible actions without explicit owner approval.' },
              { role: 'user', content: task },
            ],
          }),
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        return json({ ok: false, error: 'AI provider unavailable or timed out.' }, env, 504);
      }

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) return json({ ok: false, error: 'AI provider request failed.' }, env, response.status);
      return json({ ok: true, agent: 'AURA', response: data }, env);
    }

    return json({ ok: true, service: 'AURA', message: 'AURA runtime online', endpoints: ['/health', '/console', '/api/agent'] }, env);
  },
};
