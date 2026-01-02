"""
YouTrack Workflow API Client
Manages workflows (apps) via the reverse-engineered internal API.
"""
import logging
from dataclasses import dataclass
from typing import Optional

import requests

logger = logging.getLogger(__name__)


@dataclass
class WorkflowResult:
    """Result of a workflow operation."""
    action: str
    success: bool
    workflow_id: Optional[str] = None
    rule_id: Optional[str] = None
    usage_id: Optional[str] = None
    error: Optional[str] = None


class WorkflowClient:
    """
    Client for YouTrack Workflow API.
    
    Based on reverse-engineered endpoints from YouTrack 2025.3:
    - POST /api/admin/apps - Create workflow
    - POST /api/admin/workflows/{id}/rules - Create rule
    - PUT /api/admin/apps/{id}/usages - Attach to project
    - DELETE endpoints for cleanup
    """
    
    # Rule type mapping: friendly name -> API type
    RULE_TYPES = {
        'on-change': 'StatelessRule',
        'on-schedule': 'ScheduledRule', 
        'state-machine': 'StateMachine',
        'action': 'StatelessActionRule',
        'custom': 'CustomRule',
    }
    
    def __init__(self, url: str, token: str, dry_run: bool = False):
        """
        Initialize workflow client.
        
        Args:
            url: YouTrack base URL (e.g., http://youtrack.example.com)
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
        # Cache for workflow IDs: name -> id
        self._workflow_cache = {}
    
    # =========================================================================
    # WORKFLOW CRUD
    # =========================================================================
    
    def create_workflow(self, name: str, title: Optional[str] = None) -> WorkflowResult:
        """
        Create a new empty workflow container.
        
        Args:
            name: Workflow internal name (lowercase, no spaces recommended)
            title: Human-readable title (defaults to name)
        
        Returns:
            WorkflowResult with workflow_id on success
        """
        title = title or name
        action = f"create_workflow({name})"
        
        if self.dry_run:
            logger.info(f"[DRY-RUN] {action}")
            return WorkflowResult(action=action, success=True, 
                                  workflow_id=f"dry-run-wf-{name}")
        
        try:
            payload = {
                "title": title,
                "name": name,
                "model": None
            }
            resp = self.session.post(
                f'{self.url}/api/admin/apps',
                params={'fields': 'id'},
                json=payload
            )
            resp.raise_for_status()
            data = resp.json()
            workflow_id = data.get('id')
            
            # Cache the ID
            self._workflow_cache[name] = workflow_id
            
            logger.info(f"Created workflow '{name}' with ID: {workflow_id}")
            return WorkflowResult(action=action, success=True, workflow_id=workflow_id)
            
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to create workflow: {error}")
            return WorkflowResult(action=action, success=False, error=error)
        except Exception as e:
            logger.error(f"Failed to create workflow: {e}")
            return WorkflowResult(action=action, success=False, error=str(e))
    
    def create_rule(self, workflow_id: str, rule_type: str, name: str, 
                    script: str, title: Optional[str] = None) -> WorkflowResult:
        """
        Add a rule to a workflow.
        
        Args:
            workflow_id: ID of the workflow (e.g., "144-67")
            rule_type: One of 'on-change', 'on-schedule', 'state-machine', 'action', 'custom'
            name: Rule internal name
            script: JavaScript code for the rule
            title: Human-readable title (extracted from script if not provided)
        
        Returns:
            WorkflowResult with rule_id on success
        """
        api_type = self.RULE_TYPES.get(rule_type, rule_type)
        action = f"create_rule({workflow_id}, {rule_type}, {name})"
        
        if self.dry_run:
            logger.info(f"[DRY-RUN] {action}")
            return WorkflowResult(action=action, success=True, 
                                  rule_id=f"dry-run-rule-{name}")
        
        try:
            payload = {
                "type": api_type,
                "name": name,
                "script": script
            }
            
            resp = self.session.post(
                f'{self.url}/api/admin/workflows/{workflow_id}/rules',
                params={
                    '$top': '-1',
                    'fields': 'id,name,title,type,script'
                },
                json=payload
            )
            resp.raise_for_status()
            data = resp.json()
            rule_id = data.get('id')
            
            logger.info(f"Created rule '{name}' (type={rule_type}) with ID: {rule_id}")
            return WorkflowResult(action=action, success=True, rule_id=rule_id)
            
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to create rule: {error}")
            return WorkflowResult(action=action, success=False, error=error)
        except Exception as e:
            logger.error(f"Failed to create rule: {e}")
            return WorkflowResult(action=action, success=False, error=str(e))
    
    def update_rule(self, workflow_id: str, rule_id: str, 
                    script: str) -> WorkflowResult:
        """
        Update an existing rule's script.
        
        Args:
            workflow_id: Workflow ID containing the rule
            rule_id: ID of the rule to update
            script: New JavaScript code
        
        Returns:
            WorkflowResult on success
        """
        action = f"update_rule({workflow_id}, {rule_id})"
        
        if self.dry_run:
            logger.info(f"[DRY-RUN] {action}")
            return WorkflowResult(action=action, success=True, rule_id=rule_id)
        
        try:
            payload = {
                "id": rule_id,
                "script": script
            }
            
            resp = self.session.post(
                f'{self.url}/api/admin/workflows/{workflow_id}/rules/{rule_id}',
                params={'$top': '-1', 'fields': 'id,name,script'},
                json=payload
            )
            resp.raise_for_status()
            
            logger.info(f"Updated rule {rule_id}")
            return WorkflowResult(action=action, success=True, rule_id=rule_id)
            
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to update rule: {error}")
            return WorkflowResult(action=action, success=False, error=error)
        except Exception as e:
            logger.error(f"Failed to update rule: {e}")
            return WorkflowResult(action=action, success=False, error=str(e))
    
    def delete_rule(self, workflow_id: str, rule_id: str) -> WorkflowResult:
        """Delete a rule from a workflow."""
        action = f"delete_rule({workflow_id}, {rule_id})"
        
        if self.dry_run:
            logger.info(f"[DRY-RUN] {action}")
            return WorkflowResult(action=action, success=True, rule_id=rule_id)
        
        try:
            resp = self.session.delete(
                f'{self.url}/api/admin/workflows/{workflow_id}/rules/{rule_id}'
            )
            resp.raise_for_status()
            
            logger.info(f"Deleted rule {rule_id} from workflow {workflow_id}")
            return WorkflowResult(action=action, success=True, rule_id=rule_id)
            
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to delete rule: {error}")
            return WorkflowResult(action=action, success=False, error=error)
        except Exception as e:
            logger.error(f"Failed to delete rule: {e}")
            return WorkflowResult(action=action, success=False, error=str(e))
    
    def delete_workflow(self, workflow_id: str) -> WorkflowResult:
        """Delete an entire workflow. WARNING: Destructive operation."""
        action = f"delete_workflow({workflow_id})"
        
        if self.dry_run:
            logger.info(f"[DRY-RUN] {action}")
            return WorkflowResult(action=action, success=True, workflow_id=workflow_id)
        
        try:
            resp = self.session.delete(
                f'{self.url}/api/admin/workflows/{workflow_id}'
            )
            resp.raise_for_status()
            
            logger.info(f"Deleted workflow {workflow_id}")
            return WorkflowResult(action=action, success=True, workflow_id=workflow_id)
            
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to delete workflow: {error}")
            return WorkflowResult(action=action, success=False, error=error)
        except Exception as e:
            logger.error(f"Failed to delete workflow: {e}")
            return WorkflowResult(action=action, success=False, error=str(e))
    
    def update_workflow_manifest(
        self, workflow_id: str, 
        name: Optional[str] = None, 
        title: Optional[str] = None,
        version: Optional[str] = None,
        vendor_name: Optional[str] = None
    ) -> WorkflowResult:
        """
        Update workflow metadata (manifest).
        
        Args:
            workflow_id: Workflow ID to update
            name: New internal name (optional)
            title: New human-readable title (optional)
            version: Version string, e.g., "0.0.2" (optional)
            vendor_name: Vendor/author name (optional)
        
        Returns:
            WorkflowResult on success
        """
        action = f"update_workflow_manifest({workflow_id})"
        
        if self.dry_run:
            logger.info(f"[DRY-RUN] {action}")
            return WorkflowResult(action=action, success=True, workflow_id=workflow_id)
        
        # Build manifest JSON content
        manifest = {}
        if name:
            manifest['name'] = name
        if title:
            manifest['title'] = title
        if version:
            manifest['version'] = version
        if vendor_name:
            manifest['vendor'] = {'name': vendor_name}
        
        if not manifest:
            logger.warning(f"update_workflow_manifest called with no changes")
            return WorkflowResult(action=action, success=True, workflow_id=workflow_id)
        
        # Encode manifest as JSON string for manifestFile.content
        import json
        manifest_content = json.dumps(manifest, indent=2)
        
        try:
            resp = self.session.post(
                f'{self.url}/api/admin/workflows/{workflow_id}',
                json={
                    'id': workflow_id,
                    'manifestFile': {'content': manifest_content}
                },
                params={'fields': 'id,name,title'}
            )
            resp.raise_for_status()
            data = resp.json()
            
            logger.info(f"Updated workflow manifest for {workflow_id}")
            return WorkflowResult(action=action, success=True, workflow_id=data.get('id'))
            
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to update workflow manifest: {error}")
            return WorkflowResult(action=action, success=False, error=error)
        except Exception as e:
            logger.error(f"Failed to update workflow manifest: {e}")
            return WorkflowResult(action=action, success=False, error=str(e))
    
    # =========================================================================
    # PROJECT ATTACHMENT
    # =========================================================================
    
    def attach_to_project(self, workflow_id: str, project_id: str) -> WorkflowResult:
        """
        Attach a workflow to a project.
        
        Args:
            workflow_id: Workflow/App ID (e.g., "144-67")
            project_id: Project ID (e.g., "0-0" for default project)
        
        Returns:
            WorkflowResult with usage_id on success
        """
        action = f"attach_workflow({workflow_id}, project={project_id})"
        
        if self.dry_run:
            logger.info(f"[DRY-RUN] {action}")
            return WorkflowResult(action=action, success=True, 
                                  usage_id=f"dry-run-usage-{workflow_id}")
        
        try:
            payload = [{"project": {"id": project_id}}]
            
            resp = self.session.put(
                f'{self.url}/api/admin/apps/{workflow_id}/usages',
                params={'fields': 'id,enabled,project(id,name)'},
                json=payload
            )
            resp.raise_for_status()
            data = resp.json()
            
            # Response is a list of usages
            usage_id = data[0].get('id') if data else None
            
            logger.info(f"Attached workflow {workflow_id} to project {project_id}")
            return WorkflowResult(action=action, success=True, usage_id=usage_id)
            
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to attach workflow: {error}")
            return WorkflowResult(action=action, success=False, error=error)
        except Exception as e:
            logger.error(f"Failed to attach workflow: {e}")
            return WorkflowResult(action=action, success=False, error=str(e))
    
    def detach_from_project(self, project_id: str, usage_id: str) -> WorkflowResult:
        """
        Detach a workflow from a project.
        
        Args:
            project_id: Project ID
            usage_id: Usage ID (from attach response or list)
        
        Returns:
            WorkflowResult on success
        """
        action = f"detach_workflow(project={project_id}, usage={usage_id})"
        
        if self.dry_run:
            logger.info(f"[DRY-RUN] {action}")
            return WorkflowResult(action=action, success=True, usage_id=usage_id)
        
        try:
            resp = self.session.delete(
                f'{self.url}/api/admin/projects/{project_id}/pluggableObjectUsages/{usage_id}'
            )
            resp.raise_for_status()
            
            logger.info(f"Detached workflow (usage {usage_id}) from project {project_id}")
            return WorkflowResult(action=action, success=True, usage_id=usage_id)
            
        except requests.HTTPError as e:
            error = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to detach workflow: {error}")
            return WorkflowResult(action=action, success=False, error=error)
        except Exception as e:
            logger.error(f"Failed to detach workflow: {e}")
            return WorkflowResult(action=action, success=False, error=str(e))
    
    # =========================================================================
    # QUERY OPERATIONS
    # =========================================================================
    
    def list_workflows(self) -> list[dict]:
        """List all workflows."""
        if self.dry_run:
            return []
        
        try:
            resp = self.session.get(
                f'{self.url}/api/admin/workflows',
                params={
                    '$top': '-1',
                    'fields': 'id,name,title,rules(id,name,type,script)',
                    'query': 'language:JS,visual,mps'
                }
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to list workflows: {e}")
            return []
    
    def get_workflow(self, workflow_id: str) -> Optional[dict]:
        """Get workflow details including rules."""
        if self.dry_run:
            return None
        
        try:
            resp = self.session.get(
                f'{self.url}/api/admin/workflows/{workflow_id}',
                params={
                    '$top': '-1',
                    'fields': 'id,name,title,rules(id,name,script,type),usages(id,project(id,name))'
                }
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to get workflow: {e}")
            return None
    
    def resolve_workflow_id(self, name_or_id: str) -> Optional[str]:
        """Resolve a workflow name to its ID."""
        # Check cache
        if name_or_id in self._workflow_cache:
            return self._workflow_cache[name_or_id]
        
        # If it looks like an ID, return as-is
        if '-' in name_or_id and name_or_id.split('-')[0].isdigit():
            return name_or_id
        
        # Search by name
        workflows = self.list_workflows()
        for wf in workflows:
            if wf.get('name') == name_or_id or wf.get('title') == name_or_id:
                self._workflow_cache[name_or_id] = wf['id']
                return wf['id']
        
        return None
