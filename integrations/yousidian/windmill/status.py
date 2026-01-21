import requests
import os
import sys

def main():
    """
    Windmill script to check the health of YOUSIDIAN components.
    """

    # Configuration
    PROXY_URL = os.environ.get("YOUSIDIAN_PROXY_URL", "http://localhost:8080")
    YOUTRACK_HOST = os.environ.get("YOUTRACK_HOST", "")
    YOUTRACK_TOKEN = os.environ.get("YOUTRACK_TOKEN", "")

    status = {
        "proxy": "unknown",
        "youtrack": "unknown",
        "overall": "unknown"
    }

    # 1. Check Proxy
    try:
        resp = requests.get(f"{PROXY_URL}/health", timeout=5)
        if resp.status_code == 200:
            status["proxy"] = "healthy"
        else:
            status["proxy"] = f"unhealthy ({resp.status_code})"
    except Exception as e:
        status["proxy"] = f"down ({str(e)})"

    # 2. Check YouTrack (if configured)
    if YOUTRACK_HOST and YOUTRACK_TOKEN:
        try:
            headers = {
                "Authorization": f"Bearer {YOUTRACK_TOKEN}",
                "Accept": "application/json"
            }
            # /api/admin/users/me is a lightweight endpoint
            resp = requests.get(f"{YOUTRACK_HOST}/api/admin/users/me?fields=id,login", headers=headers, timeout=5)
            if resp.status_code == 200:
                status["youtrack"] = "connected"
            else:
                status["youtrack"] = f"error ({resp.status_code})"
        except Exception as e:
            status["youtrack"] = f"unreachable ({str(e)})"
    else:
        status["youtrack"] = "not_configured"

    # 3. Determine Overall Status
    if status["proxy"] == "healthy" and status["youtrack"] in ["connected", "not_configured"]:
        status["overall"] = "operational"
    else:
        status["overall"] = "degraded"

    print(status)
    return status

if __name__ == "__main__":
    main()
