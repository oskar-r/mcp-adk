#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { docFetcher } from './utils/docFetcher.js';
import { getDocStructureHandler, searchDocsHandler, getDocumentHandler, toolSchemas } from './utils/tools.js';

// This file provides a stdio transport implementation for running
// the MCP server directly in Cursor 'cmd' mode

// Initialize the documentation service
async function init() {
  try {
    console.info('Initializing documentation service for stdio mode...');
    await docFetcher.init();
    console.info('Documentation structure initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize doc structure:', error);
    return false;
  }
}

async function main() {
  // Initialize the documentation service
  const initialized = await init();
  if (!initialized) {
    process.exit(1);
  }

  // Create the MCP server with proper metadata
  const server = new McpServer({
    name: "adk-docs-mcp",
    version: "1.0.0"
  });

  // Add the getDocStructure tool using shared implementation
  server.tool(
    "getDocStructure",
    toolSchemas.getDocStructure,
    async () => getDocStructureHandler()
  );

  // Add the searchDocs tool using shared implementation
  server.tool(
    "searchDocs",
    toolSchemas.searchDocs,
    async ({ query }) => searchDocsHandler(query)
  );

  // Add the getDocument tool using shared implementation
  server.tool(
    "getDocument",
    toolSchemas.getDocument,
    async (params) => getDocumentHandler(params)
  );

  // Create and connect the stdio transport
  const transport = new StdioServerTransport();
  
  console.info("Starting MCP server with StdioServerTransport...");
  
  // Connect the server to the transport
  await server.connect(transport);
}

// Start the server
main().catch(error => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
}); 