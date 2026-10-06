# Gemini API proxy

Vercel proxy for Gemini model listing, text generation, and streaming responses.
The function requests execution in Washington, D.C. (`iad1`) and forwards only
API headers to Google's fixed API host. Clients supply their own Gemini API key;
the repository contains no key and does not use a shared server credential.

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
The proxy exposes only `/v1beta/models` and its model/action endpoints.

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
- [Edge execution region](https://vercel.com/docs/functions/runtimes/edge#region)
