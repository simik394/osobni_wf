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
import src.config.parser as config_parser
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
            params={'fields': 'id,name,fieldType(id,name),bundle(id,name)', 'top': 400}
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
            params={'fields': 'id,name,projects(shortName),columnSettings(field(id),columns(presentation,wipLimit(min,max))),sprintsSettings(disableSprints),readSharingSettings(permittedGroups(name)),swimlaneSettings(field(name)),colorCoding(prototype(name)),estimationField(name),originalEstimationField(name),orphansAtTheTop,hideOrphansSwimlane,backlog(query)'}
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


    def get_users(self) -> list[dict]:
        """Fetch all active users."""
        resp = self.session.get(
            f'{self.url}/api/admin/users',
            params={'fields': 'id,login,fullName,email'}
        )
        resp.raise_for_status()
        return resp.json()

    def get_groups(self) -> list[dict]:
        """Fetch all user groups with their users and roles."""
        resp = self.session.get(
            f'{self.url}/api/admin/groups',
            params={'fields': 'id,name,users(login),roles(id,role(name))'}
        )
        resp.raise_for_status()
        return resp.json()

    def get_roles(self) -> list[dict]:
        """Fetch all roles with their permissions."""
        resp = self.session.get(
            f'{self.url}/api/admin/roles',
            params={'fields': 'id,name,permissions(id,permission(name))'}
        )
        resp.raise_for_status()
        return resp.json()

    def get_project_role_assignments(self, project_id: str) -> list[dict]:
        """Fetch role assignments (team/users) for a project."""
        # Depending on YouTrack version, project roles are usually in team or directly on project
        # In modern YouTrack, project.team.users or we query access
        # Wait, the easiest way to get who has what role in a project is project profiles / team
        resp = self.session.get(
            f'{self.url}/api/admin/projects/{project_id}',
            params={'fields': 'id,shortName,team(users(login),groups(name)),teamRoles(role(name),team(id))'}
            # Wait, YouTrack REST API for project access is a bit convoluted.
            # A common way is project.team(users(login)) for simple cases, but for explicit roles:
            # Let's use /api/admin/projects/{project_id}?fields=id,shortName,team(id),teamRoles(...)
        )
        if resp.status_code == 404:
             return []
        resp.raise_for_status()
        return resp.json()

    def get_all_project_role_assignments(self, projects: list[dict]) -> dict:
        """Fetch roles for all given projects."""
        # Not perfectly efficient but works for a reasonable number of projects
        assignments = {}
        for proj in projects:
            try:
                # To get role assignments: we need to look at /api/admin/projects/{id}/projectRoles
                # (if YouTrack has projectRoles natively, wait let's use the standard `team`)
                # Actually YouTrack uses /api/admin/projects/{id}?fields=...
                # Let's use the hub API or simply assume we get it from project profiles?
                # A safer bet that works across versions:
                resp = self.session.get(
                    f'{self.url}/api/admin/projects/{proj["id"]}/projectRoles',
                    params={'fields': 'id,role(name),team(id),user(login),group(name)'}
                )
                if resp.status_code == 200:
                    assignments[proj['shortName']] = resp.json()
            except Exception as e:
                pass
        return assignments

    def get_global_time_tracking(self) -> dict:
        """Fetch global time tracking settings."""
        resp = self.session.get(
            f'{self.url}/api/admin/timeTrackingSettings',
            params={'fields': 'id,workTimeSettings(id,daysOfWeek,minutesLimit,firstDayOfWeek)'}
        )
        if resp.status_code == 404:
            return {}
        resp.raise_for_status()
        return resp.json()

    def get_project_time_tracking(self, project_id: str) -> dict:
        """Fetch project-specific time tracking settings."""
        resp = self.session.get(
            f'{self.url}/api/admin/projects/{project_id}/timeTrackingSettings',
            params={'fields': 'id,enabled,estimate(field(name)),workItemTypes(id,name)'}
        )
        if resp.status_code == 404:
            return {}
        resp.raise_for_status()
        return resp.json()

    def get_all_projects_time_tracking(self, projects: list[dict]) -> dict:
        """Fetch time tracking for all given projects."""
        project_tt = {}
        for proj in projects:
            try:
                tt = self.get_project_time_tracking(proj['id'])
                if tt:
                    project_tt[proj['shortName']] = tt
            except Exception:
                pass
        return project_tt

    def get_issue_link_types(self) -> list[dict]:
        """Fetch custom issue link types."""
        resp = self.session.get(
            f'{self.url}/api/issueLinkTypes',
            params={'fields': 'id,name,sourceToTarget,targetToSource,directed,aggregation,readOnly'}
        )
        resp.raise_for_status()
        return resp.json()

    def get_reports(self) -> list[dict]:
        """Fetch all reports."""
        resp = self.session.get(
            f'{self.url}/api/reports',
            params={'fields': 'id,name,$type,query,projects(id,shortName),sprint(id,name),estimationField(field(name)),stateField(field(name)),range(id,name)'}
        )
        resp.raise_for_status()
        return resp.json()

    def get_workflows(self) -> list[dict]:
        """Fetch all workflows with their rules and usage."""
        # We reuse the WorkflowClient logic which already knows the internal API
        wf_client = WorkflowClient(self.url, self.token)
        return wf_client.list_workflows()
    
    def get_tags(self) -> list[dict]:
        """Fetch all global tags."""
        resp = self.session.get(
            f'{self.url}/api/tags',
            params={'fields': 'id,name,untagOnResolve,visibleFor(name)'}
        )
        resp.raise_for_status()
        return resp.json()
    
    def get_saved_queries(self) -> list[dict]:
        """Fetch all saved queries."""
        resp = self.session.get(
            f'{self.url}/api/savedQueries',
            params={'fields': 'id,name,query'}
        )
        resp.raise_for_status()
        return resp.json()


