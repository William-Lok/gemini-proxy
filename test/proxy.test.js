import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { config } from '../api/proxy.js';

test('health and preflight do not contact Google', async () => {
  const health = await handler(new Request('https://proxy.example/api/proxy'));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).version, '2');
  assert.deepEqual(config.regions, ['iad1']);
  const preflight = await handler(new Request('https://proxy.example/api/v1beta/models', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-goog-api-key/);
});

test('missing credentials, unsupported paths and methods fail locally', async () => {
  for (const [path, method, status] of [
    ['/api/v1beta/models', 'GET', 401],
    ['/api/proxy?__gemini_path=https://example.com', 'GET', 404],
    ['/api/v1beta/files', 'GET', 404],
    ['/api/v1beta/models', 'DELETE', 405],
  ]) {
    assert.equal((await handler(new Request(`https://proxy.example${path}`, { method }))).status, status);
  }
});

test('all supported route forms reach the correct Google endpoint', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url: new URL(url), init });
    return Response.json({ models: [] });
  });
  for (const path of [
    '/api/v1beta/models?pageSize=1000',
    '/api/proxy/v1beta/models?pageSize=1000',
    '/api/proxy?__gemini_path=/v1beta/models&pageSize=1000&path=models',
  ]) {
    const response = await handler(new Request(`https://proxy.example${path}`, {
      headers: { 'x-goog-api-key': 'test-key', host: 'proxy.example', cookie: 'private', 'x-forwarded-for': '192.0.2.1' },
    }));
    assert.equal(response.status, 200);
  }
  for (const { url, init } of requests) {
    assert.equal(url.origin, 'https://generativelanguage.googleapis.com');
    assert.equal(url.pathname, '/v1beta/models');
    assert.equal(url.search, '?pageSize=1000');
    assert.equal(init.headers.get('x-goog-api-key'), 'test-key');
    for (const name of ['host', 'cookie', 'x-forwarded-for']) assert.equal(init.headers.has(name), false);
  }
});

test('generation preserves JSON body, moves legacy query key into a header', async (t) => {
  const body = JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(new URL(url).pathname, '/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(new URL(url).searchParams.has('key'), false);
    assert.equal(init.headers.get('x-goog-api-key'), 'legacy-key');
    assert.equal(new TextDecoder().decode(init.body), body);
    return Response.json({ candidates: [] });
  });
  const result = await handler(new Request('https://proxy.example/api/v1beta/models/gemini-3.8-flash:generateContent?key=legacy-key', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  }));
  assert.equal(result.status, 200);
});

test('upstream error status and raw body survive unchanged', async (t) => {
  const body = '{"error":{"code":400,"message":"User location is not supported for the API use."}}';
  t.mock.method(globalThis, 'fetch', async () => new Response(body, {
    status: 400, headers: { 'content-type': 'application/json', 'content-length': '99', 'content-encoding': 'gzip' },
  }));
  const result = await handler(new Request('https://proxy.example/api/v1beta/models', { headers: { 'x-goog-api-key': 'test-key' } }));
  assert.equal(result.status, 400);
  assert.equal(await result.text(), body);
  assert.equal(result.headers.get('access-control-allow-origin'), '*');
  assert.equal(result.headers.has('content-encoding'), false);
  assert.equal(result.headers.has('content-length'), false);
});

test('SSE content type, query and response remain usable', async (t) => {
  const chunk = 'data: {"candidates":[]}\n\n';
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(new URL(url).searchParams.get('alt'), 'sse');
    return new Response(chunk, { headers: { 'content-type': 'text/event-stream' } });
  });
  const response = await handler(new Request('https://proxy.example/api/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse', {
    method: 'POST', headers: { 'x-goog-api-key': 'test-key' }, body: '{}',
  }));
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(await response.text(), chunk);
});

test('connection errors return a readable error without leaking credentials', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('secret-key'); });
  const response = await handler(new Request('https://proxy.example/api/v1beta/models', { headers: { 'x-goog-api-key': 'secret-key' } }));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret-key/);
});
