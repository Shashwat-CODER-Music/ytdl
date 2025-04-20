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

// Function to transform YouTube API response to desired format
function transformResponse(playerInfo: any, videoId: string, baseUrl: string): any {
  const videoDetails = playerInfo.videoDetails || {};
  const streamingData = playerInfo.streamingData || {};
  const formats = streamingData.formats || [];
  const adaptiveFormats = streamingData.adaptiveFormats || [];
  const captions = playerInfo.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const storyboards = playerInfo.storyboards?.playerStoryboardSpecRenderer || {};

  // Create proxy URL for stream URLs
  function createProxyUrl(url: string): string {
    if (!url) return "";
    const encodedUrl = encodeURIComponent(url);
    return `${baseUrl}/proxy/${encodedUrl}`;
  }

  // Extract streams
  const audioStreams = adaptiveFormats
    .filter((format: any) => format.mimeType && format.mimeType.includes('audio'))
    .map((format: any) => ({
      url: format.url || "",
      format: format.mimeType ? format.mimeType.split(';')[0] : "",
      quality: format.audioQuality || "",
      mimeType: format.mimeType || "",
      codec: format.mimeType ? format.mimeType.split('codecs="')[1]?.split('"')[0] : "",
      audioTrackId: null,
      audioTrackName: null,
      audioTrackType: null,
      audioTrackLocale: null,
      videoOnly: false,
      itag: format.itag || 0,
      bitrate: format.bitrate || 0,
      initStart: format.initRange?.start ? parseInt(format.initRange.start) : 0,
      initEnd: format.initRange?.end ? parseInt(format.initRange.end) : 0,
      indexStart: format.indexRange?.start ? parseInt(format.indexRange.start) : 0,
      indexEnd: format.indexRange?.end ? parseInt(format.indexRange.end) : 0,
      width: format.width || 0,
      height: format.height || 0,
      fps: format.fps || 0,
      contentLength: format.contentLength ? parseInt(format.contentLength) : 0
    }));

  const videoStreams = adaptiveFormats
    .filter((format: any) => format.mimeType && format.mimeType.includes('video'))
    .concat(formats)
    .map((format: any) => ({
      url: createProxyUrl(format.url || ""),
      format: format.mimeType ? format.mimeType.split(';')[0] : "",
      quality: format.qualityLabel || format.quality || "",
      mimeType: format.mimeType || "",
      codec: format.mimeType ? format.mimeType.split('codecs="')[1]?.split('"')[0] : "",
      audioTrackId: null,
      audioTrackName: null,
      audioTrackType: null,
      audioTrackLocale: null,
      videoOnly: format.mimeType ? format.mimeType.includes('video') && !formats.includes(format) : false,
      itag: format.itag || 0,
      bitrate: format.bitrate || 0,
      initStart: format.initRange?.start ? parseInt(format.initRange.start) : 0,
      initEnd: format.initRange?.end ? parseInt(format.initRange.end) : 0,
      indexStart: format.indexRange?.start ? parseInt(format.indexRange.start) : 0,
      indexEnd: format.indexRange?.end ? parseInt(format.indexRange.end) : 0,
      width: format.width || 0,
      height: format.height || 0,
      fps: format.fps || 0,
      contentLength: format.contentLength ? parseInt(format.contentLength) : 0
    }));

  // Process audio streams to also use proxy
  audioStreams.forEach((stream: any) => {
    stream.url = createProxyUrl(stream.url);
  });

  // Extract subtitles
  const subtitles = captions.map((caption: any) => ({
    url: caption.baseUrl || "",
    mimeType: "text/vtt",
    name: caption.name?.runs?.[0]?.text || caption.trackName || "",
    code: caption.languageCode || "",
    autoGenerated: caption.vssId?.startsWith('a.') || false
  }));

  // Extract preview frames (storyboard)
  const previewFrames = [];
  if (storyboards.spec) {
    const spec = storyboards.spec;
    const parts = spec.split('|');
    if (parts.length > 2) {
      const baseUrl = parts[0];
      // Skip the first part which is the baseUrl
      for (let i = 1; i < parts.length; i++) {
        const frameParts = parts[i].split('#');
        if (frameParts.length >= 8) {
          const frameWidth = parseInt(frameParts[0]);
          const frameHeight = parseInt(frameParts[1]);
          const totalCount = parseInt(frameParts[2]);
          const framesPerPageX = parseInt(frameParts[3]);
          const framesPerPageY = parseInt(frameParts[4]);
          const durationPerFrame = parseInt(frameParts[5]) / 1000;
          
          // Generate URLs for this storyboard
          const urls = [];
          const urlTemplate = frameParts[6];
          for (let j = 0; j < Math.ceil(totalCount / (framesPerPageX * framesPerPageY)); j++) {
            const url = urlTemplate.replace('$M', j.toString());
            urls.push(url);
          }
          
          previewFrames.push({
            urls,
            frameWidth,
            frameHeight,
            totalCount,
            durationPerFrame,
            framesPerPageX,
            framesPerPageY
          });
        }
      }
    }
  }

  return {
    title: videoDetails.title || "",
    description: videoDetails.shortDescription || "",
    uploadDate: "", // Not available in the API response
    uploader: videoDetails.author || "",
    uploaderUrl: `https://www.youtube.com/channel/${videoDetails.channelId}` || "",
    uploaderAvatar: "", // Not available in the API response
    thumbnailUrl: videoDetails.thumbnail?.thumbnails?.[videoDetails.thumbnail.thumbnails.length - 1]?.url || "",
    hls: streamingData.hlsManifestUrl ? { url: streamingData.hlsManifestUrl } : null,
    dash: streamingData.dashManifestUrl ? { url: streamingData.dashManifestUrl } : null,
    lbryId: null,
    category: "", // Not available in the API response
    license: "", // Not available in the API response
    visibility: videoDetails.isPrivate ? "private" : "public",
    tags: videoDetails.keywords || [],
    metaInfo: [],
    uploaderVerified: false, // Not available in the API response
    duration: videoDetails.lengthSeconds ? parseInt(videoDetails.lengthSeconds) : 0,
    views: videoDetails.viewCount ? parseInt(videoDetails.viewCount) : 0,
    likes: 0, // Not available in the API response
    dislikes: 0, // Not available in the API response
    uploaderSubscriberCount: 0, // Not available in the API response
    uploaded: 0, // Not available in the API response
    audioStreams,
    videoStreams,
    relatedStreams: [], // Not available in the API response
    subtitles,
    livestream: videoDetails.isLiveContent || false,
    proxyUrl: `${baseUrl}/proxy/`,
    chapters: [], // Not available in the API response
    previewFrames
  };
}

// Function to get base URL from request
function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function handler(req: Request): Promise<Response> {
  // Get base URL from the request
  const baseUrl = getBaseUrl(req);
  
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
      
      // Transform the response to desired format
      const transformedData = transformResponse(playerInfo, videoId, baseUrl);

      return new Response(JSON.stringify(transformedData), {
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
  else if (pathname.startsWith('/proxy/')) {
    // Extract the stream URL directly from the path
    const streamUrl = pathname.substring(7); // Remove '/proxy/' prefix
    
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
      // Reconstruct the full URL by combining the extracted path with the original query string
      const fullStreamUrl = streamUrl + (url.search || '');
      
      const response = await fetch(decodeURIComponent(fullStreamUrl), {
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
