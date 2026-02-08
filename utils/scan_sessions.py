
import requests
import os
import json

API_KEY = "AQ.Ab8RN6Jsuhl61jeZvjhOcIiZk3TzaeC-JRE58y5pJP32yA4KIw"
BASE_URL = "https://jules.googleapis.com/v1alpha/sessions"

def list_pending_sessions():
    sessions = []
    page_token = None
    page_count = 0
    
    print("Scanning sessions pages...")
    
    while True:
        url = BASE_URL
        params = {"pageSize": 100} # Try to request more
        if page_token:
            params["pageToken"] = page_token
            
        headers = {
            "x-goog-api-key": API_KEY,
            "Content-Type": "application/json"
        }
        
        try:
            resp = requests.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            
            page_sessions = data.get("sessions", [])
            page_count += 1
            print(f"Page {page_count}: Found {len(page_sessions)} sessions")
            
            for s in page_sessions:
                state = s.get("state")
                if state == "AWAITING_USER_FEEDBACK":
                    print(f"FOUND PENDING: {s['name']} - {s.get('title')}")
                    sessions.append(s)
                elif state == "IN_PROGRESS":
                    print(f"TRACKING ACTIVE: {s['name']} - {s.get('title')}")
                    sessions.append(s)
            
            page_token = data.get("nextPageToken")
            if not page_token:
                break
                
            if page_count >= 20: # Safety break
                print("Reached 20 pages, stopping safety check.")
                break
                
        except Exception as e:
            print(f"Error: {e}")
            break
            
    return sessions

if __name__ == "__main__":
    pending = list_pending_sessions()
    print(f"\nTotal Pending Sessions: {len(pending)}")
    
    # Save to file for next step
    with open("pending_sessions.json", "w") as f:
        json.dump(pending, f, indent=2)
