export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key',
      },
    });
  }

  const url = new URL(req.url);
  url.host = 'generativelanguage.googleapis.com';
  
  // 核心修正：將 Vercel 自帶的資料夾路徑刪除，還原成官方 API 路徑
  url.pathname = url.pathname.replace(/^\/api\/proxy/, '');

  const newHeaders = new Headers(req.headers);
  newHeaders.delete('x-forwarded-for');
  newHeaders.delete('x-real-ip');

  const modifiedRequest = new Request(url.toString(), {
    method: req.method,
    headers: newHeaders,
    body: req.body,
    redirect: 'follow'
  });

  const response = await fetch(modifiedRequest);
  const modifiedResponse = new Response(response.body, response);

  modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');

  return modifiedResponse;
}