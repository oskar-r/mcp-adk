export interface DocItem {
  title: string;
  url: string;
  content?: string;
  children?: DocItem[];
}

export interface SearchDocsParams {
  query: string;
}

export interface GetDocumentParams {
  path?: string;
  title?: string;
}

export interface DocStructureResponse {
  sections: DocItem[];
}

export interface SearchDocsResponse {
  results: DocItem[];
}

export interface GetDocumentResponse {
  title: string;
  content: string;
  url: string;
}

// Types for the search_index.json structure
export interface SearchDoc {
  location: string;
  title: string;
  text: string;
}

export interface SearchIndex {
  config: {
    lang: string[];
    separator: string;
    pipeline: string[];
  };
  docs: SearchDoc[];
} 