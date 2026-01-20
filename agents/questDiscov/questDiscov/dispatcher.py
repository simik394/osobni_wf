import os
import json
import requests
from typing import Optional, Dict, Any

class DispatchClient:
    """
    Client for dispatching heavy tasks to the Rsrch Agent via Windmill.
    """
    
    def __init__(self, windmill_url: str = "http://halvarm:3030", token: Optional[str] = None):
        self.base_url = windmill_url
        self.token = token or self._load_token()

    def _load_token(self) -> Optional[str]:
        # Try env var
        if token := os.getenv("WINDMILL_TOKEN"):
            return token
            
        # Try auth.json
        auth_path = os.path.expanduser("~/.gemini/auth.json")
        if os.path.exists(auth_path):
            try:
                with open(auth_path, 'r') as f:
                    data = json.load(f)
                    return data.get("token")
            except Exception:
                pass
        return None

    def dispatch_research(self, query: str, deep: bool = False, gem: Optional[str] = None) -> Dict[str, Any]:
        """
        Dispatch a research task to Windmill.
        """
        if not self.token:
            raise ValueError("WINDMILL_TOKEN not found in env or ~/.gemini/auth.json")

        endpoint = f"{self.base_url}/api/w/hub/jobs/run/f/rsrch/execute"
        
        payload = {
            "command": "deep-research" if deep else "research",
            "args": {
                "query": query,
                "gem": gem
            }
        }
        
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.post(endpoint, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            return response.json() # Returns { "job_uuid": "..." }
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}

    def check_status(self, job_uuid: str) -> Dict[str, Any]:
        """
        Check status of a dispatched job.
        """
        if not self.token:
             raise ValueError("Token missing")
             
        endpoint = f"{self.base_url}/api/w/hub/jobs/{job_uuid}"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            response = requests.get(endpoint, headers=headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
