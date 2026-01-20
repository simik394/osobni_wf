import os
import httpx
from typing import List, Dict, Optional, Any
from datetime import datetime

class YouTrackClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

    def _get(self, endpoint: str, params: Dict[str, Any] = None) -> Any:
        url = f"{self.base_url}/api/{endpoint}"
        response = httpx.get(url, headers=self.headers, params=params, timeout=30.0)
        response.raise_for_status()
        return response.json()

    def _post(self, endpoint: str, data: Dict[str, Any] = None) -> Any:
        url = f"{self.base_url}/api/{endpoint}"
        response = httpx.post(url, headers=self.headers, json=data, timeout=30.0)
        response.raise_for_status()
        return response.json()

    def get_issue(self, issue_id: str, fields: str = "id,summary,description,customFields(name,value(name))") -> Dict[str, Any]:
        """Fetch a single issue by ID (e.g., QUEST-5)."""
        return self._get(f"issues/{issue_id}", params={"fields": fields})

    def search_issues(self, query: str, fields: str = "id,summary,description", limit: int = 50) -> List[Dict[str, Any]]:
        """Search issues using YouTrack query syntax."""
        return self._get("issues", params={
            "query": query,
            "fields": fields,
            "$top": limit
        })

    def update_issue_state(self, issue_id: str, state: str):
        """Update the State field of an issue."""
        # Note: 'State' is a custom field name, usually. It might vary by project.
        # We assume standard 'State' field.
        # YouTrack API for custom fields is complex. We usually need to find the field ID or name.
        # A simpler way often supported is executing a command.

        # Using command execution endpoint: /api/issues/{id}/executeCommand
        command = f"State {state}"
        return self._post(f"issues/{issue_id}/executeCommand", data={
            "query": command
        })

    def add_comment(self, issue_id: str, text: str):
        """Add a comment to an issue."""
        return self._post(f"issues/{issue_id}/comments", data={
            "text": text
        })

def get_youtrack_client() -> Optional[YouTrackClient]:
    base_url = os.getenv("YOUTRACK_URL")
    token = os.getenv("YOUTRACK_TOKEN")
    if not base_url or not token:
        return None
    return YouTrackClient(base_url, token)
