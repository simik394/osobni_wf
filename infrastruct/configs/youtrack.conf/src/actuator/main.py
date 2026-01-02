"""
Logic-Driven IaC Actuator
Actuation layer that applies planned changes to YouTrack via REST API.
"""
import logging
from dataclasses import dataclass
from typing import Optional

import requests

from .workflow import WorkflowClient

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
        # Cache for bundle IDs: name -> id
        self._bundle_cache = {}
        
        # Initialize workflow client
        self.workflow = WorkflowClient(url, token, dry_run)

    def _resolve_bundle_id(self, name_or_id: str, bundle_type: str = 'enum') -> str:
        """
        Resolve a bundle name to an ID. 
        If it looks like an ID, return it. If it's in cache, return cached ID.
        Otherwise, try to find it in YouTrack (unless dry_run).
        """
        if not name_or_id:
            return name_or_id
            
        # Check cache
        if name_or_id in self._bundle_cache:
            return self._bundle_cache[name_or_id]
            
        # If it looks like a UUID (simple heuristic), assume it's an ID
        if len(name_or_id) > 30 and '-' in name_or_id:
            return name_or_id
            
        if self.dry_run:
            return f"dry-run-id-for-{name_or_id}"
            
        # Try to find by name via API
        try:
            resp = self.session.get(
                f'{self.url}/api/admin/customFieldSettings/bundles/{bundle_type}',
                params={'fields': 'id,name', 'query': name_or_id}
            )
            resp.raise_for_status()
            for bundle in resp.json():
                if bundle['name'] == name_or_id:
                    self._bundle_cache[name_or_id] = bundle['id']
                    return bundle['id']
        except Exception as e:
            logger.warning(f"Failed to lookup bundle ID for {name_or_id}: {e}")
            
        # Fallback: return as is, hoping it's an ID
        return name_or_id

    # =========================================================================
    # BUNDLE OPERATIONS
    # =========================================================================
    
    def create_bundle(self, name: str, bundle_type: str = 'enum') -> ActionResult:
        """Create a new bundle."""
        action = f"create_bundle({name}, {bundle_type})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        try:
            # Check if already exists (idempotency)
            # This is "ensure_bundle" logic basically
            existing_id = self._resolve_bundle_id(name, bundle_type)
            if existing_id and existing_id != name and not existing_id.startswith('dry-run'):
                logger.info(f"Bundle {name} already exists (id={existing_id})")
                return ActionResult(action=action, success=True, resource_id=existing_id)

            resp = self.session.post(
                f'{self.url}/api/admin/customFieldSettings/bundles/{bundle_type}',
                json={'name': name}
            )
            resp.raise_for_status()
            data = resp.json()
            bundle_id = data.get('id')
            self._bundle_cache[name] = bundle_id
            logger.info(f"Created bundle: {name} (id={bundle_id})")
            return ActionResult(action=action, success=True, resource_id=bundle_id)
        except requests.HTTPError as e:
            # specific 409 handling if needed
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to create bundle {name}: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    def add_bundle_value(self, bundle_name_or_id: str, value_name: str, 
                         bundle_type: str = 'enum') -> ActionResult:
        """Add a value to an existing bundle."""
        bundle_id = self._resolve_bundle_id(bundle_name_or_id, bundle_type)
        action = f"add_bundle_value({bundle_name_or_id}, {value_name})"
        
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
            logger.info(f"Added value '{value_name}' to bundle {bundle_name_or_id}")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to add value to bundle: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    def add_state_value(self, bundle_name_or_id: str, value_name: str,
                        is_resolved: bool = False) -> ActionResult:
        """Add a state value to a state bundle."""
        bundle_id = self._resolve_bundle_id(bundle_name_or_id, 'state')
        action = f"add_state_value({bundle_name_or_id}, {value_name}, resolved={is_resolved})"
        
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
            logger.info(f"Added state '{value_name}' (resolved={is_resolved}) to bundle {bundle_name_or_id}")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to add state value: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    def update_bundle_value(self, bundle_name_or_id: str, value_id: str,
                            new_name: str, bundle_type: str = 'enum') -> ActionResult:
        """Update (rename) a bundle value."""
        bundle_id = self._resolve_bundle_id(bundle_name_or_id, bundle_type)
        action = f"update_bundle_value({bundle_name_or_id}, {value_id}, {new_name})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/customFieldSettings/bundles/{bundle_type}/{bundle_id}/values/{value_id}',
                json={'name': new_name}
            )
            resp.raise_for_status()
            logger.info(f"Updated value {value_id} to '{new_name}' in bundle {bundle_name_or_id}")
            return ActionResult(action=action, success=True, resource_id=value_id)
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to update bundle value: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    def archive_bundle_value(self, bundle_name_or_id: str, value_id: str,
                             bundle_type: str = 'enum') -> ActionResult:
        """Archive (soft-delete) a bundle value."""
        bundle_id = self._resolve_bundle_id(bundle_name_or_id, bundle_type)
        action = f"archive_bundle_value({bundle_name_or_id}, {value_id})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/customFieldSettings/bundles/{bundle_type}/{bundle_id}/values/{value_id}',
                json={'archived': True}
            )
            resp.raise_for_status()
            logger.info(f"Archived value {value_id} in bundle {bundle_name_or_id}")
            return ActionResult(action=action, success=True, resource_id=value_id)
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to archive bundle value: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    def delete_bundle(self, bundle_name_or_id: str, bundle_type: str = 'enum') -> ActionResult:
        """Delete an entire bundle. WARNING: Destructive operation."""
        bundle_id = self._resolve_bundle_id(bundle_name_or_id, bundle_type)
        action = f"delete_bundle({bundle_name_or_id}, {bundle_type})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        try:
            resp = self.session.delete(
                f'{self.url}/api/admin/customFieldSettings/bundles/{bundle_type}/{bundle_id}'
            )
            resp.raise_for_status()
            # Remove from cache
            if bundle_name_or_id in self._bundle_cache:
                del self._bundle_cache[bundle_name_or_id]
            logger.info(f"Deleted bundle {bundle_name_or_id}")
            return ActionResult(action=action, success=True, resource_id=bundle_id)
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to delete bundle: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    # =========================================================================
    # PROJECT OPERATIONS
    # =========================================================================
    
    def create_project(self, name: str, short_name: str, 
                       leader_id: Optional[str] = None) -> ActionResult:
        """Create a new project."""
        action = f"create_project({name}, {short_name})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        payload = {
            'name': name,
            'shortName': short_name,
        }
        if leader_id:
            payload['leader'] = {'id': leader_id}
            
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/projects',
                json=payload,
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
                     bundle_name_or_id: Optional[str] = None) -> ActionResult:
        """Create a new custom field."""
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
        if bundle_name_or_id and field_type in ('enum', 'state'):
            bundle_id = self._resolve_bundle_id(bundle_name_or_id, field_type)
            payload['bundle'] = {'id': bundle_id}
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/customFieldSettings/customFields',
                json=payload,
                params={'fields': 'id,name,fieldType(id,name)'}
            )
            resp.raise_for_status()
            data = resp.json()
            # Cache field ID if needed? Not yet.
            logger.info(f"Created field: {name} (id={data.get('id')})")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to create field {name}: {error}")
            return ActionResult(action=action, success=False, error=error)
    
    # Project Custom Field Type Mapping
    PROJECT_FIELD_TYPE_MAP = {
        'state[1]': 'StateProjectCustomField',
        'enum[1]': 'EnumProjectCustomField',
        'user[1]': 'UserProjectCustomField',
        'version': 'VersionProjectCustomField',
        'build[1]': 'BuildProjectCustomField',
        'ownedField[1]': 'OwnedProjectCustomField',
        'period': 'PeriodProjectCustomField', 
        'date': 'SimpleProjectCustomField',
        'integer': 'SimpleProjectCustomField',
        'string': 'SimpleProjectCustomField',
        'text': 'SimpleProjectCustomField',
        'float': 'SimpleProjectCustomField',
        'group[1]': 'GroupProjectCustomField'
    }

    def attach_field_to_project(self, field_name_or_id: str, project_id: str,
                                can_be_empty: bool = True) -> ActionResult:
        """Attach an existing custom field to a project."""
        
        # Get field info (ID and Type)
        field_id, field_type_id = self._resolve_field_info(field_name_or_id)
        
        action = f"attach_field({field_name_or_id}, {project_id})"
        
        if self.dry_run:
            logger.info(f"[DRY RUN] {action}")
            return ActionResult(action=action, success=True)
        
        # Determine strict ProjectCustomField type
        # Default to generic if unknown, but State/Enum MUST be specific
        project_field_type = self.PROJECT_FIELD_TYPE_MAP.get(field_type_id)
        if not project_field_type:
             # Fallback: some types are just ProjectCustomField or Simple...
             # If it looks like a simple type, try SimpleProjectCustomField
             if field_type_id in ('string', 'text', 'integer', 'float', 'date'):
                 project_field_type = 'SimpleProjectCustomField'
             else:
                 # Generic fallback - might fail for Bundles but works for others?
                 project_field_type = 'ProjectCustomField'

        payload = {
            'field': {'id': field_id},
            'canBeEmpty': can_be_empty
        }
        if project_field_type:
            payload['$type'] = project_field_type
            
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/projects/{project_id}/customFields',
                json=payload,
                params={'fields': 'id,field(id,name)'}
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Attached field {field_name_or_id} to project {project_id}")
            return ActionResult(action=action, success=True, resource_id=data.get('id'))
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to attach field to project: {error}")
            return ActionResult(action=action, success=False, error=error)
            
    def _resolve_field_info(self, name_or_id: str) -> tuple[str, str]:
        """
        Resolve a field name to its (ID, fieldTypeId).
        Returns (id, type_id).
        """
        if not name_or_id:
             return name_or_id, None

        # Check if it looks like an ID
        if len(name_or_id) > 20 and '-' in name_or_id:
             # If it is an ID, we still ideally need the type.
             # In dry-run we might strip it, but for reliability let's fetch it if not dry-run
             if not self.dry_run:
                 try:
                     resp = self.session.get(
                         f'{self.url}/api/admin/customFieldSettings/customFields/{name_or_id}',
                         params={'fields': 'id,fieldType(id)'}
                     )
                     if resp.status_code == 200:
                         data = resp.json()
                         return data['id'], data['fieldType']['id']
                 except: pass # Fallback
             return name_or_id, None
        
        if self.dry_run:
            return f"dry-run-field-id-for-{name_or_id}", "string"
        
        # Look up by name
        try:
            resp = self.session.get(
                f'{self.url}/api/admin/customFieldSettings/customFields',
                params={'fields': 'id,name,fieldType(id)', 'query': name_or_id}
            )
            resp.raise_for_status()
            for f in resp.json():
                if f['name'] == name_or_id:
                    return f['id'], f['fieldType']['id']
        except Exception as e:
            logger.warning(f"Failed to lookup field info for {name_or_id}: {e}")
        
        # Fallback
        return name_or_id, None

    def _resolve_field_id(self, name_or_id: str) -> str:
        """Resolve just the ID (helper wrapper)."""
        fid, _ = self._resolve_field_info(name_or_id)
        return fid

    
    # =========================================================================
    # PLAN EXECUTION
    # =========================================================================
    
    def execute_plan(self, actions: list[tuple]) -> list[ActionResult]:
        """Execute a list of actions from Prolog plan."""
        results = []
        
        for action in actions:
            action_type = action[0]
            args = list(action[1:])  # Convert to list to modify if needed
            
            # Map Prolog args to Python method args
            if action_type == 'create_bundle':
                result = self.create_bundle(*args)
            elif action_type == 'create_state_bundle':
                # Prolog: create_state_bundle(Name) -> create_bundle(Name, 'state')
                result = self.create_bundle(args[0], bundle_type='state')
            elif action_type == 'ensure_bundle':
                # ensure_bundle(Name, Type)
                name = args[0]
                btype = args[1] if len(args) > 1 else 'enum'
                result = self.create_bundle(name, bundle_type=btype)
            elif action_type == 'add_bundle_value':
                # add_bundle_value(BundleName, Value, Type)
                # Prolog passes Type as 3rd arg, Actuator takes (Name, Value, Type)
                result = self.add_bundle_value(args[0], args[1], bundle_type=args[2])
            elif action_type == 'add_state_value':
                # add_state_value(BundleName, Value, IsResolved)
                # Convert 'true'/'false' string to boolean
                is_resolved = str(args[2]).lower() == 'true'
                result = self.add_state_value(args[0], args[1], is_resolved=is_resolved)
            elif action_type == 'create_field':
                # create_field(Name, Type, BundleName) or (Name, Type)
                result = self.create_field(*args)
            elif action_type == 'attach_field':
                result = self.attach_field_to_project(*args)
            elif action_type == 'create_project':
                result = self.create_project(*args)
            # Update operations
            elif action_type == 'update_bundle_value':
                # update_bundle_value(BundleName, ValueId, NewName, Type)
                result = self.update_bundle_value(args[0], args[1], args[2], 
                                                  bundle_type=args[3] if len(args) > 3 else 'enum')
            elif action_type == 'archive_bundle_value':
                # archive_bundle_value(BundleName, ValueId, Type)
                result = self.archive_bundle_value(args[0], args[1],
                                                   bundle_type=args[2] if len(args) > 2 else 'enum')
            elif action_type == 'update_field':
                # update_field(FieldId, NewName, NewBundleId)
                result = self.update_field(args[0], 
                                          new_name=args[1] if len(args) > 1 else None,
                                          new_bundle_id=args[2] if len(args) > 2 else None)
            # Delete operations
            elif action_type == 'delete_bundle':
                # delete_bundle(BundleName, Type)
                result = self.delete_bundle(args[0], bundle_type=args[1] if len(args) > 1 else 'enum')
            elif action_type == 'delete_field':
                # delete_field(FieldId)
                result = self.delete_field(args[0])
            elif action_type == 'detach_field':
                # detach_field(FieldName, ProjectId)
                result = self.detach_field_from_project(args[0], args[1])
            # Workflow operations
            elif action_type == 'create_workflow':
                # create_workflow(Name, Title)
                wf_result = self.workflow.create_workflow(
                    args[0], 
                    title=args[1] if len(args) > 1 else None
                )
                result = ActionResult(
                    action=wf_result.action,
                    success=wf_result.success,
                    resource_id=wf_result.workflow_id,
                    error=wf_result.error
                )
            elif action_type == 'create_rule':
                # create_rule(WorkflowId, RuleType, Name, Script)
                wf_result = self.workflow.create_rule(
                    args[0], args[1], args[2], args[3]
                )
                result = ActionResult(
                    action=wf_result.action,
                    success=wf_result.success,
                    resource_id=wf_result.rule_id,
                    error=wf_result.error
                )
            elif action_type == 'update_rule':
                # update_rule(WorkflowId, RuleId, Script)
                wf_result = self.workflow.update_rule(args[0], args[1], args[2])
                result = ActionResult(
                    action=wf_result.action,
                    success=wf_result.success,
                    resource_id=wf_result.rule_id,
                    error=wf_result.error
                )
            elif action_type == 'delete_rule':
                # delete_rule(WorkflowId, RuleId)
                wf_result = self.workflow.delete_rule(args[0], args[1])
                result = ActionResult(
                    action=wf_result.action,
                    success=wf_result.success,
                    resource_id=wf_result.rule_id,
                    error=wf_result.error
                )
            elif action_type == 'delete_workflow':
                # delete_workflow(WorkflowId)
                wf_result = self.workflow.delete_workflow(args[0])
                result = ActionResult(
                    action=wf_result.action,
                    success=wf_result.success,
                    resource_id=wf_result.workflow_id,
                    error=wf_result.error
                )
            elif action_type == 'attach_workflow':
                # attach_workflow(WorkflowId, ProjectId)
                wf_result = self.workflow.attach_to_project(args[0], args[1])
                result = ActionResult(
                    action=wf_result.action,
                    success=wf_result.success,
                    resource_id=wf_result.usage_id,
                    error=wf_result.error
                )
            elif action_type == 'detach_workflow':
                # detach_workflow(ProjectId, UsageId)
                wf_result = self.workflow.detach_from_project(args[0], args[1])
                result = ActionResult(
                    action=wf_result.action,
                    success=wf_result.success,
                    resource_id=wf_result.usage_id,
                    error=wf_result.error
                )
            else:
                logger.warning(f"Unknown action type: {action_type}")
                result = ActionResult(
                    action=str(action),
                    success=False,
                    error=f"Unknown action type: {action_type}"
                )
            
            results.append(result)
            
            if not result.success and not self.dry_run:
                logger.error(f"Stopping plan execution due to failure: {result.error}")
                break
        
        return results

