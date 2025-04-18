// main.ts - Main entry point for Deno Deploy

import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
// Use npm package with Deno
import ytdl from "npm:@distube/ytdl-core@latest";

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
      
      // Get video info with formats using ytdl-core
      const info = await ytdl.getInfo(videoId);
      
      // Process the data for the response
      const processedData = {
        title: info.videoDetails.title,
        author: info.videoDetails.author.name,
        lengthSeconds: parseInt(info.videoDetails.lengthSeconds),
        viewCount: parseInt(info.videoDetails.viewCount),
        isLiveStream: info.videoDetails.isLiveContent,
        thumbnails: info.videoDetails.thumbnails,
        formats: info.formats.map(format => ({
          itag: format.itag,
          url: format.url,
          mimeType: format.mimeType,
          qualityLabel: format.qualityLabel,
          bitrate: format.bitrate,
          width: format.width,
          height: format.height,
          contentLength: format.contentLength,
          fps: format.fps,
          audioQuality: format.audioQuality,
          isAudioOnly: format.hasAudio && !format.hasVideo,
          isVideoOnly: format.hasVideo && !format.hasAudio
        }))
      };
      
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
  
  // Handle direct streaming endpoint
  if (path.startsWith("/stream/")) {
    try {
      const videoId = path.split("/stream/")[1];
      
      if (!videoId) {
        return new Response(
          JSON.stringify({ error: "Video ID is required" }),
          { status: 400, headers: new Headers({ "Content-Type": "application/json" }) }
        );
      }

      // Get format parameter (itag)
      const formatId = url.searchParams.get("format");
      let format;

      // Get video info
      const info = await ytdl.getInfo(videoId);
      
      // If format specified, find that specific format
      if (formatId) {
        format = info.formats.find(f => f.itag.toString() === formatId);
        if (!format) {
          return new Response(
            JSON.stringify({ error: `Format with itag ${formatId} not found` }),
            { status: 404, headers: new Headers({ "Content-Type": "application/json" }) }
          );
        }
      } else {
        // Otherwise choose the best format (with both audio and video if possible)
        format = ytdl.chooseFormat(info.formats, { quality: 'highest' });
      }
      
      if (!format || !format.url) {
        return new Response(
          JSON.stringify({ error: "No valid format found for this video" }),
          { status: 404, headers: new Headers({ "Content-Type": "application/json" }) }
        );
      }

      // Redirect to the actual stream URL
      return Response.redirect(format.url, 302);
    } catch (error) {
      console.error("Error streaming video:", error);
      return new Response(
        JSON.stringify({ error: "Failed to process stream", message: error.message }),
        { status: 500, headers: new Headers({ "Content-Type": "application/json" }) }
      );
    }
  }
  
  // Handle format-specific streaming endpoint
  if (path.startsWith("/format/")) {
    try {
      const parts = path.split("/format/")[1].split("/");
      if (parts.length !== 2) {
        return new Response(
          JSON.stringify({ error: "Invalid format URL. Use /format/{videoId}/{formatId}" }),
          { status: 400, headers: new Headers({ "Content-Type": "application/json" }) }
        );
      }
      
      const [videoId, formatId] = parts;
      
      // Get video info
      const info = await ytdl.getInfo(videoId);
      
      // Find the requested format
      const format = info.formats.find(f => f.itag.toString() === formatId);
      
      if (!format || !format.url) {
        return new Response(
          JSON.stringify({ error: `Format with itag ${formatId} not found` }),
          { status: 404, headers: new Headers({ "Content-Type": "application/json" }) }
        );
      }

      // Redirect to the actual stream URL
      return Response.redirect(format.url, 302);
    } catch (error) {
      console.error("Error processing format stream:", error);
      return new Response(
        JSON.stringify({ error: "Failed to process stream", message: error.message }),
        { status: 500, headers: new Headers({ "Content-Type": "application/json" }) }
      );
    }
  }
  
  // Handle audio-only streaming endpoint
  if (path.startsWith("/audio/")) {
    try {
      const videoId = path.split("/audio/")[1];
      
      if (!videoId) {
        return new Response(
          JSON.stringify({ error: "Video ID is required" }),
          { status: 400, headers: new Headers({ "Content-Type": "application/json" }) }
        );
      }

      // Get video info
      const info = await ytdl.getInfo(videoId);
      
      // Filter for audio-only formats and choose the best quality
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      if (!audioFormats || audioFormats.length === 0) {
        return new Response(
          JSON.stringify({ error: "No audio format found for this video" }),
          { status: 404, headers: new Headers({ "Content-Type": "application/json" }) }
        );
      }
      
      // Sort by audio quality and bitrate
      const bestAudio = audioFormats.sort((a, b) => {
        const qualityRank = { high: 3, medium: 2, low: 1, AUDIO_QUALITY_LOW: 1, AUDIO_QUALITY_MEDIUM: 2, AUDIO_QUALITY_HIGH: 3 };
        const aQuality = qualityRank[a.audioQuality] || 0;
        const bQuality = qualityRank[b.audioQuality] || 0;
        
        if (aQuality !== bQuality) return bQuality - aQuality;
        return (b.bitrate || 0) - (a.bitrate || 0);
      })[0];

      // Redirect to the audio URL
      return Response.redirect(bestAudio.url, 302);
    } catch (error) {
      console.error("Error processing audio stream:", error);
      return new Response(
        JSON.stringify({ error: "Failed to process audio stream", message: error.message }),
        { status: 500, headers: new Headers({ "Content-Type": "application/json" }) }
      );
    }
  }
  
  // Handle root path - API documentation
  if (path === "/") {
    return new Response(
      JSON.stringify({
        status: "ok",
        endpoints: {
          videoInfo: "/id/:videoId",
          streamVideo: "/stream/:videoId?format=:formatId", 
          streamFormat: "/format/:videoId/:formatId",
          streamAudio: "/audio/:videoId"
        },
        message: "YouTube Streaming API is running (@distube/ytdl-core)"
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

console.log("YouTube API server starting with @distube/ytdl-core...");
serve(handleRequest);
