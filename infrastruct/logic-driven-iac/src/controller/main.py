"""
Logic-Driven IaC Controller
Sensing layer that fetches current state from YouTrack API and injects facts into Prolog.
"""
import os
import argparse
import json
from pathlib import Path

import requests
# import janus_swi as janus  # Uncomment when janus is installed


class YouTrackClient:
    """Client for YouTrack REST API."""
    
    def __init__(self, url: str, token: str):
        self.url = url.rstrip('/')
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        })
    
    def get_custom_fields(self) -> list[dict]:
        """Fetch all custom field definitions."""
        resp = self.session.get(
            f'{self.url}/api/admin/customFieldSettings/customFields',
            params={'fields': 'id,name,fieldType(id,name),bundle(id,name)'}
        )
        resp.raise_for_status()
        return resp.json()
    
    def get_bundles(self) -> list[dict]:
        """Fetch all enum bundles."""
        resp = self.session.get(
            f'{self.url}/api/admin/customFieldSettings/bundles/enum',
            params={'fields': 'id,name,values(id,name,archived)'}
        )
        resp.raise_for_status()
        return resp.json()


def inject_facts_to_prolog(fields: list, bundles: list):
    """Inject current state as Prolog facts using Janus."""
    # TODO: Implement Janus integration
    # for field in fields:
    #     janus.query(f"assertz(curr_field('{field['id']}', '{field['name']}', '{field['fieldType']['name']}'))")
    pass


def main():
    parser = argparse.ArgumentParser(description='Logic-Driven IaC Controller')
    parser.add_argument('--youtrack-url', required=True, help='YouTrack base URL')
    parser.add_argument('--rules-dir', default='/rules', help='Directory with Prolog rules')
    parser.add_argument('--dry-run', action='store_true', help='Print plan without executing')
    args = parser.parse_args()
    
    token = os.environ.get('YOUTRACK_TOKEN')
    if not token:
        raise ValueError('YOUTRACK_TOKEN environment variable required')
    
    client = YouTrackClient(args.youtrack_url, token)
    
    print('[*] Fetching current state from YouTrack...')
    fields = client.get_custom_fields()
    bundles = client.get_bundles()
    
    print(f'[*] Found {len(fields)} fields, {len(bundles)} bundles')
    
    # TODO: Load rules from Obsidian markdown
    # TODO: Inject facts into Prolog
    # TODO: Run inference
    # TODO: Execute plan (or print if dry-run)
    
    if args.dry_run:
        print('[*] DRY RUN - No changes made')
    

if __name__ == '__main__':
    main()
