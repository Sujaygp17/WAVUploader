// src/index.js
const ORIGINS = {
  '/wavuser': 'https://dawavinternaluser-btgsaphegvahbug9.eastus-01.azurewebsites.net',
  '/patient': 'https://dawavorderpatient-hqe2apddbje9gte0.eastus-01.azurewebsites.net',
  '/admin':   'https://dawavadmin-djb0f9atf8e6cwgx.eastus-01.azurewebsites.net',
};

const ALLOW_ORIGIN = 'https://sujaygp17.github.io';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, *',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    ...extra,
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Route by prefix
    const prefix = Object.keys(ORIGINS).find(p => url.pathname.startsWith(p));
    if (!prefix) return new Response('Not found', { status: 404, headers: corsHeaders() });

    const target = ORIGINS[prefix] + url.pathname.replace(prefix, '') + url.search;

    const init = {
      method: request.method,
      headers: new Headers(request.headers),
    };
    init.headers.delete('host');

    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = await request.arrayBuffer();
    }

    const resp = await fetch(target, init);

    const headers = new Headers(resp.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

    return new Response(resp.body, { status: resp.status, headers });
  }
};