def main():
    arg_parser = argparse.ArgumentParser(description='Logic-Driven IaC Controller')
    arg_parser.add_argument('--youtrack-url', required=True, help='YouTrack base URL')
    arg_parser.add_argument('--config-dir', default='obsidian-rules', help='Directory with YAML configs')
    arg_parser.add_argument('--dry-run', action='store_true', help='Print plan without executing')
    arg_parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    arg_parser.add_argument('--export', help='Export current configuration to YAML file')
    args = arg_parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Get token from Vault (with env var fallback)
    from src.config.vault import get_youtrack_token
    token = get_youtrack_token()
    if not token:
        raise ValueError('YOUTRACK_TOKEN not found - set YOUTRACK_TOKEN env var or configure Vault')
    
    client = YouTrackClient(args.youtrack_url, token)
    
    # 1. SENSE - Fetch current state
    logger.info('Fetching current state from YouTrack...')
    try:
        fields = client.get_custom_fields()
        bundles = client.get_bundles()
        state_bundles = client.get_state_bundles()
        projects = client.get_projects()
        workflows = client.get_workflows()
        agiles = client.get_agiles()
        tags = client.get_tags()
        saved_queries = client.get_saved_queries()

        users = client.get_users()
        groups = client.get_groups()
        roles = client.get_roles()
        project_roles = client.get_all_project_role_assignments(projects)

        global_time_tracking = client.get_global_time_tracking()
        project_time_tracking = client.get_all_projects_time_tracking(projects)
        issue_link_types = client.get_issue_link_types()
        reports = client.get_reports()


        
        # Merge enum and state bundles
        all_bundles = bundles + state_bundles
    except Exception as e:
        logger.error(f"Failed to fetch YouTrack state: {e}")
        return
    
    logger.info(f'Found {len(fields)} fields, {len(all_bundles)} bundles, {len(projects)} projects, {len(workflows)} workflows, {len(agiles)} boards, {len(tags)} tags, {len(saved_queries)} queries')
    

    # 2. LOAD CONFIG - Read YAML configs and convert to Prolog facts
    # If export requested, do it and exit
    if args.export:
        logger.info(f"Exporting current YouTrack state to {args.export}...")
        export_config(args.export, fields, all_bundles, projects, workflows, agiles, users, groups, roles, project_roles)
        return

    config_dir = Path(args.config_dir)
    if not config_dir.exists():
        logger.error(f'Config dir {config_dir} does not exist')
        return
        
    logger.info(f'Loading config from {config_dir}...')
    try:
        if (config_dir / 'project.yaml').exists():
            cfg = config_parser.load_config(config_dir / 'project.yaml')
        else:
            configs = config_parser.load_configs_from_dir(config_dir)
            cfg = config_parser.merge_configs(configs)
            
        target_facts = config_to_prolog_facts(cfg)
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        return
    
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
    plan = run_inference(
        fields, all_bundles, target_facts, projects, workflows, project_fields, agiles, tags, saved_queries,
        users, groups, roles, project_roles,
        global_time_tracking, project_time_tracking, issue_link_types, reports
    )
    
    if plan:
        # Defense-in-depth: skip create_field for fields confirmed to exist globally.
        # The actuator also has its own idempotency guard (pre-check + 409 handling),
        # so this is a belt-and-suspenders approach to prevent unnecessary API calls.
        existing_field_names = {f.get('name') for f in fields}
        filtered_plan = []
        for action in plan:
            if action[0] == 'create_field' and action[1] in existing_field_names:
                logger.info(f"Skipping create_field({action[1]}) - field already exists globally (defense-in-depth)")
                continue
            filtered_plan.append(action)
        plan = filtered_plan

    if not plan:
        logger.info('No changes needed - configuration is in sync!')
        return
    
    logger.info(f'Computed plan with {len(plan)} actions:')
    for i, action in enumerate(plan, 1):
        logger.info(f'  {i}. {action}')
    
    # 4. ACTUATE - Execute the plan
    logger.info('Executing plan...')
    actuator = YouTrackActuator(args.youtrack_url, token, dry_run=args.dry_run)
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



