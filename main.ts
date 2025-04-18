// main.ts - Main entry point for Deno Deploy

import { serve } from "https://deno.land/std@0.204.0/http/server.ts";

// Fix the import to match the actual export format of innertube.js
import InnerTube from "npm:innertube.js";

const yt = new InnerTube();

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Set CORS headers
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
  
  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }
  
  // Handle video ID endpoint
  if (path.startsWith("/id/")) {
    try {
      const videoId = path.split("/id/")[1];
      
      if (!videoId) {
        return new Response(
          JSON.stringify({ error: "Video ID is required" }),
          { status: 400, headers }
        );
      }
      
      console.log(`Fetching data for video ID: ${videoId}`);
      const playerInfo = await yt.player({ videoId });
      
      return new Response(
        JSON.stringify({
          success: true,
          videoId,
          playerInfo
        }),
        { headers }
      );
    } catch (error) {
      console.error("Error fetching video data:", error);
      return new Response(
        JSON.stringify({ 
          error: "Failed to fetch video data", 
          message: error.message 
        }),
        { status: 500, headers }
      );
    }
  }
  
  // Handle root path
  if (path === "/") {
    return new Response(
      JSON.stringify({
        status: "ok",
        endpoints: {
          videoData: "/id/:videoId"
        },
        message: "YouTube InnerTube API is running"
      }),
      { headers }
    );
  }
  
  // Handle 404
  return new Response(
    JSON.stringify({ error: "Not found" }),
    { status: 404, headers }
  );
}

console.log("YouTube InnerTube API server starting...");
serve(handleRequest);
