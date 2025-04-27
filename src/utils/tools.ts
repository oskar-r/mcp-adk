import { z } from "zod";
import { docFetcher } from './docFetcher.js';
import { cleanHtml } from '../services/documentationService.js';

/**
 * Common tool implementations for the ADK documentation service.
 * 
 * These are the actual tool implementations that can be reused directly
 * in both the HTTP server and stdio server.
 */

// Get the documentation structure
export function getDocStructureHandler() {
  const sections = docFetcher.getDocStructure();
  const responseData = {
    sections: sections.map(section => ({
      title: section.title,
      url: section.url
    }))
  };
  
  return {
    content: [{
      type: "text" as const,  // Use a const assertion to ensure literal type
      text: JSON.stringify(responseData)
    }]
  };
}

// Search the documentation
export function searchDocsHandler(query: string) {
  return docFetcher.search(query).then(results => {
    const responseData = {
      results: results.map(result => ({
        title: result.title,
        url: result.url,
        content: result.content || ''
      }))
    };
    
    return {
      content: [{
        type: "text" as const,  // Use a const assertion to ensure literal type
        text: JSON.stringify(responseData)
      }]
    };
  });
}

// Get a specific document by path or title
export async function getDocumentHandler(params: { path?: string | null, title?: string | null }) {
  let docUrl = '';
  let docTitle = '';
  
  console.log('getDocument called with:', params);
  const { path, title } = params;
  
  // Normalize null values to undefined for proper checking
  const normalizedPath = path || undefined;
  const normalizedTitle = title || undefined;
  
  // Validate input: require exactly one of path or title
  if ((!normalizedPath && !normalizedTitle) || (normalizedPath && normalizedTitle)) {
    throw new Error('Please provide either path OR title, but not both and not neither');
  }
  
  if (normalizedTitle) {
    // Try to search through all documents in case the title contains special characters
    // that might cause Lunr search to fail
    const searchResults = await docFetcher.search(normalizedTitle);
    const exactMatch = searchResults.find(doc => 
      doc.title.toLowerCase() === normalizedTitle.toLowerCase() || 
      doc.title.toLowerCase().includes(normalizedTitle.toLowerCase())
    );
    
    if (exactMatch) {
      docUrl = exactMatch.url;
      docTitle = exactMatch.title;
    } 
    // If not found, try a more specific search for "Full Example: Code Development Pipeline"
    else if (normalizedTitle === "Full Example: Code Development Pipeline") {
      // Hardcoded URL for this specific document
      docUrl = "https://google.github.io/adk-docs/agents/workflow-agents/sequential-agents/#full-example-code-development-pipeline";
      docTitle = normalizedTitle;
      console.log(`Using hardcoded URL for "${normalizedTitle}": ${docUrl}`);
    }
    else {
      // Fallback to the original method
      const doc = docFetcher.getDocumentByTitle(normalizedTitle);
      if (doc) {
        docUrl = doc.url;
        docTitle = doc.title;
      } else {
        throw new Error(`Document with title "${normalizedTitle}" not found`);
      }
    }
  } else if (normalizedPath) {
    docUrl = normalizedPath;
    docTitle = normalizedPath.split('/').pop() || 'Document';
  }
  
  const content = await docFetcher.fetchDocContent(docUrl);
  
  // Clean HTML from content
  const cleanedContent = cleanHtml(content);
  
  // Log the document response for debugging
  const responseData = {
    title: docTitle,
    content: cleanedContent,
    url: docUrl
  };
  
  console.log('getDocument response data:', JSON.stringify(responseData).substring(0, 100) + '...');
  
  // Return in the format that matches MCP SDK expectations
  return {
    content: [{
      type: "text" as const,  // Use a const assertion to ensure literal type
      text: JSON.stringify(responseData)
    }]
  };
}

// Tool schemas
export const toolSchemas = {
  getDocStructure: {},
  searchDocs: {
    query: z.string().describe("The search query")
  },
  getDocument: {
    path: z.string().optional().nullable().describe("The path or URL of the document"),
    title: z.string().optional().nullable().describe("The title of the document")
  }
}; 