from typing import Optional, Dict, Any
from langchain_core.tools import tool
from ..dispatcher import DispatchClient

# Initialize client (lazy or global?)
# For now, create new client per call to pick up env vars if changed.
# Or global for efficiency. Global is fine.
_client = DispatchClient()

@tool
def dispatch_deep_research(query: str, gem: Optional[str] = None) -> str:
    """
    Dispatch a Deep Research task to the RSRCH agent (on Halvarm).
    Use this when a question requires extensive research, web browsing, or synthesis.
    
    Args:
        query: The research query/topic.
        gem: Optional Gem name (context).
        
    Returns:
        JSON string with job_uuid or error.
    """
    try:
        result = _client.dispatch_research(query, deep=True, gem=gem)
        if "job_uuid" in result:
            return f"Started Deep Research. Job ID: {result['job_uuid']}. Use check_research_status to monitor."
        return f"Failed to dispatch: {result}"
    except Exception as e:
        return f"Error dispatching research: {str(e)}"

@tool
def check_research_status(job_uuid: str) -> str:
    """
    Check the status of a dispatched research job.
    
    Args:
        job_uuid: The Job ID returned by dispatch_deep_research.
        
    Returns:
        Status string or result if complete.
    """
    try:
        result = _client.check_status(job_uuid)
        # Simplify output for LLM
        return str(result)
    except Exception as e:
        return f"Error checking status: {str(e)}"
