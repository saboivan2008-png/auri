type Env = {
  OPENAI_API_KEY?: string;
  AURA_MODEL?: string;
  AURA_API_TOKEN?: string;
  AURA_ALLOWED_ORIGIN?: string;
};

const TOOL_CATALOG = [
  { id: 'apollo', name: 'Apollo', purpose: 'prospecting and lead research', requiresApproval: false },
  { id: 'hubspot', name: 'HubSpot', purpose: 'CRM and sales pipeline', requiresApproval: false },
  { id: 'stripe', name: 'Stripe', purpose: 'products, subscriptions and payments', requiresApproval: true },
  { id: 'xtb', name: 'XTB', purpose: 'investment analysis and trading', requiresApproval: true },
  { id: 'telegram', name: 'Telegram', purpose: 'notifications and messaging', requiresApproval: true },
  { id: 'github', name: 'GitHub', purpose: 'source code and delivery', requiresApproval: true },
  { id: 'cloudflare', name: 'Cloudflare', purpose: 'production runtime and deployment', requiresApproval: true },
  { id: 'replit', name: 'Replit', purpose: 'development and secondary runtime', requiresApproval: true },
];

function corsHeaders(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.AURA_ALLOWED_ORIGIN || 'https://auri.saboivan2008.workers.dev',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(data: unknown, env: Env, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(env) } });
}

function authorized(request: Request, env: Env) {
  const header = request.headers.get('authorization') || '';
  return Boolean(env.AURA_API_TOKEN) && header === `Bearer ${env.AURA_API_TOKEN}`;
}

const SYSTEM_PROMPT = `You are AURA, an AI business agent. Turn the owner's goal into an actionable plan. Be concise and operational. You may recommend using tools from the connected-tool catalog, but never claim a tool action actually happened unless the runtime confirms it. Financial, trading, payment, messaging, deployment, deletion, or other irreversible actions always require explicit owner approval. If a connector is not configured in the runtime, say so and give the exact next integration step.`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(env) });
    const url = new URL(request.url);

    if (url.pathname === '/') return new Response('<meta http-equiv="refresh" content="0; url=/console">', { headers: { 'content-type': 'text/html; charset=utf-8' } });

    if (url.pathname === '/health') return json({
      ok: true,
      service: 'AURA',
      runtime: 'cloudflare-workers',
      aiConfigured: Boolean(env.OPENAI_API_KEY),
      agentApiProtected: Boolean(env.AURA_API_TOKEN),
      model: env.AURA_MODEL || 'gpt-5.6',
      toolCatalog: TOOL_CATALOG.map(t => t.id),
    }, env);

    if (url.pathname === '/api/capabilities' && request.method === 'GET') {
      if (!authorized(request, env)) return json({ ok: false, error: 'Unauthorized.' }, env, 401);
      return json({ ok: true, agent: 'AURA', runtime: 'cloudflare-workers', tools: TOOL_CATALOG }, env);
    }

    if (url.pathname === '/console') {
      return new Response(`<!doctype html><html lang="sk"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AURA</title><style>body{font-family:system-ui;max-width:760px;margin:20px auto;padding:20px;background:#111;color:#eee}textarea,input,button{width:100%;box-sizing:border-box;margin:8px 0;padding:12px;border-radius:10px;border:1px solid #444;background:#1d1d1d;color:#fff}button{cursor:pointer;background:#fff;color:#111;font-weight:700}pre{white-space:pre-wrap;background:#181818;padding:14px;border-radius:10px}</style><h1>AURA</h1><p>Live AI business agent</p><input id="token" type="password" autocomplete="off" placeholder="AURA API token"><textarea id="task" rows="7" maxlength="12000" placeholder="Čo má AURA urobiť?"></textarea><button id="run">Spustiť AURU</button><pre id="out">Pripravená.</pre><script>const $=id=>document.getElementById(id);$('run').onclick=async()=>{const token=$('token').value.trim(),task=$('task').value.trim();if(!token||!task){$('out').textContent='Vyplň token a úlohu.';return}$('out').textContent='AURA pracuje…';try{const r=await fetch('/api/agent',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({task})});const d=await r.json();$('out').textContent=JSON.stringify(d,null,2)}catch(e){$('out').textContent='Chyba spojenia: '+e.message}}</script></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
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
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Available tool catalog:\n${JSON.stringify(TOOL_CATALOG)}\n\nOwner goal:\n${task}` },
            ],
          }),
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        return json({ ok: false, error: 'AI provider unavailable or timed out.' }, env, 504);
      }
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) return json({ ok: false, error: 'AI provider request failed.' }, env, response.status);
      return json({ ok: true, agent: 'AURA', status: 'planned', response: data }, env);
    }

    return json({ ok: true, service: 'AURA', message: 'AURA runtime online', endpoints: ['/health', '/console', '/api/capabilities', '/api/agent'] }, env);
  },
};
