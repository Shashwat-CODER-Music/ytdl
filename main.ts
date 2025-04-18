// main.ts - Main entry point for Deno Deploy

import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
import InnerTube from "npm:innertube.js";

const yt = new InnerTube();

// Helper function to extract and process streaming URLs
function processStreamingData(playerInfo) {
  const result = {
    title: playerInfo?.videoDetails?.title || "",
    author: playerInfo?.videoDetails?.author || "",
    lengthSeconds: playerInfo?.videoDetails?.lengthSeconds || 0,
    viewCount: playerInfo?.videoDetails?.viewCount || 0,
    isLiveStream: playerInfo?.videoDetails?.isLiveContent || false,
    thumbnails: playerInfo?.videoDetails?.thumbnail?.thumbnails || [],
    streams: []
  };

  // Process streaming formats
  if (playerInfo?.streamingData?.formats) {
    result.streams.push(...playerInfo.streamingData.formats.map(format => ({
      url: format.url || "",
      mimeType: format.mimeType || "",
      qualityLabel: format.qualityLabel || "",
      bitrate: format.bitrate || 0,
      width: format.width || 0,
      height: format.height || 0,
      contentLength: format.contentLength || "0",
      fps: format.fps || 0,
      type: "combined"
    })));
  }

  // Process adaptive formats (separate audio and video streams)
  if (playerInfo?.streamingData?.adaptiveFormats) {
    result.streams.push(...playerInfo.streamingData.adaptiveFormats.map(format => ({
      url: format.url || "",
      mimeType: format.mimeType || "",
      qualityLabel: format.qualityLabel || "",
      bitrate: format.bitrate || 0,
      width: format.width || 0,
      height: format.height || 0,
      contentLength: format.contentLength || "0",
      fps: format.fps || 0,
      type: format.mimeType?.includes("audio") ? "audio" : "video"
    })));
  }

  // Add HLS stream if available (for live streams)
  if (playerInfo?.streamingData?.hlsManifestUrl) {
    result.hlsManifestUrl = playerInfo.streamingData.hlsManifestUrl;
  }

  // Add DASH manifest if available
  if (playerInfo?.streamingData?.dashManifestUrl) {
    result.dashManifestUrl = playerInfo.streamingData.dashManifestUrl;
  }

  return result;
}

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
      
      // Process the streaming data
      const processedData = processStreamingData(playerInfo);
      
      return new Response(
        JSON.stringify({
          success: true,
          videoId,
          data: processedData
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
  
  // Add a direct proxy endpoint for stream URLs
  if (path.startsWith("/proxy/")) {
    try {
      const encodedUrl = path.split("/proxy/")[1];
      if (!encodedUrl) {
        return new Response(
          JSON.stringify({ error: "URL parameter is required" }),
          { status: 400, headers: new Headers({ "Content-Type": "application/json" }) }
        );
      }
      
      const decodedUrl = decodeURIComponent(encodedUrl);
      console.log(`Proxying request to: ${decodedUrl}`);
      
      const proxyResponse = await fetch(decodedUrl);
      const proxyHeaders = new Headers(proxyResponse.headers);
      proxyHeaders.set("Access-Control-Allow-Origin", "*");
      
      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        headers: proxyHeaders
      });
    } catch (error) {
      console.error("Error proxying stream:", error);
      return new Response(
        JSON.stringify({ error: "Failed to proxy stream", message: error.message }),
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
          videoData: "/id/:videoId",
          streamProxy: "/proxy/:encodedUrl"
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
