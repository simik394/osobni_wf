
import sys
import json
import os
from datetime import datetime
from falkordb import FalkorDB

def create_perplexity_search_node(query, citations):
    """
    Creates a :PerplexitySearch node in FalkorDB.

    Args:
        query: The search query.
        citations: A list of citation URLs.
    """
    try:
        # Connection details from environment variables with defaults
        host = os.getenv('FALKORDB_HOST', 'localhost')
        port = int(os.getenv('FALKORDB_PORT', 6379))
        db = FalkorDB(host=host, port=port)
        graph = db.select_graph('perplexity_searches')

        graph.query("""
            CREATE (:PerplexitySearch {
                query: $query,
                citations: $citations,
                createdAt: $createdAt
            })
        """, {
            'query': query,
            'citations': citations,
            'createdAt': datetime.utcnow().isoformat()
        })
        print("Successfully created PerplexitySearch node.")
    except Exception as e:
        print(f"Error creating PerplexitySearch node: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python create_search_node.py <query> <citations_json>")
        sys.exit(1)

    query = sys.argv[1]
    citations_str = sys.argv[2]

    try:
        citations = json.loads(citations_str)
        if not isinstance(citations, list):
            raise ValueError("Citations must be a JSON array.")
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Error decoding citations JSON: {e}")
        sys.exit(1)

    create_perplexity_search_node(query, citations)
