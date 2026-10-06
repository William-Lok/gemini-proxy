 export const config = {
  runtime: 'edge', // 使用 Edge 運算
};

export default async function handler(req) {
  // 如果是 OPTIONS 預檢請求，直接回覆 200 (解決小程式跨域)
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
  // 將目的地替換為 Google 官方 API
  url.host = 'generativelanguage.googleapis.com';

  // 清洗 IP，以防萬一
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

  // 加上跨域 Headers
  modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');

  return modifiedResponse;
}