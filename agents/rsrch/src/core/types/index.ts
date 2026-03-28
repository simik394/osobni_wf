
export interface ResearchAgent {
  query(queryText: string, options?: any): Promise<any>;
  getSession(sessionId: string): Promise<any>;
}

export abstract class ResearchAgentBase implements ResearchAgent {
  abstract query(queryText: string, options?: any): Promise<any>;
  abstract getSession(sessionId: string): Promise<any>;
}
