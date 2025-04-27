#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { docFetcher } from './utils/docFetcher.js';
import { getDocStructureHandler, searchDocsHandler, getDocumentHandler, toolSchemas } from './utils/tools.js';
import { randomUUID } from 'crypto';
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

// Create express app
const app = express();
const port = process.env.PORT || 3000;

// Set up middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok' });
});

// Create the MCP server with proper metadata
const server = new McpServer({
  name: "adk-docs-mcp",
  version: "1.0.0"
});

// Add the getDocStructure tool
server.tool(
  "getDocStructure",
  toolSchemas.getDocStructure,
  async () => getDocStructureHandler()
);

// Add the searchDocs tool
server.tool(
  "searchDocs",
  toolSchemas.searchDocs,
  async ({ query }) => searchDocsHandler(query)
);

// Add the getDocument tool
server.tool(
  "getDocument",
  toolSchemas.getDocument,
  async (params) => getDocumentHandler(params)
);

// Store transports for session management
const transports: {
  sse: Record<string, SSEServerTransport>,
  streamable: Record<string, StreamableHTTPServerTransport>
} = {
  sse: {},
  streamable: {}
};

// SSE endpoint for client connection (legacy support)
app.get('/sse', (req, res) => {
  console.log('SSE connection established');
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Create SSE transport
  const transport = new SSEServerTransport('/messages', res);
  
  // Store the transport by session ID
  const sessionId = transport.sessionId;
  console.log(`Created SSE session: ${sessionId}`);
  transports.sse[sessionId] = transport;
  
  // Clean up on client disconnect
  res.on('close', () => {
    console.log('SSE connection closed');
    delete transports.sse[sessionId];
  });
  
  // Connect the transport to the MCP server
  server.connect(transport).catch(error => {
    console.error('Error connecting SSE transport to server:', error);
  });
});

// Message handling endpoint for SSE clients
app.post('/messages', (req, res) => {
  const handleMessage = async () => {
    console.log('Message received:', req.body);
    
    // Get the session ID from query parameters
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId || !transports.sse[sessionId]) {
      return res.status(400).json({
        error: 'Invalid or missing session ID'
      });
    }
    
    // Get the transport for this session
    const transport = transports.sse[sessionId];
    
    // Handle the message
    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error('Error handling message:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error'
        });
      }
    }
  };
  
  handleMessage().catch(error => {
    console.error('Unhandled error in message handler:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  });
});

// Modern Streamable HTTP endpoint
app.all('/mcp', async (req, res) => {
  try {
    console.log(`Received ${req.method} request to /mcp`);
    
    if (req.method === 'POST') {
      // Get the session ID from header
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      console.log(`Session ID from header: ${sessionId || 'none'}`);
      
      // Case 1: Reuse existing transport
      if (sessionId && transports.streamable[sessionId]) {
        console.log(`Using existing transport for session ${sessionId}`);
        const transport = transports.streamable[sessionId];
        await transport.handleRequest(req, res, req.body);
        return;
      }
      
      // Case 2: Create new transport for initial request
      if (!sessionId && isInitializeRequest(req.body)) {
        console.log('Creating new StreamableHTTP transport for initialization request');
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            console.log(`New StreamableHTTP session initialized: ${newSessionId}`);
            transports.streamable[newSessionId] = transport;
          }
        });
        
        // Set cleanup on transport close
        transport.onclose = () => {
          if (transport.sessionId) {
            console.log(`StreamableHTTP session closed: ${transport.sessionId}`);
            delete transports.streamable[transport.sessionId];
          }
        };
        
        // Connect to the MCP server
        await server.connect(transport);
        
        // Handle the request
        await transport.handleRequest(req, res, req.body);
        return;
      }
      
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided or not an initialization request',
        },
        id: null,
      });
      return;
    } 
    else if (req.method === 'GET') {
      // Handle GET requests for SSE streams via StreamableHTTP
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      
      if (!sessionId || !transports.streamable[sessionId]) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }
      
      console.log(`Establishing SSE stream for StreamableHTTP session ${sessionId}`);
      const transport = transports.streamable[sessionId];
      await transport.handleRequest(req, res);
      return;
    }
    else if (req.method === 'DELETE') {
      // Handle session termination
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      
      if (!sessionId || !transports.streamable[sessionId]) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }
      
      console.log(`Handling DELETE request for session ${sessionId}`);
      const transport = transports.streamable[sessionId];
      await transport.handleRequest(req, res);
      return;
    }
    
    // Method not allowed
    res.status(405).set('Allow', 'GET, POST, DELETE').send('Method Not Allowed');
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Main function to start the server
async function main() {
  try {
    // Initialize doc fetcher by fetching and parsing the main documentation
    console.log('Initializing documentation service...');
    await docFetcher.init();
    console.log('Documentation structure initialized successfully');
    
    // Start the server
    app.listen(port, () => {
      console.log(`🚀 ADK Documentation MCP server running on port ${port}`);
      console.log(`- SSE endpoint (legacy): http://localhost:${port}/sse`);
      console.log(`- Streamable HTTP endpoint: http://localhost:${port}/mcp`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch(error => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
}); 