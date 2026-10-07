# Gemini API proxy

Vercel proxy for Gemini model listing, text generation, and streaming responses.
The Node.js function runs in Washington, D.C. (`iad1`) and forwards only
API headers to Google's fixed API host. Clients supply their own Gemini API key;
the repository contains no key and does not use a shared server credential.

The proxy waits up to 120 seconds for Google's response headers, with a
180-second Vercel function limit. Diagnostic clients allow 140 seconds per
request. This avoids the previous Edge implementation's 24-second cutoff for
generation requests. SSE responses remain streamed once Google responds.

## Endpoints

Base URL: `https://gemini-proxy-opal-one.vercel.app`

- Health: `GET /api/proxy` (no key required; returns version and execution region).
- Models: `GET /api/v1beta/models`.
- Generate: `POST /api/v1beta/models/gemini-3.8-flash:generateContent`.
- Stream: `POST /api/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse`.

`/api/proxy/v1beta/...` also works for compatibility with earlier clients.
`vercel.json` routes both prefixes to `api/proxy.js`, passing the upstream path
explicitly. Without these rewrites, nested requests never reach the function.

Send the API key in `x-goog-api-key`, and JSON bodies with
`Content-Type: application/json`. Legacy `?key=...` requests are accepted but the
header is preferred because URLs can appear in browser history and access logs.
The proxy exposes only the native model/action endpoints and the compatible
chat-completions and model-list endpoints below.

## OpenAI-compatible clients

For clients with `base_url`, `model`, and `api_key` settings:

```ini
[模型 1]
base_url = https://gemini-proxy-opal-one.vercel.app/v1
model = gemini-3.8-flash
api_key = YOUR_GOOGLE_GEMINI_API_KEY
```

Use a Google Gemini API key that already works with the native endpoint.
The client sends `Authorization: Bearer ...`. `POST /v1/chat/completions`
and `GET /v1/models` forward to Google's `/v1beta/openai/` endpoints.
Chat JSON, tool calls, and streamed responses pass through unchanged.
This implements Chat Completions; other client API modes such as Responses
are not exposed. Repeating keys from the same Google project does not add quota.

See [Google's compatibility documentation](https://ai.google.dev/gemini-api/docs/openai).

## Verify in Windows PowerShell or PowerShell 7

For a browser test, open the base URL. The page asks for a key, checks the model
list, and sends one short prompt. It uses no local storage, analytics, or
third-party scripts. All errors appear as text rather than executable HTML.

Run `./tools/diagnose.ps1`. It first checks the deployed version and region,
then asks for the key with hidden input. It lists the available models before
sending one short generation request. The key is not written to disk or shell
history. The diagnostic shows HTTP status, content type, and the response body
on failure, including non-JSON errors.

To check deployment without a key or generation request:

```powershell
./tools/diagnose.ps1 -CheckOnly
```

For another model returned by the model-list endpoint:

```powershell
./tools/diagnose.ps1 -Model 'model-code-from-the-list'
```

A health response or passing local tests does not prove that a particular key
has valid access, sufficient quota, or a permitted location. Check Google's
actual API response for those conditions. Google AI subscription benefits and
Gemini API billing are managed separately; do not assume subscription chat
limits apply to API calls.

## Local tests

No packages are required. Use Node.js 20 or newer and run `npm test`.

## References

- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [Available models API](https://ai.google.dev/api/models)
- [Vercel rewrites](https://vercel.com/docs/project-configuration/vercel-json#rewrites)
- [Node.js Web Standard handler](https://vercel.com/docs/functions/runtimes/node-js)
- [Function duration](https://vercel.com/docs/functions/configuring-functions/duration)
