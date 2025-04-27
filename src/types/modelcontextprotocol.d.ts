declare module '@modelcontextprotocol/sdk/dist/esm/types.js' {
  export interface McpToolDescription {
    name: string;
    displayName: string;
    description: string;
    icon: string;
    disableStackTrace?: boolean;
  }

  export interface McpFunctionParameters {
    type: string;
    properties: Record<string, any>;
    required: string[];
  }

  export interface McpFunction<T, R> {
    name: string;
    description: string;
    parameters: McpFunctionParameters;
    handler: (params: T) => Promise<R>;
  }

  export interface McpTool {
    description: McpToolDescription;
    functions: McpFunction<any, any>[];
  }
}

declare module '@modelcontextprotocol/sdk/dist/esm/server/index.js' {
  import { McpTool } from '@modelcontextprotocol/sdk/dist/esm/types.js';

  export interface McpServerOptions {
    port: number;
    tools: McpTool[];
    onFailure?: (err: Error) => void;
  }

  export function startMcpServer(options: McpServerOptions): Promise<void>;
} 