// proxy.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const TARGET = "https://www.youtube.com";

console.log("Proxying to YouTube on http://localhost:8000");

serve(async (req: Request) => {
  const { method, headers } = req;
  const url = new URL(req.url);
  const targetUrl = TARGET + url.pathname + url.search;

  // Recreate the request to forward to YouTube
  const proxyRequest = new Request(targetUrl, {
    method,
    headers,
    body: method !== "GET" && method !== "HEAD" ? req.body : null,
  });

  try {
    const response = await fetch(proxyRequest);

    // Clone response and modify headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set("access-control-allow-origin", "*");
    newHeaders.delete("content-security-policy");
    newHeaders.delete("x-frame-options");

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return new Response("Error fetching from target", { status: 502 });
  }
});