def export_config(output_file: str, fields: list, bundles: list, projects: list, workflows: list, agiles: list, users: list = None, groups: list = None, roles: list = None, project_roles: dict = None):
    """Export current state to YAML configuration."""
    import yaml
    
    config = {
        'projects': [],
        'bundles': {},
        'workflows': []
    }
    
    # Export Projects & Boards
    for proj in projects:
        p_conf = {
            'name': proj.get('name'),
            'shortName': proj.get('shortName'),
            'leader': proj.get('leader', {}).get('login'),
            'boards': []
        }
        
        # Find boards for this project
        p_short = proj.get('shortName')
        for board in agiles:
            # Check if project is in board's projects
            b_projects = [p.get('shortName') for p in board.get('projects', [])]
            if p_short in b_projects:
                b_conf = {
                    'name': board.get('name'),
                    'column_field': board.get('columnSettings', {}).get('field', {}).get('name'),
                    'sprints': {
                        'enabled': not board.get('sprintsSettings', {}).get('disableSprints', True)
                    },
                    'visible_to': [g.get('name') for g in board.get('readSharingSettings', {}).get('permittedGroups', [])],
                    'columns': [c.get('presentation') for c in board.get('columnSettings', {}).get('columns', [])],
                    'swimlane_field': (board.get('swimlaneSettings') or {}).get('field', {}).get('name')
                }
                # Clean up None/Empty
                if not b_conf['swimlane_field']: del b_conf['swimlane_field']
                
                p_conf['boards'].append(b_conf)
                
        if not p_conf['boards']: del p_conf['boards']
        config['projects'].append(p_conf)
        
    # Write to file
    with open(output_file, 'w') as f:
        yaml.dump(config, f, sort_keys=False)
    
    logger.info(f"Exported configuration to {output_file}")


if __name__ == '__main__':
    main()
