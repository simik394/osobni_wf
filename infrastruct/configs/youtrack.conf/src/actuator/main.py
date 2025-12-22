"""
Logic-Driven IaC Actuator
Actuation layer that applies planned changes to YouTrack via REST API.
"""
import logging
from dataclasses import dataclass
from typing import Optional

import requests

logger = logging.getLogger(__name__)


@dataclass
class ActionResult:
    """Result of an actuator action."""
    action: str
    success: bool
    resource_id: Optional[str] = None
    error: Optional[str] = None


class YouTrackActuator:
    """Actuator for YouTrack REST API - applies changes from Prolog plan."""
    
    # Field type mapping: Prolog type -> YouTrack API type ID
    FIELD_TYPES = {
        'enum': 'enum[1]',
        'state': 'state[1]', 
        'string': 'string',
        'integer': 'integer',
        'date': 'date',
        'period': 'period',
        'float': 'float',
        'text': 'text',
    }
    
    def __init__(self, url: str, token: str, dry_run: bool = False):
        """
        Initialize actuator.
        
        Args:
            url: YouTrack base URL (e.g., https://youtrack.example.com)
            token: Bearer token for API authentication
            dry_run: If True, log actions without executing them
        """
        self.url = url.rstrip('/')
        self.token = token
        self.dry_run = dry_run
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        })
    
    # =========================================================================
    # BUNDLE OPERATIONS
    # =========================================================================
    
    def create_bundle(self, name: str, bundle_type: str = 'enum') -> ActionResult:
        """
        Create a new bundle.
        
        Args:
            name: Bundle name
            bundle_type: One of 'enum', 'state', 'version', 'build', 'user', 'ownedField'
        """
        action = f"create_bundle({name}, {bundle_type})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/customFieldSettings/bundles/{bundle_type}',
                json={'name': name}
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Created bundle: {name} (id={data.get('id')})")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to create bundle {name}: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    def add_bundle_value(self, bundle_id: str, value_name: str, 
                         bundle_type: str = 'enum') -> ActionResult:
        """
        Add a value to an existing bundle.
        
        Args:
            bundle_id: Bundle ID or name
            value_name: Value to add
            bundle_type: Bundle type for correct endpoint
        """
        action = f"add_bundle_value({bundle_id}, {value_name})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/customFieldSettings/bundles/{bundle_type}/{bundle_id}/values',
                json={'name': value_name}
            )
            resp.raise_for_status()  
            data = resp.json()
            logger.info(f"Added value '{value_name}' to bundle {bundle_id}")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to add value to bundle: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    def add_state_value(self, bundle_id: str, value_name: str,
                        is_resolved: bool = False) -> ActionResult:
        """
        Add a state value to a state bundle.
        
        Args:
            bundle_id: State bundle ID
            value_name: State name (e.g., "Open", "Done")
            is_resolved: Whether this state means the issue is resolved
        """
        action = f"add_state_value({bundle_id}, {value_name}, resolved={is_resolved})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/customFieldSettings/bundles/state/{bundle_id}/values',
                json={'name': value_name, 'isResolved': is_resolved}
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Added state '{value_name}' (resolved={is_resolved}) to bundle {bundle_id}")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to add state value: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    # =========================================================================
    # PROJECT OPERATIONS
    # =========================================================================
    
    def create_project(self, name: str, short_name: str, 
                       leader_id: str) -> ActionResult:
        """
        Create a new project.
        
        Args:
            name: Project full name
            short_name: Project short name (used in issue IDs, e.g., "DEMO")
            leader_id: ID of the project leader (user ID)
        """
        action = f"create_project({name}, {short_name})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/projects',
                json={
                    'name': name,
                    'shortName': short_name,
                    'leader': {'id': leader_id}
                },
                params={'fields': 'id,name,shortName'}
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Created project: {name} ({short_name}) id={data.get('id')}")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to create project {name}: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    # =========================================================================
    # CUSTOM FIELD OPERATIONS
    # =========================================================================
    
    def create_field(self, name: str, field_type: str, 
                     bundle_id: Optional[str] = None) -> ActionResult:
        """
        Create a new custom field.
        
        Args:
            name: Field name
            field_type: Field type (enum, state, string, integer, etc.)
            bundle_id: Bundle ID for enum/state fields (required for those types)
        """
        action = f"create_field({name}, {field_type})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        api_type = self.FIELD_TYPES.get(field_type, field_type)
        
        payload = {
            'name': name,
            'fieldType': {'id': api_type}
        }
        
        # For enum/state fields, we need to specify the bundle
        if bundle_id and field_type in ('enum', 'state'):
            payload['bundle'] = {'id': bundle_id}
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/customFieldSettings/customFields',
                json=payload,
                params={'fields': 'id,name,fieldType(id,name)'}
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Created field: {name} (id={data.get('id')})")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to create field {name}: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    def attach_field_to_project(self, field_id: str, project_id: str,
                                can_be_empty: bool = True) -> ActionResult:
        """
        Attach an existing custom field to a project.
        
        Args:
            field_id: Custom field ID
            project_id: Project short name or ID
            can_be_empty: Whether the field can be empty
        """
        action = f"attach_field({field_id}, {project_id})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/projects/{project_id}/customFields',
                json={
                    'field': {'id': field_id},
                    'canBeEmpty': can_be_empty
                },
                params={'fields': 'id,field(id,name)'}
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Attached field {field_id} to project {project_id}")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to attach field to project: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    # =========================================================================
    # PLAN EXECUTION
    # =========================================================================
    
    def execute_plan(self, actions: list[tuple]) -> list[ActionResult]:
        """
        Execute a list of actions from Prolog plan.
        
        Args:
            actions: List of action tuples from Prolog, e.g.:
                     [('create_bundle', 'PriorityBundle', 'enum'),
                      ('create_field', 'Priority', 'enum', 'bundle-id'),
                      ('attach_field', 'field-id', 'DEMO')]
        
        Returns:
            List of ActionResult for each action
        """
        results = []
        
        for action in actions:
            action_type = action[0]
            args = action[1:]
            
            if action_type == 'create_bundle':
                result = self.create_bundle(*args)
            elif action_type == 'create_state_bundle':
                result = self.create_bundle(args[0], bundle_type='state')
            elif action_type == 'ensure_bundle':
                # ensure_bundle is idempotent - check if exists, create if not
                result = self.create_bundle(args[0])
            elif action_type == 'add_bundle_value':
                result = self.add_bundle_value(*args)
            elif action_type == 'add_state_value':
                result = self.add_state_value(*args)
            elif action_type == 'create_field':
                result = self.create_field(*args)
            elif action_type == 'attach_field':
                result = self.attach_field_to_project(*args)
            elif action_type == 'create_project':
                result = self.create_project(*args)
            else:
                logger.warning(f"Unknown action type: {action_type}")
                result = ActionResult(
                    action=str(action),
                    success=False,
                    error=f"Unknown action type: {action_type}"
                )
            
            results.append(result)
            
            # Stop on first failure (atomic execution)
            if not result.success and not self.dry_run:
                logger.error(f"Stopping plan execution due to failure: {result.error}")
                break
        
        return results
