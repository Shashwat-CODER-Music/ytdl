// proxy_youtube.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

console.log("Proxy server running on http://localhost:8000");

serve(async (req: Request) => {
  const url = new URL(req.url);
  const targetUrl = new URL(`https://www.youtube.com${url.pathname}${url.search}`);

  const headers = new Headers(req.headers);
  headers.set("host", "www.youtube.com");
  headers.set("origin", "https://www.youtube.com");

  try {
    const response = await fetch(targetUrl.href, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : null,
    });

    const resHeaders = new Headers(response.headers);
    // Remove or adjust headers that may cause issues
    resHeaders.delete("content-security-policy");
    resHeaders.set("access-control-allow-origin", "*");

    return new Response(response.body, {
      status: response.status,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("Fetch error:", err);
    return new Response("Proxy Error", { status: 500 });
  }
});
