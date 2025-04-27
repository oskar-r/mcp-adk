# ADK Documentation MCP Server

This is a Model Context Protocol (MCP) server that provides access to the Google Agent Development Kit (ADK) documentation within Cursor and other MCP-enabled IDEs.

## Features

- **Documentation Structure**: Get the overall structure of the ADK documentation.
- **Search**: Search for specific topics or keywords in the documentation.
- **Document Retrieval**: Get the content of specific documentation pages.

## Implementation

This server is a TypeScript application that fetches and parses documentation from the Google ADK website:
- Uses axios for HTTP requests and cheerio for HTML parsing
- Scrapes the navigation structure to build a documentation map
- Provides real-time search and content retrieval functionality
- Exposes the documentation through a standardized MCP interface
- Includes an SSE endpoint for Cursor compatibility
- Implements proper MCP SDK response formatting with typed content

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd adk-docs-mcp

# Install dependencies
npm install

# Build the TypeScript implementation
npm run build

# Start the server
npm start
```

The server will run on port 3000 by default. You can change this by setting the `PORT` environment variable.

## Development

```bash
# Run in development mode with hot reloading
npm run dev
```

## Usage in Cursor

### HTTP Server Mode

Once the server is running, you can configure Cursor to use it as an MCP server:

1. Open Cursor
2. Go to Settings (⚙️ icon)
3. Navigate to `Agents > Advanced > Custom MCP URL`
4. Enter `http://localhost:3000/sse` as the URL (note the `/sse` endpoint)
5. Save the settings and restart Cursor if needed

Now you can ask the Cursor agent about ADK documentation. Example queries:

- "What is the ADK documentation structure?"
- "Search the ADK docs for information about function tools"
- "Show me documentation about workflow agents"

### Stdio Server Mode for Cursor Command

The server also supports running in stdio mode, which is compatible with Cursor's command mode:

1. Build the project with `npm run build`
2. Register the command in Cursor:
   - Open Cursor
   - Go to Settings (⚙️ icon)
   - Navigate to `Agents > Commands`
   - Add a new command:
     - Name: `ADK Documentation`
     - Command: `node /path/to/your/project/dist/stdio-server.js`
     - (Replace `/path/to/your/project` with the actual path)
3. You can now run `cmd:ADK Documentation` in Cursor to access the documentation

## API

The MCP server provides the following endpoints:

- `GET /health`: Check server health
- `GET /sse`: SSE endpoint for Cursor client connection
- `POST /messages`: Message endpoint for SSE clients
- `ALL /mcp`: Modern Streamable HTTP endpoint (recommended for new implementations)

## Tools

The server exposes the following MCP tools:

- `getDocStructure`: Get documentation structure
- `searchDocs`: Search the documentation 
- `getDocument`: Get the content of a specific document by path or title

## Testing the API

You can test the API using curl:

```bash
# Get server health
curl http://localhost:3000/health

# Use the modern MCP endpoint with initialization
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' \
  http://localhost:3000/mcp
```

## Response Format

All tools return responses in the MCP-compatible format with properly typed content:

```typescript
{
  content: [{
    type: "text" as const,
    text: JSON.stringify({
      // Tool-specific response data
    })
  }]
}
```

## Troubleshooting

If you encounter any issues:

1. Make sure the server is running on the specified port
2. Check the console logs for error messages
3. Verify Cursor is properly configured with the correct MCP server URL (**including the `/sse` endpoint**)
4. If Cursor can't connect to the server, check if your firewall might be blocking the connection
5. Try restarting Cursor after changing the MCP settings
6. If you see Zod validation errors, ensure you've rebuilt the project with `npm run build` after making changes

## Recent Changes

- Fixed type compatibility issues with MCP SDK response format using const assertions
- Added proper error handling and response validation
- Improved logging for debugging purposes
- Added stdio transport support for Cursor command mode

## License

ISC 