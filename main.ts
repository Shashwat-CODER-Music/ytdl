// Deno video streaming API - deployable on Deno Deploy
// main.ts

import { serve } from "https://deno.land/std@0.194.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const BASE_URL = 'https://www.wow.xxx';

/**
 * Extract video ID from full URL
 * @param url - Full video URL
 * @returns Video ID
 */
const extractVideoId = (url: string): string | null => {
  if (!url) return null;
  
  // Extract the ID from URL pattern like https://www.wow.xxx/videos/abcd/
  const matches = url.match(/\/videos\/([^\/]+)/);
  return matches && matches[1] ? matches[1] : null;
};

/**
 * Helper function to extract pagination information
 * @param document - DOM Document
 * @returns Pagination information
 */
const extractPaginationInfo = (document: Document) => {
  const paginationInfo = {
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
    nextPage: null,
    lastPage: null
  };

  // Find current page
  const currentPageEl = document.querySelector('.pagination-holder .page-current span');
  if (currentPageEl) {
    paginationInfo.currentPage = parseInt(currentPageEl.textContent?.trim() || "1", 10);
  }

  // Find last page number
  const lastPageEl = document.querySelector('.pagination-holder .last a');
  if (lastPageEl) {
    const lastPageHref = lastPageEl.getAttribute('href') || "";
    const lastPageMatch = lastPageHref.match(/\/(\d+)\/$/);
    if (lastPageMatch && lastPageMatch[1]) {
      paginationInfo.totalPages = parseInt(lastPageMatch[1], 10);
      paginationInfo.lastPage = lastPageMatch[1];
    }
  }

  // Check if has next page
  const nextEl = document.querySelector('.pagination-holder .next a');
  if (nextEl) {
    paginationInfo.hasNext = true;
    const nextHref = nextEl.getAttribute('href') || "";
    const nextMatch = nextHref.match(/\/(\d+)\/$/);
    if (nextMatch && nextMatch[1]) {
      paginationInfo.nextPage = parseInt(nextMatch[1], 10);
    }
  }

  // Check if has previous page
  const prevEl = document.querySelector('.pagination-holder .prev:not(.no_link) a');
  paginationInfo.hasPrev = prevEl !== null;

  return paginationInfo;
};

/**
 * Helper function to extract video items from a page
 * @param document - DOM Document
 * @returns Array of video items
 */
const extractVideoItems = (document: Document) => {
  const results: any[] = [];
  const items = document.querySelectorAll('.list-videos .item');

  items.forEach((el) => {
    const anchor = el.querySelector('a.thumb_img');
    if (!anchor) return;
    
    const title = anchor.getAttribute('title');
    const href = anchor.getAttribute('href');
    const img = anchor.querySelector('img')?.getAttribute('src');
    const preview = anchor.querySelector('.thumb__img')?.getAttribute('data-preview');
    const duration = anchor.querySelector('.duration')?.textContent?.trim();
    
    // Extract ID from full URL
    const videoId = href ? extractVideoId(href) : null;

    results.push({
      title,
      id: videoId,
      thumbnail: img,
      preview,
      duration,
    });
  });

  return results;
};

/**
 * Fetch results from a single page
 * @param baseUrl - Base URL for the search
 * @param page - Page number
 * @returns Page data and results
 */
const fetchPage = async (baseUrl: string, page: number) => {
  // Format the URL properly to match the site's pagination pattern
  const pageUrl = page === 1 ? `${baseUrl}/` : `${baseUrl}/${page}/`;
  
  try {
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const html = await response.text();
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");
    
    if (!document) {
      throw new Error("Failed to parse HTML");
    }
    
    const results = extractVideoItems(document);
    const paginationInfo = extractPaginationInfo(document);
    
    return { results, paginationInfo, page, success: true };
  } catch (error) {
    console.error(`Error fetching page ${page} (${pageUrl}):`, error.message);
    return { 
      results: [], 
      paginationInfo: null, 
      page, 
      success: false, 
      error: error.message,
      url: pageUrl
    };
  }
};

