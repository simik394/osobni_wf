"""
Logic-Driven IaC Controller
Main entry point that orchestrates sensing, inference, and actuation.
"""
import os
import argparse
import logging
from pathlib import Path

import requests

from src.config import load_configs_from_dir, config_to_prolog_facts
from src.actuator import YouTrackActuator, WorkflowClient

# Optional Janus import - will fail gracefully if not available
try:
    from src.logic.inference import run_inference, JANUS_AVAILABLE
except ImportError:
    JANUS_AVAILABLE = False

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


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

    def get_project_fields(self, project_id: str) -> list[dict]:
        """Fetch fields for a specific project with defaults."""
        resp = self.session.get(
            f'{self.url}/api/admin/projects/{project_id}/customFields',
            params={'fields': 'id,field(name),defaultValues(name)'}
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
    
    def get_agiles(self) -> list[dict]:
        """Fetch all Agile Boards with full configuration."""
        resp = self.session.get(
            f'{self.url}/api/agiles',
            params={'fields': 'id,name,projects(shortName),columnSettings(field(id),columns(presentation)),sprintsSettings(disableSprints),readSharingSettings(permittedGroups(name)),swimlaneSettings(field(name))'}
        )
        resp.raise_for_status()
        return resp.json()
    
    def get_state_bundles(self) -> list[dict]:
        """Fetch all state bundles."""
        resp = self.session.get(
            f'{self.url}/api/admin/customFieldSettings/bundles/state',
            params={'fields': 'id,name,values(id,name,isResolved,archived)'}
        )
        resp.raise_for_status()
        return resp.json()
    
    def get_projects(self) -> list[dict]:
        """Fetch all projects."""
        resp = self.session.get(
            f'{self.url}/api/admin/projects',
            params={'fields': 'id,name,shortName,leader(id,login),archived,customFields(id,field(id,name))'}
        )
        resp.raise_for_status()
        return resp.json()

    def get_workflows(self) -> list[dict]:
        """Fetch all workflows with their rules and usage."""
        # We reuse the WorkflowClient logic which already knows the internal API
        wf_client = WorkflowClient(self.url, self.token)
        return wf_client.list_workflows()


def main():
    parser = argparse.ArgumentParser(description='Logic-Driven IaC Controller')
    parser.add_argument('--youtrack-url', required=True, help='YouTrack base URL')
    parser.add_argument('--config-dir', default='obsidian-rules', help='Directory with YAML configs')
    parser.add_argument('--dry-run', action='store_true', help='Print plan without executing')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Get token from Vault (with env var fallback)
    from src.config.vault import get_youtrack_token
    token = get_youtrack_token()
    if not token:
        raise ValueError('YOUTRACK_TOKEN not found - set YOUTRACK_TOKEN env var or configure Vault')
    
    # 1. SENSE - Fetch current state from YouTrack
    logger.info('Fetching current state from YouTrack...')
    client = YouTrackClient(args.youtrack_url, token)
    
    fields = client.get_custom_fields()
    bundles = client.get_bundles()
    state_bundles = client.get_state_bundles()
    state_bundles = client.get_state_bundles()
    projects = client.get_projects()
    workflows = client.get_workflows()
    agiles = client.get_agiles()
    
    # Merge enum and state bundles
    all_bundles = bundles + state_bundles
    
    logger.info(f'Found {len(fields)} fields, {len(all_bundles)} bundles, {len(projects)} projects, {len(workflows)} workflows, {len(agiles)} boards')
    
    # 2. LOAD CONFIG - Read YAML configs and convert to Prolog facts
    config_dir = Path(args.config_dir)
    if not config_dir.exists():
        logger.warning(f'Config directory not found: {config_dir}')
        return
    
    configs = load_configs_from_dir(config_dir)
    if not configs:
        logger.warning(f'No YAML configs found in {config_dir}')
        return
    
    # Merge all configs and generate Prolog facts
    from src.config.parser import merge_configs
    merged_config = merge_configs(configs)
    target_facts = config_to_prolog_facts(merged_config)
    
    logger.debug(f'Generated target facts:\n{target_facts}')
    
    # 3. INFER - Run Prolog inference to compute action plan
    if not JANUS_AVAILABLE:
        logger.error('Janus not available - cannot run inference')
        logger.info('Install janus-swi or run in Docker container')
        return
    
    logger.info('Running Prolog inference...')
    
    # Fetch fields with defaults for each project
    project_fields = {}
    for proj in projects:
        pid = proj['id']
        try:
            pfields = client.get_project_fields(pid)
            project_fields[pid] = pfields
        except Exception as e:
            logger.warning(f"Failed to fetch fields for project {pid}: {e}")
    
    
    # Pass workflows and project fields to inference
    plan = run_inference(fields, all_bundles, target_facts, projects, workflows, project_fields, agiles)
    
    if not plan:
        logger.info('No changes needed - configuration is in sync!')
        return
    
    logger.info(f'Computed plan with {len(plan)} actions:')
    for i, action in enumerate(plan, 1):
        logger.info(f'  {i}. {action}')
    
    # 4. ACTUATE - Execute the plan
    if args.dry_run:
        logger.info('DRY RUN - no changes made')
        return
    
    logger.info('Executing plan...')
    actuator = YouTrackActuator(args.youtrack_url, token, dry_run=False)
    results = actuator.execute_plan(plan)
    
    # Report results
    succeeded = sum(1 for r in results if r.success)
    failed = len(results) - succeeded
    
    if failed > 0:
        logger.error(f'Plan execution: {succeeded} succeeded, {failed} failed')
        for r in results:
            if not r.success:
                logger.error(f'  FAILED: {r.action} - {r.error}')
    else:
        logger.info(f'Plan execution complete: {succeeded} actions succeeded')


if __name__ == '__main__':
    main()
