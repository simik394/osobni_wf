"""
Vault integration for secret management.
Fetches secrets (like API tokens) from HashiCorp Vault.
"""
import os
import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# Default Vault configuration
# Use Tailscale IP directly (Vault is not exposed via Traefik)
DEFAULT_VAULT_ADDR = os.environ.get("VAULT_ADDR", "http://100.73.45.27:8200")
DEFAULT_SECRET_PATH = "secret/data/youtrack"


def get_vault_token() -> Optional[str]:
    """
    Get Vault token from environment or file.
    
    Priority:
    1. VAULT_TOKEN environment variable
    2. ~/.vault-token file (set by vault login)
    """
    token = os.environ.get("VAULT_TOKEN")
    if token:
        return token
    
    # Try reading from file (set by `vault login`)
    token_file = os.path.expanduser("~/.vault-token")
    if os.path.exists(token_file):
        try:
            with open(token_file, "r") as f:
                return f.read().strip()
        except Exception as e:
            logger.warning(f"Failed to read vault token file: {e}")
    
    return None


def get_secret(
    path: str = DEFAULT_SECRET_PATH,
    key: str = "token",
    vault_addr: Optional[str] = None,
    vault_token: Optional[str] = None
) -> Optional[str]:
    """
    Fetch a secret from Vault KV v2 store.
    
    Args:
        path: Secret path (e.g., "secret/data/youtrack")
        key: Key within the secret data (e.g., "token")
        vault_addr: Vault server address (default: from env or hardcoded)
        vault_token: Vault authentication token (default: from env or file)
    
    Returns:
        The secret value, or None if not found
    """
    addr = vault_addr or os.environ.get("VAULT_ADDR", DEFAULT_VAULT_ADDR)
    token = vault_token or get_vault_token()
    
    if not token:
        logger.warning("No Vault token available - cannot fetch secret")
        return None
    
    url = f"{addr}/v1/{path}"
    
    try:
        resp = requests.get(
            url,
            headers={"X-Vault-Token": token},
            timeout=5
        )
        
        if resp.status_code == 404:
            logger.warning(f"Secret not found at {path}")
            return None
        
        resp.raise_for_status()
        data = resp.json()
        
        # KV v2 structure: {"data": {"data": {...}}}
        secret_data = data.get("data", {}).get("data", {})
        return secret_data.get(key)
        
    except requests.RequestException as e:
        logger.error(f"Failed to fetch secret from Vault: {e}")
        return None


def get_youtrack_token() -> Optional[str]:
    """
    Convenience function to get the YouTrack API token.
    
    Tries:
    1. Vault (if configured)
    2. YOUTRACK_TOKEN environment variable (fallback)
    """
    # Try Vault first
    token = get_secret(path=DEFAULT_SECRET_PATH, key="token")
    if token:
        logger.debug("Retrieved YouTrack token from Vault")
        return token
    
    # Fallback to environment variable
    token = os.environ.get("YOUTRACK_TOKEN")
    if token:
        logger.debug("Using YouTrack token from environment variable")
        return token
    
    return None