/**
 * Handle incoming requests and route them to appropriate handlers
 */
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Set CORS headers
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  });
  
  // Handle OPTIONS request for CORS
  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }
  
  // Only support GET requests
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers }
    );
  }

  // Handle search endpoint: /search/{query}?page={page}&pages={pages}
  if (path.startsWith("/search/")) {
    const query = path.substring(8); // Remove /search/ prefix
    
    const pageParam = url.searchParams.get("page") || "1";
    const pagesToFetchParam = url.searchParams.get("pages") || "1";
    
    const requestedPage = parseInt(pageParam, 10);
    const pagesToFetch = Math.min(parseInt(pagesToFetchParam, 10), 10); // Limit to 10 pages
    
    const baseUrl = `${BASE_URL}/search/${encodeURIComponent(query)}/relevance`;
    
    try {
      // First, fetch just the first page to get pagination info
      const firstPageResponse = await fetchPage(baseUrl, requestedPage);
      
      if (!firstPageResponse.success) {
        return new Response(
          JSON.stringify({ 
            error: 'Failed to fetch first page',
            details: firstPageResponse.error,
            url: firstPageResponse.url
          }),
          { status: 500, headers }
        );
      }
      
      if (!firstPageResponse.paginationInfo) {
        return new Response(
          JSON.stringify({ 
            error: 'Failed to extract pagination information',
            url: firstPageResponse.url
          }),
          { status: 500, headers }
        );
      }
      
      const { paginationInfo } = firstPageResponse;
      
      // Calculate how many pages we can actually fetch in this batch
      const remainingPages = paginationInfo.totalPages - requestedPage;
      const possiblePages = Math.min(pagesToFetch, remainingPages + 1);
      
      // Initialize results with the first page we already fetched
      let allResults = [...firstPageResponse.results];
      
      // Prepare parallel requests for the remaining pages in this batch
      const pageRequests = [];
      for (let i = 1; i < possiblePages; i++) {
        const pageToFetch = requestedPage + i;
        pageRequests.push(fetchPage(baseUrl, pageToFetch));
      }
      
      // Fetch all remaining pages in parallel
      if (pageRequests.length > 0) {
        const pageResponses = await Promise.all(pageRequests);
        
        // Combine all results
        pageResponses.forEach(response => {
          if (response.success && response.results && response.results.length > 0) {
            allResults = [...allResults, ...response.results];
          }
        });
      }
      
      // Calculate next and previous pages
      const nextPage = requestedPage < paginationInfo.totalPages ? requestedPage + 1 : null;
      const prevPage = requestedPage > 1 ? requestedPage - 1 : null;
      
      // Calculate pagination for the response
      const responsePageInfo = {
        query,
        pageInfo: {
          currentPage: requestedPage,
          totalPages: paginationInfo.totalPages,
          hasNextPage: nextPage !== null,
          hasPrevPage: prevPage !== null,
          nextPage: nextPage,
          prevPage: prevPage
        },
        resultCount: allResults.length,
        results: allResults
      };
      
      return new Response(
        JSON.stringify(responsePageInfo),
        { headers }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch results', details: error.message }),
        { status: 500, headers }
      );
    }
  }
  
  // Handle stream endpoint: /stream?url={videoUrl}
  else if (path === "/stream") {
    const videoPageUrl = url.searchParams.get("url");

    if (!videoPageUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing "url" query parameter.' }),
        { status: 400, headers }
      );
    }

    try {
      const response = await fetch(videoPageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const html = await response.text();
      const parser = new DOMParser();
      const document = parser.parseFromString(html, "text/html");
      
      if (!document) {
        throw new Error("Failed to parse HTML");
      }

      // Extract video sources
      const videoSources: any[] = [];
      document.querySelectorAll('video source').forEach((el) => {
        const src = el.getAttribute('src');
        const label = el.getAttribute('label');
        if (src && label) {
          videoSources.push({ label, src });
        }
      });

      // Extract video info
      const title = document.querySelector('#tab_video_info .headline h1')?.textContent?.trim() || "";
      const channel = document.querySelector('#tab_video_info .item:contains("Channel:") a')?.textContent?.trim() || "";
      const network = document.querySelector('#tab_video_info .item:contains("Network:") a')?.textContent?.trim() || "";

      return new Response(
        JSON.stringify({
          title,
          channel,
          network,
          videoSources,
        }),
        { headers }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch video page.', details: error.message }),
        { status: 500, headers }
      );
    }
  }
  
  // Handle proxy endpoint: /proxy/url?url={videoUrl}
  else if (path === "/proxy/url") {
    const videoUrl = url.searchParams.get("url");
    
    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing "url" query parameter.' }),
        { status: 400, headers }
      );
    }
    
    try {
      const response = await fetch(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': new URL(videoUrl).origin
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      // Create a new response with the video content and appropriate headers
      const contentType = response.headers.get('content-type') || 'video/mp4';
      const contentLength = response.headers.get('content-length');
      const responseHeaders = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Content-Type": contentType,
      });
      
      if (contentLength) {
        responseHeaders.set('Content-Length', contentLength);
      }
      
      // Return the video stream directly
      return new Response(response.body, {
        status: 200,
        headers: responseHeaders
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to proxy video stream.', details: error.message }),
        { status: 500, headers }
      );
    }
  }
  
  // Default route - return 404
  return new Response(
    JSON.stringify({ error: "Not found" }),
    { status: 404, headers }
  );
}

// Start the server
console.log("Starting server...");
serve(handleRequest, { port: 8000 });
