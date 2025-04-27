/**
 * MCP Tool Description interface
 */
export interface McpToolDescription {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  disableStackTrace?: boolean;
}

/**
 * MCP Function Parameters interface
 */
export interface McpFunctionParameters {
  type: string;
  properties: Record<string, any>;
  required: string[];
}

/**
 * MCP Function interface
 */
export interface McpFunction<T, R> {
  name: string;
  description: string;
  parameters: McpFunctionParameters;
  handler: (params: T) => Promise<R>;
}

/**
 * MCP Tool interface
 */
export interface McpTool {
  description: McpToolDescription;
  functions: McpFunction<any, any>[];
}

/**
 * MCP Server Options
 */
export interface McpServerOptions {
  port: number;
  tools: McpTool[];
  onFailure?: (err: Error) => void;
} 