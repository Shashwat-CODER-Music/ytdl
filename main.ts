// deno-deploy-youtube-api.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const REFERER_YOUTUBE = 'https://www.youtube.com/';
const USER_AGENT_ANDROID = 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Mobile Safari/537.36';

class InnerTube {
  baseUrl: string;
  context: any;

  constructor(options: any = {}) {
    this.baseUrl = 'https://youtubei.googleapis.com/youtubei/v1/';
    this.context = {
      clientName: 'ANDROID',
      clientVersion: '19.17.34',
      clientId: 3,
      userAgent: USER_AGENT_ANDROID,
      referer: REFERER_YOUTUBE,
      ...options
    };
  }

  getHeaders() {
    return {
      'X-Goog-Api-Format-Version': '1',
      'X-YouTube-Client-Name': this.context.clientId.toString(),
      'X-YouTube-Client-Version': this.context.clientVersion,
      'User-Agent': this.context.userAgent || USER_AGENT_ANDROID,
      'Referer': this.context.referer || REFERER_YOUTUBE,
      'Content-Type': 'application/json'
    };
  }

  getContextPayload() {
    return {
      context: {
        client: {
          clientName: this.context.clientName,
          clientVersion: this.context.clientVersion
        }
      }
    };
  }

  async makeRequest(endpoint: string, payload: any) {
    try {
      const url = new URL(endpoint, this.baseUrl);
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  handleError(error: any) {
    return new Error(`YouTube API Error: ${error.message}`);
  }

  async player(options: { videoId: string }) {
    const payload = {
      ...this.getContextPayload(),
      videoId: options.videoId
    };
    return this.makeRequest('player', payload);
  }
}

async function handler(req: Request): Promise<Response> {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With'
  };

  // Handle OPTIONS pre-flight request (CORS)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  // Handle the /streams/:id endpoint
  if (pathname.startsWith('/streams/')) {
    const videoId = pathname.split('/streams/')[1];

    if (!videoId) {
      return new Response(JSON.stringify({ error: 'Video ID is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    try {
      const yt = new InnerTube();
      const playerInfo = await yt.player({ videoId });

      return new Response(JSON.stringify(playerInfo), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  } 
  // Handle the /proxy endpoint
  else if (pathname.startsWith('/proxy')) {
    const streamUrl = url.searchParams.get('url');
    
    if (!streamUrl) {
      return new Response(JSON.stringify({ error: 'Stream URL is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    try {
      const response = await fetch(decodeURIComponent(streamUrl), {
        headers: {
          'User-Agent': USER_AGENT_ANDROID,
          'Referer': REFERER_YOUTUBE
        }
      });

      if (!response.ok) {
        throw new Error(`Stream fetch error! status: ${response.status}`);
      }

      // Get the content-type from the original response and other headers
      const headers = new Headers();
      response.headers.forEach((value, key) => {
        headers.set(key, value);
      });
      
      // Add CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      // Stream the content
      return new Response(response.body, {
        status: 200,
        headers
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  } else {
    // Handle unknown routes
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

// Start the server
serve(handler);
