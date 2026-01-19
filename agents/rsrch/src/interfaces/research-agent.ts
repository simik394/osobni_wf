export interface ResearchAgent {
  name: string;
  query(prompt: string, options?: QueryOptions): Promise<Result>;
  getSession(id: string): Promise<Session>;
  listSessions(limit?: number): Promise<Session[]>;
  isAvailable(): Promise<boolean>;
}

export interface QueryOptions {
  deepResearch?: boolean;
  gem?: string;
  sources?: string[];
  timeout?: number;
}

export interface Result {
  id: string;
  content: string;
  citations?: Citation[];
  metadata?: Record<string, any>;
}

export interface Citation {
  id: string | number;
  text: string;
  url: string;
  domain?: string;
}

export interface Session {
  id: string;
  name?: string;
  url?: string;
  createdAt?: number | string;
}
