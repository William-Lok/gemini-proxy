export const config = {
  runtime: 'edge',
  regions: ['iad1'],
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key',
  'Access-Control-Expose-Headers': 'X-Proxy-Region',
  'Cache-Control': 'no-store',
};

function localResponse(body, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders,
      'X-Proxy-Region': process.env.VERCEL_REGION || 'local',
      ...extraHeaders,
    },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!['GET', 'POST'].includes(req.method)) {
    return localResponse({ error: { message: 'Use GET, POST, or OPTIONS.' } }, 405,
      { Allow: 'GET, POST, OPTIONS' });
  }

  const incoming = new URL(req.url);
  // Rewrites explicitly pass the upstream path. Also handle an original URL
  // preserved by Vercel, without depending on rewrite URL behavior.
  const path = incoming.pathname === '/api/proxy'
    ? incoming.searchParams.get('__gemini_path') || ''
    : incoming.pathname.replace(/^\/api(?:\/proxy)?(?=\/v1beta\/)/, '');

  if (!path && req.method === 'GET') {
    return localResponse({
      service: 'gemini-proxy',
      version: '2',
      region: process.env.VERCEL_REGION || 'local',
      modelsEndpoint: '/api/v1beta/models',
    });
  }
  if (!/^\/v1beta\/models(?:\/[A-Za-z0-9._:-]+)?$/.test(path)) {
    return localResponse({ error: { message: 'Use /api/v1beta/models or /api/v1beta/models/{model}:generateContent.' } }, 404);
  }

  const url = new URL('https://generativelanguage.googleapis.com');
  url.pathname = path;
  url.search = incoming.search;
  url.searchParams.delete('__gemini_path');
  // Vercel also adds the captured rewrite parameter to the query string.
  // It is routing metadata, not a Google API parameter.
  url.searchParams.delete('path');

  // Forward only API headers, never the client's Host, cookies, or IP headers.
  const headers = new Headers();
  for (const name of ['content-type', 'accept', 'x-goog-api-key']) {
    if (req.headers.has(name)) headers.set(name, req.headers.get(name));
  }
  // Prefer a header to avoid passing the key in the upstream URL.
  if (!headers.has('x-goog-api-key') && url.searchParams.has('key')) {
    headers.set('x-goog-api-key', url.searchParams.get('key'));
  }
  url.searchParams.delete('key');
  if (!headers.get('x-goog-api-key')) {
    return localResponse({ error: { message: 'Supply your Gemini API key in the x-goog-api-key header.' } }, 401);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      // Buffer the request, while leaving upstream SSE responses streamed.
      body: req.method === 'POST' ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      signal: controller.signal,
    });
    const responseHeaders = new Headers(response.headers);
    // fetch may decompress the upstream body; discard obsolete size/encoding.
    responseHeaders.delete('content-length');
    responseHeaders.delete('content-encoding');
    for (const [name, value] of Object.entries(corsHeaders)) responseHeaders.set(name, value);
    responseHeaders.set('X-Proxy-Region', process.env.VERCEL_REGION || 'local');
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
    return localResponse({ error: { message: timeout
      ? 'Google did not respond before the proxy timeout.'
      : 'The proxy could not connect to Google.' } }, timeout ? 504 : 502);
  } finally {
    // Limit the wait for response headers, without cutting off SSE streams.
    clearTimeout(timer);
  }
}
