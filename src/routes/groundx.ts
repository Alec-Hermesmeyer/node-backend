import { Router } from 'express';
import { GroundXClient } from "groundx";
import OpenAI from "openai";
import { authenticateSupabaseUser, handleOrganizationOverride } from '../middleware/supabaseAuth';

const router = Router();

router.use(authenticateSupabaseUser as any);
router.use(handleOrganizationOverride);

// Lazy-initialize GroundX client
let groundxClient: GroundXClient | null = null;

function getGroundXClient(): GroundXClient {
  if (!groundxClient) {
    if (!process.env.GROUNDX_API_KEY) {
      throw new Error('GROUNDX_API_KEY environment variable is required');
    }
    console.log('Initializing GroundX client with API key:', process.env.GROUNDX_API_KEY ? 'present' : 'missing');
    groundxClient = new GroundXClient({
      apiKey: process.env.GROUNDX_API_KEY,
    });
  }
  return groundxClient;
}

// Lazy-initialize OpenAI client
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// Types
interface SearchResultItem {
  documentId?: string;
  fileName?: string;
  score?: number;
  relevanceScore?: number;
  rankingScore?: number;
  text?: string;
  metadata?: Record<string, any>;
  highlight?: {
    text?: string[];
  };
  searchData?: Record<string, any>;
  sourceUrl?: string;
  suggestedText?: string;
}

interface RagResponse {
  success: boolean;
  timestamp: string;
  query?: string;
  response: string;
  thoughts?: string;
  searchResults: {
    count: number;
    sources: Array<{
      id?: string;
      fileName?: string;
      text?: string;
      metadata?: Record<string, any>;
      sourceUrl?: string;
      score?: number;
      rawScore?: number;
      scoreSource?: string;
      highlights?: string[];
      hasXray?: boolean;
      pageImages?: string[];
      narrative?: string[];
      searchData?: {
        date_uploaded?: string;
        document_type?: string;
        key?: string;
        [key: string]: any;
      };
      boundingBoxes?: Array<{
        bottomRightX: number;
        bottomRightY: number;
        pageNumber: number;
        topLeftX: number;
        topLeftY: number;
        corrected: boolean;
      }>;
      json?: any[];
      fileKeywords?: string;
      bucketId?: number;
      multimodalUrl?: string;
    }>;
  };
  executionTime?: {
    totalMs: number;
    searchMs: number;
    llmMs: number;
  };
  error?: string;
}

// Utility functions
function extractBestScore(result: SearchResultItem): { score: number, source: string } {
  const scoreFields = {
    primaryScore: result.score,
    relevanceScore: result.relevanceScore,
    rankingScore: result.rankingScore,
    metadataScore: result.metadata?.score,
    searchDataScore: result.searchData?.score
  };

  // Try to find the best score
  for (const [source, score] of Object.entries(scoreFields)) {
    if (typeof score === 'number' && !isNaN(score)) {
      return { score, source };
    }
  }

  return { score: 0, source: 'default' };
}

