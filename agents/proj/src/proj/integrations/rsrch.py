"""Integration with rsrch agent for research context."""

import httpx
from typing import Any


RSRCH_BASE_URL = "http://localhost:3001"


async def query_rsrch(prompt: str, model: str = "gemini-rsrch") -> str:
    """Query the rsrch agent for research/analysis.
    
    Args:
        prompt: The question or research request
        model: Model to use (gemini-rsrch, gemini-deep-research, perplexity)
    
    Returns:
        The response content
    """
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{RSRCH_BASE_URL}/v1/chat/completions",
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


async def check_rsrch_health() -> bool:
    """Check if rsrch service is available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{RSRCH_BASE_URL}/health")
            data = response.json()
            return data.get("status") == "ok"
    except Exception:
        return False


async def search_research_sessions(query: str) -> list[dict[str, Any]]:
    """Search rsrch for related research sessions.
    
    This would query FalkorDB through rsrch for relevant research.
    
    Args:
        query: Search terms
    
    Returns:
        List of matching research session summaries
    """
    # TODO: Implement when rsrch exposes search endpoint
    # For now, return empty
    return []
