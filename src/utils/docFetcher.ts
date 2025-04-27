import axios from 'axios';
import * as cheerio from 'cheerio';
import { DocItem, SearchIndex, SearchDoc } from './types.js';
import lunr from 'lunr';

class DocFetcher {
  private baseUrl = 'https://google.github.io/adk-docs/';
  private searchIndexUrl = 'https://google.github.io/adk-docs/search/search_index.json';
  private docStructure: DocItem[] = [];
  private docMap: Map<string, DocItem> = new Map();
  private searchIndex: lunr.Index | null = null;
  private searchDocs: Map<string, SearchDoc> = new Map();
  private searchIndexCache: SearchIndex | null = null;

  async init(): Promise<void> {
    try {
      console.info('Fetching main documentation from:', this.baseUrl);
      
      // Initialize both the search index and doc structure in parallel
      await Promise.all([
        this.initializeSearchIndex(),
        this.initializeDocStructure()
      ]);
      
      console.info(`Initialized doc structure with ${this.docStructure.length} main sections`);
      return Promise.resolve();
    } catch (error) {
      console.error('Failed to initialize doc structure:', error);
      return Promise.reject(error);
    }
  }

  private async initializeSearchIndex(): Promise<void> {
    try {
      console.info('Fetching search index from:', this.searchIndexUrl);
      const response = await axios.get(this.searchIndexUrl);
      this.searchIndexCache = response.data as SearchIndex;
      
      // Create a Lunr index from the search_index.json data
      this.searchIndex = lunr(function() {
        this.ref('location');
        this.field('title', { boost: 10 });
        this.field('text');
        
        // Add each document to the index
        response.data.docs.forEach((doc: SearchDoc) => {
          this.add({
            location: doc.location,
            title: doc.title,
            text: doc.text
          });
        });
      });
      
      // Create a map of document locations to their full data for quick lookups
      response.data.docs.forEach((doc: SearchDoc) => {
        this.searchDocs.set(doc.location, doc);
      });
      
      console.info(`Initialized search index with ${response.data.docs.length} documents`);
    } catch (error) {
      console.error('Failed to initialize search index:', error);
      throw error;
    }
  }

  private async initializeDocStructure(): Promise<void> {
    try {
      // Fetch and parse the main documentation page for navigation structure
      const mainDoc = await this.fetchUrl(this.baseUrl);
      console.info('Parsing main documentation structure...');
      this.docStructure = this.parseMainDocStructure(mainDoc);
    } catch (error) {
      console.error('Failed to initialize doc structure:', error);
      throw error;
    }
  }

  async fetchDocContent(path: string): Promise<string> {
    try {
      // Check if this document exists in our search docs cache first
      const pathWithoutBase = path.replace(this.baseUrl, '');
      const normalizedPath = pathWithoutBase || '';
      
      // If we have the content cached from the search index, use that
      if (this.searchDocs.has(normalizedPath)) {
        const doc = this.searchDocs.get(normalizedPath);
        if (doc && doc.text) {
          console.info('Using cached content for:', path);
          return doc.text;
        }
      }
      
      // Otherwise, fetch and parse the content as before
      const url = new URL(path, this.baseUrl).toString();
      console.info('Fetching documentation content from:', url);
      const content = await this.fetchUrl(url);
      return this.parseDocContent(content);
    } catch (error) {
      console.error(`Failed to fetch doc content for ${path}:`, error);
      return 'Unable to fetch documentation content.';
    }
  }

  async search(query: string): Promise<DocItem[]> {
    console.info('Searching for:', query);
    
    if (!this.searchIndex) {
      console.warn('Search index not initialized, falling back to basic search');
      return this.fallbackSearch(query);
    }
    
    try {
      // Use Lunr to search the index
      const searchResults = this.searchIndex.search(query);
      console.info(`Lunr search for "${query}" returned ${searchResults.length} results`);
      
      // Map the search results to DocItem objects
      const results: DocItem[] = searchResults
        .slice(0, 10) // Limit to top 10 results
        .map(result => {
          const doc = this.searchDocs.get(result.ref);
          if (!doc) return null;
          
          let url = doc.location;
          // If the location is not a full URL, prepend the base URL
          if (!url.startsWith('http')) {
            url = new URL(url, this.baseUrl).toString();
          }
          
          // Create a summary/snippet from the doc text
          const snippet = this.createSnippet(doc.text, query);
          
          return {
            title: doc.title,
            url,
            content: snippet
          } as DocItem;
        })
        .filter(item => item !== null) as DocItem[];
      
      return results;
    } catch (error) {
      console.error('Error searching using Lunr:', error);
      // Fall back to the original search method if Lunr search fails
      return this.fallbackSearch(query);
    }
  }