// GET /groundx/buckets
router.get('/buckets', async (req: any, res: any) => {
  try {
    console.log('Fetching Ground-X buckets for organization:', req.user?.organization?.name);
    console.log('Authorization header received:', req.headers.authorization ? 'Present' : 'Missing');
    console.log('Token length:', req.headers.authorization ? req.headers.authorization.length : 0);
    
    // Get all buckets from GroundX
    const client = getGroundXClient();
    const response = await client.buckets.list();
    
    if (!response || !response.buckets || !Array.isArray(response.buckets)) {
      console.error('Invalid response structure from GroundX:', response);
      return res.status(500).json({
        success: false,
        error: 'Invalid response structure from GroundX API'
      });
    }

    // Apply organization filtering logic
    const organizationName = req.user?.organization?.name;
    const isQIG = req.user?.isQIG;
    
    let filteredBuckets = response.buckets;
    
    // Organization-to-bucket mapping
    const orgToBucketMapping: Record<string, string[]> = {
      'Austin Industries': ['Austin Industries', 'Austin', 'AI'],
      'QIG': ['QIG', 'Quality Improvement Group'],
      'Spinakr': ['Spinakr', 'Spinaker', 'Spnkr'],
    };
    
    // Filter buckets based on organization (unless user is QIG)
    if (!isQIG && organizationName) {
      const bucketPatterns = orgToBucketMapping[organizationName] || [organizationName];
      
      filteredBuckets = response.buckets.filter(bucket => {
        const bucketAny = bucket as any;
        const name = bucketAny.name || bucketAny.title || bucketAny.bucketName || '';
        
        return bucketPatterns.some(pattern => 
          name.toLowerCase().includes(pattern.toLowerCase())
        );
      });
      
      console.log(`Filtered ${response.buckets.length} buckets to ${filteredBuckets.length} for organization: ${organizationName}`);
    } else {
      console.log(`QIG user or no organization filter - showing all ${filteredBuckets.length} buckets`);
    }

    // Process filtered buckets
    const processedBuckets = filteredBuckets.map(bucket => {
      const bucketAny = bucket as any;
      return {
        id: bucketAny.bucket_id || bucketAny.bucketId || bucketAny.id || bucketAny.bId,
        name: bucketAny.name || bucketAny.title || bucketAny.bucketName || `Bucket ${bucketAny.bucket_id || bucketAny.id || 'Unknown'}`,
        documentCount: typeof bucketAny.documentCount === 'number' ? bucketAny.documentCount :
          typeof bucketAny.count === 'number' ? bucketAny.count :
          typeof bucketAny.documents === 'number' ? bucketAny.documents : 0
      };
    });

    console.log(`Returning ${processedBuckets.length} processed buckets`);

    res.json({
      success: true,
      buckets: processedBuckets,
      organization: organizationName
    });

  } catch (error: any) {
    console.error('Error listing buckets:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});

// POST /groundx/rag
router.post('/rag', async (req: any, res: any) => {
  try {
    const startTime = Date.now();
    console.log('Processing Ground-X RAG request...');
    console.log('Auth header:', req.headers.authorization ? 'Present' : 'Missing');
    console.log('User object:', {
      present: !!req.user,
      id: req.user?.id,
      email: req.user?.email,
      organization: req.user?.organization?.name
    });
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    console.log('Request headers:', {
      ...req.headers,
      authorization: req.headers.authorization ? 'Bearer [redacted]' : undefined
    });
    
    if (!req.body) {
      return res.status(400).json({
        success: false,
        error: 'Request body is missing or empty',
        timestamp: new Date().toISOString()
      });
    }

    const { 
      query, 
      bucketId, 
      messages = [], 
      limit = 10, 
      includeThoughts = false, 
      temperature = 0.3,
      conversationContext = false 
    } = req.body;
    
    console.log('Extracted values:', { 
      query, 
      bucketId, 
      messagesCount: messages.length, 
      limit, 
      includeThoughts, 
      conversationContext 
    });

    if (!query || !bucketId) {
      return res.status(400).json({
        success: false,
        error: 'Query and bucketId are required',
        received: { query, bucketId },
        timestamp: new Date().toISOString()
      });
    }

    // Step 1: Search GroundX using the current query
    const searchStartTime = Date.now();
    console.log(`Searching bucket ${bucketId} for: "${query}"`);

    const client = getGroundXClient();
    const searchResponse = await client.search.content(parseInt(bucketId), {
      query: query,
      n: limit
    });

    const searchEndTime = Date.now();
    const searchMs = searchEndTime - searchStartTime;

    console.log('GroundX search response structure:', JSON.stringify(searchResponse, null, 2));

    if (!searchResponse?.search?.results) {
      console.log('No search results found. Response:', searchResponse);
      throw new Error('No search results from GroundX');
    }

    // Process search results  
    console.log('Processing search results...');
    const results = searchResponse.search?.results || (searchResponse as any).results || [];
    console.log(`Found ${results.length} results to process`);
    
    const sources = results.map((result: any) => {
      const scoreData = extractBestScore(result);
      
      return {
        id: result.documentId,
        fileName: result.fileName,
        text: result.text || result.suggestedText,
        metadata: result.metadata,
        sourceUrl: result.sourceUrl,
        score: scoreData.score,
        rawScore: scoreData.score,
        scoreSource: scoreData.source,
        highlights: result.highlight?.text || [],
        hasXray: true,
        pageImages: result.pageImages,
        narrative: result.narrative,
        searchData: result.searchData,
        boundingBoxes: result.boundingBoxes,
        json: result.json,
        fileKeywords: result.fileKeywords,
        bucketId: result.bucketId,
        multimodalUrl: result.multimodalUrl
      };
    });

    // Step 2: Generate AI response with conversation context
    const llmStartTime = Date.now();
    
    // Prepare context from search results
    const context = sources
      .map((source: any, index: number) => `[${index + 1}] ${source.fileName}: ${source.text}`)
      .join('\n\n');

    // Build messages for OpenAI including conversation history
    const systemPrompt = `You are an AI assistant that answers questions based on the provided document context.
Use the numbered references [1], [2], etc. to cite specific documents when making claims.
Be precise and factual. If the context doesn't contain enough information to answer the question, say so.

Context:
${context}`;

    // Create the messages array for OpenAI
    const openaiMessages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
      { role: 'system', content: systemPrompt }
    ];

    // If we have conversation context, add previous messages
    if (conversationContext && messages.length > 1) {
      console.log('📝 Adding conversation context...');
      
      // Add previous messages (excluding the last one since it's the current query)
      const previousMessages = messages.slice(0, -1);
      for (const msg of previousMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          openaiMessages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          });
        }
      }
    }

    // Add the current user query
    openaiMessages.push({ 
      role: 'user', 
      content: query 
    });

    console.log(`🤖 OpenAI request with ${openaiMessages.length} messages`);

    const openaiClient = getOpenAIClient();
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: openaiMessages,
      temperature: temperature,
      max_tokens: 1500
    });

    const llmEndTime = Date.now();
    const llmMs = llmEndTime - llmStartTime;
    const totalMs = llmEndTime - startTime;

    const aiResponse = completion.choices[0]?.message?.content || 'No response generated';

    // Prepare response
    const ragResponse: RagResponse = {
      success: true,
      timestamp: new Date().toISOString(),
      query: query,
      response: aiResponse,
      searchResults: {
        count: sources.length,
        sources: sources
      },
      executionTime: {
        totalMs,
        searchMs,
        llmMs
      }
    };

    if (includeThoughts) {
      ragResponse.thoughts = `I searched through ${sources.length} documents and found relevant information to answer your question about "${query}". ${conversationContext ? 'I considered our previous conversation context.' : ''}`;
    }

    console.log(`RAG completed in ${totalMs}ms (search: ${searchMs}ms, LLM: ${llmMs}ms)`);

    res.json(ragResponse);

  } catch (error: any) {
    console.error('Error in Ground-X RAG:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /groundx/documents/:documentId/xray
router.get('/documents/:documentId/xray', async (req: any, res: any) => {
  try {
    const { documentId } = req.params;
    const includeText = req.query.includeText === 'true';

    console.log(`Getting X-ray data for document: ${documentId}`);

    // Disable ETag generation and set aggressive cache control headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': '', // Disable ETag
      'Last-Modified': new Date().toUTCString() // Force fresh response
    });

    const client = getGroundXClient();
    const documentResponse = await client.documents.get(documentId);

    console.log('Document metadata from GroundX:', JSON.stringify(documentResponse, null, 2));

    if (!documentResponse || !documentResponse.document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found or no metadata available'
      });
    }

    const document = documentResponse.document;
    
    // Check if X-ray URL is available
    if (!document.xrayUrl) {
      return res.status(404).json({
        success: false,
        error: 'X-ray data not available for this document'
      });
    }

    console.log('Fetching X-ray data from URL:', document.xrayUrl);

    // Fetch the actual X-ray data
    try {
      const xrayResponse = await fetch(document.xrayUrl);
      
      if (!xrayResponse.ok) {
        throw new Error(`Failed to fetch X-ray data: ${xrayResponse.status} ${xrayResponse.statusText}`);
      }

      const xrayData = await xrayResponse.json();
      console.log('X-ray data keys:', xrayData && typeof xrayData === 'object' ? Object.keys(xrayData) : 'not an object');
      console.log('X-ray data structure sample:', JSON.stringify(xrayData, null, 2).substring(0, 1000) + '...');

      // Add timestamp to force uniqueness
      const responseData = {
        success: true,
        data: xrayData,
        documentId: documentId,
        documentMetadata: document,
        timestamp: new Date().toISOString()
      };

      console.log('Final response structure:', {
        success: responseData.success,
        dataKeys: responseData.data && typeof responseData.data === 'object' ? Object.keys(responseData.data) : 'not an object',
        documentId: responseData.documentId,
        hasMetadata: !!responseData.documentMetadata
      });

      res.json(responseData);

    } catch (fetchError: any) {
      console.error('Error fetching X-ray data from URL:', fetchError);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch X-ray data: ${fetchError.message}`
      });
    }

  } catch (error: any) {
    console.error('Error getting document metadata:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});

// POST /groundx/search
router.post('/search', async (req: any, res: any) => {
  try {
    const { query, bucketId, limit = 10 } = req.body;

    if (!query || !bucketId) {
      return res.status(400).json({
        success: false,
        error: 'Query and bucketId are required'
      });
    }

    console.log(`Searching bucket ${bucketId} for: "${query}"`);

    const client = getGroundXClient();
    const searchResponse = await client.search.content(parseInt(bucketId), {
      query: query,
      n: limit
    });

    if (!searchResponse?.search?.results) {
      return res.json({
        success: true,
        results: [],
        count: 0
      });
    }

    const results = searchResponse.search.results.map((result: any) => {
      const scoreData = extractBestScore(result);
      
      return {
        documentId: result.documentId,
        fileName: result.fileName,
        text: result.text || result.suggestedText,
        score: scoreData.score,
        metadata: result.metadata,
        highlights: result.highlight?.text || []
      };
    });

    res.json({
      success: true,
      results: results,
      count: results.length
    });

  } catch (error: any) {
    console.error('Error searching documents:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});

// GroundX health check endpoint
router.get('/health', async (req: any, res: any) => {
  try {
    if (!process.env.GROUNDX_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'GroundX API key not configured'
      });
    }

    const response = await fetch('https://api.groundx.ai/api/v1/health', {
      method: 'GET',
      headers: {
        'X-API-Key': process.env.GROUNDX_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      res.json({
        success: true,
        service: 'GroundX',
        status: 'healthy',
        data
      });
    } else {
      res.status(response.status).json({
        success: false,
        error: `GroundX API error: ${response.status}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;