  private createSnippet(text: string, query: string): string {
    if (!text) return '';
    
    // First clean any HTML from the text
    const cleanText = this.cleanHtml(text);
    
    const normalizedText = cleanText.toLowerCase();
    const normalizedQuery = query.toLowerCase();
    
    // Find the position of the query in the text
    const index = normalizedText.indexOf(normalizedQuery);
    if (index === -1) {
      // If query not found directly, return first part of the text
      return cleanText.substring(0, 200) + '...';
    }
    
    // Calculate start and end positions for the snippet
    const start = Math.max(0, index - 100);
    const end = Math.min(cleanText.length, index + normalizedQuery.length + 100);
    
    // Create and return the snippet
    let snippet = '';
    if (start > 0) snippet += '...';
    snippet += cleanText.substring(start, end);
    if (end < cleanText.length) snippet += '...';
    
    return snippet;
  }

  // Helper method to clean HTML tags from text
  private cleanHtml(text: string): string {
    return text
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Replace HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Remove backslash escapes
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '')
      // Fix double spaces
      .replace(/\s+/g, ' ')
      // Clean up unicode characters
      .replace(/\\u[0-9a-fA-F]{4}/g, match => {
        try {
          return String.fromCharCode(parseInt(match.slice(2), 16));
        } catch (e) {
          return match;
        }
      })
      .trim();
  }

  // Fallback to original search method if Lunr is not available
  private async fallbackSearch(query: string): Promise<DocItem[]> {
    const normalizedQuery = query.toLowerCase();
    const results: DocItem[] = [];

    // First, search through titles
    for (const [key, item] of this.docMap.entries()) {
      if (item.title.toLowerCase().includes(normalizedQuery)) {
        results.push(item);
      }

      // Limit to top results from title matches
      if (results.length >= 10) {
        break;
      }
    }

    // If no results from titles, try fetching and searching through content
    if (results.length === 0) {
      console.info('No title matches found, searching through content...');
      // Pick a subset of documents to search through content
      const documentsToSearch = this.docStructure.slice(0, 15);
      
      for (const doc of documentsToSearch) {
        try {
          // Fetch content if not already present
          if (!doc.content) {
            doc.content = await this.fetchDocContent(doc.url);
          }
          
          // Search in content
          if (doc.content.toLowerCase().includes(normalizedQuery)) {
            // Create a snippet with context around the match
            const contentLowerCase = doc.content.toLowerCase();
            const matchIndex = contentLowerCase.indexOf(normalizedQuery);
            const startIndex = Math.max(0, matchIndex - 100);
            const endIndex = Math.min(doc.content.length, matchIndex + normalizedQuery.length + 100);
            const snippet = doc.content.substring(startIndex, endIndex);
            
            // Add the result with the snippet - clean HTML here too
            const resultDoc = { ...doc };
            resultDoc.content = this.cleanHtml(snippet) + '...';
            results.push(resultDoc);
            
            // Limit results
            if (results.length >= 10) {
              break;
            }
          }
        } catch (error) {
          console.error(`Error searching content for ${doc.title}:`, error);
        }
      }
    }

    console.info(`Fallback search for "${query}" returned ${results.length} results`);
    return results;
  }

  getDocStructure(): DocItem[] {
    return this.docStructure;
  }

  getDocumentByTitle(title: string): DocItem | undefined {
    console.info('Looking for document with title:', title);
    
    // First try the docMap for perfect matches
    const exactMatch = this.docMap.get(title.toLowerCase());
    if (exactMatch) return exactMatch;
    
    // If no exact match, try to find it in the search docs
    if (this.searchIndex) {
      try {
        // Escape special characters and wrap the title in quotes to search for the exact phrase
        const escapedTitle = title
          .replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")
          .replace(/:/g, "\\:");
        
        // Use Lunr to search for documents with this title
        const searchResults = this.searchIndex.search(`title:"${escapedTitle}"`);
        if (searchResults.length > 0) {
          const doc = this.searchDocs.get(searchResults[0].ref);
          if (doc) {
            let url = doc.location;
            if (!url.startsWith('http')) {
              url = new URL(url, this.baseUrl).toString();
            }
            
            return {
              title: doc.title,
              url
            };
          }
        }
      } catch (error) {
        console.error('Error searching for document by title using Lunr:', error);
        
        // Fallback to simple text search if Lunr query fails
        console.info('Falling back to simple title search');
        for (const [location, doc] of this.searchDocs.entries()) {
          if (doc.title.toLowerCase().includes(title.toLowerCase())) {
            let url = location;
            if (!url.startsWith('http')) {
              url = new URL(url, this.baseUrl).toString();
            }
            
            return {
              title: doc.title,
              url
            };
          }
        }
      }
    }
    
    return undefined;
  }

  private async fetchUrl(url: string): Promise<string> {
    try {
      console.info('Fetching URL:', url);
      const response = await axios.get(url);
      console.info('Successfully fetched URL:', url);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch URL ${url}:`, error);
      throw error;
    }
  }

  private parseMainDocStructure(html: string): DocItem[] {
    const $ = cheerio.load(html);
    const docStructure: DocItem[] = [];

    console.info('Parsing main doc structure...');
    
    // Extract the navigation/table of contents structure
    // The exact selectors might need adjustments based on the actual HTML structure
    $('nav a').each((_, element) => {
      const $element = $(element);
      const title = $element.text().trim();
      const relativeUrl = $element.attr('href') || '';
      
      if (title && !title.includes('Home')) {
        const url = new URL(relativeUrl, this.baseUrl).toString();
        const docItem: DocItem = { title, url };
        
        docStructure.push(docItem);
        this.docMap.set(title.toLowerCase(), docItem);
        console.info('Added document:', title);
      }
    });

    console.info(`Found ${docStructure.length} documents in structure`);
    return docStructure;
  }

  private parseDocContent(html: string): string {
    const $ = cheerio.load(html);
    
    // Remove scripts, styles, and other non-content elements
    $('script, style, iframe, nav, footer, header, aside, .md-header, .md-tabs, .md-sidebar').remove();
    
    // Extract the main content area
    let content = '';
    
    // Try to find the main content using common selectors
    const mainContent = $('main article .md-content__inner');
    
    if (mainContent.length > 0) {
      // Process the main content
      content = this.processContent($, mainContent);
    } else {
      // Fallback to body content if main content area not found
      content = this.processContent($, $('body'));
    }
    
    // Clean up the extracted content
    return this.cleanupContent(content);
  }
  
  private processContent($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): string {
    // Convert headings to plain text with line breaks and proper formatting
    element.find('h1, h2, h3, h4, h5, h6').each((_, heading) => {
      const level = parseInt(heading.tagName.substring(1));
      const prefix = '#'.repeat(level) + ' ';
      $(heading).before('\n\n' + prefix);
      $(heading).after('\n');
    });
    
    // Format lists properly
    element.find('ul, ol').each((_, list) => {
      element.find('li').each((i, item) => {
        if (list.tagName === 'ol') {
          $(item).before(`${i + 1}. `);
        } else {
          $(item).before('• ');
        }
        $(item).after('\n');
      });
    });
    
    // Format code blocks
    element.find('pre, code').each((_, codeBlock) => {
      $(codeBlock).before('\n```\n');
      $(codeBlock).after('\n```\n');
    });
    
    // Handle links
    element.find('a').each((_, link) => {
      const text = $(link).text().trim();
      const href = $(link).attr('href');
      if (text && href) {
        $(link).replaceWith(`${text} (${href})`);
      }
    });
    
    // Extract text content
    return element.text();
  }
  
  private cleanupContent(content: string): string {
    return content
      // Replace multiple consecutive line breaks with two line breaks
      .replace(/\n{3,}/g, '\n\n')
      // Replace multiple consecutive spaces with a single space
      .replace(/[ \t]+/g, ' ')
      // Trim leading/trailing whitespace
      .trim();
  }
}

export const docFetcher = new DocFetcher(); 