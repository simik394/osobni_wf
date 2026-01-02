"""
YAML config parser for YouTrack IaC.

Loads configuration from YAML files in obsidian-rules/ directory.
"""
from pathlib import Path
from typing import Union, Optional
import logging

import yaml

from .schema import (
    ProjectConfig, YouTrackConfig, FieldConfig, BundleValueConfig,
    WorkflowConfig, WorkflowRuleConfig
)

logger = logging.getLogger(__name__)


def load_config(path: Union[str, Path], base_path: Optional[Path] = None) -> YouTrackConfig:
    """
    Load a single YAML config file.
    
    Args:
        path: Path to YAML file
        base_path: Base directory for resolving relative script_file paths
        
    Returns:
        Parsed YouTrackConfig with script files loaded
    """
    path = Path(path)
    base_path = base_path or path.parent
    
    with open(path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    
    # Handle single project format (no 'projects' key)
    if 'project' in data:
        # Single project shorthand
        project_data = data['project'].copy()
        if 'fields' in data:
            project_data['fields'] = data['fields']
        if 'workflows' in data:
            project_data['workflows'] = data['workflows']
        if 'boards' in data:
            project_data['boards'] = data['boards']
        
        # Load script files for project workflows
        if 'workflows' in project_data:
            project_data['workflows'] = _resolve_workflow_scripts(
                project_data['workflows'], base_path
            )
        
        return YouTrackConfig(
            projects=[ProjectConfig(**project_data)],
            bundles=data.get('bundles'),
            workflows=_resolve_workflow_scripts(data.get('workflows', []), base_path) or None,
            tags=data.get('tags'),
            saved_queries=data.get('saved_queries')
        )
    
    # Multi-project format
    config_data = data.copy()
    
    # Resolve script files in global workflows
    if config_data.get('workflows'):
        config_data['workflows'] = _resolve_workflow_scripts(
            config_data['workflows'], base_path
        )
    
    # Resolve script files in each project's workflows
    if config_data.get('projects'):
        for project in config_data['projects']:
            if project.get('workflows'):
                project['workflows'] = _resolve_workflow_scripts(
                    project['workflows'], base_path
                )
    
    return YouTrackConfig(**config_data)


def _resolve_workflow_scripts(workflows: list[dict], base_path: Path) -> list[dict]:
    """
    Load external script files for workflows.
    
    Args:
        workflows: List of workflow dicts from YAML
        base_path: Base directory for resolving relative paths
        
    Returns:
        Workflows with script content loaded from files
    """
    if not workflows:
        return workflows
    
    resolved = []
    for wf in workflows:
        wf_copy = wf.copy()
        if 'rules' in wf_copy:
            resolved_rules = []
            for rule in wf_copy['rules']:
                rule_copy = rule.copy()
                
                # Load script from file if script_file is specified
                if 'script_file' in rule_copy and rule_copy['script_file']:
                    script_path = base_path / rule_copy['script_file']
                    if script_path.exists():
                        logger.debug(f"Loading script from {script_path}")
                        rule_copy['script'] = script_path.read_text(encoding='utf-8')
                        del rule_copy['script_file']
                    else:
                        raise FileNotFoundError(
                            f"Script file not found: {script_path}"
                        )
                
                resolved_rules.append(rule_copy)
            wf_copy['rules'] = resolved_rules
        resolved.append(wf_copy)
    
    return resolved


def load_configs_from_dir(directory: Union[str, Path]) -> list[YouTrackConfig]:
    """
    Load all YAML configs from a directory.
    
    Args:
        directory: Path to directory containing .yaml/.yml files
        
    Returns:
        List of parsed YouTrackConfig objects
    """
    directory = Path(directory)
    configs = []
    
    for path in directory.glob('*.yaml'):
        configs.append(load_config(path, base_path=path.parent))
    
    for path in directory.glob('*.yml'):
        configs.append(load_config(path, base_path=path.parent))
    
    return configs


def merge_configs(configs: list[YouTrackConfig]) -> YouTrackConfig:
    """
    Merge multiple configs into one.
    
    Args:
        configs: List of YouTrackConfig objects
        
    Returns:
        Single merged YouTrackConfig
    """
    all_projects = []
    all_bundles = {}
    all_workflows = []
    
    for config in configs:
        all_projects.extend(config.projects)
        if config.bundles:
            all_bundles.update(config.bundles)
        if config.workflows:
            all_workflows.extend(config.workflows)
    
    return YouTrackConfig(
        projects=all_projects,
        bundles=all_bundles if all_bundles else None,
        workflows=all_workflows if all_workflows else None
    )


def load_config_string(yaml_content: str, base_path: Optional[Path] = None) -> YouTrackConfig:
    """
    Load config from a YAML string.
    
    Args:
        yaml_content: Raw YAML string
        base_path: Base directory for resolving relative script_file paths
        
    Returns:
        Parsed YouTrackConfig
    """
    base_path = base_path or Path.cwd()
    data = yaml.safe_load(yaml_content)
    
    # Handle single project format (no 'projects' key)
    if 'project' in data:
        # Single project shorthand
        project_data = data['project'].copy()
        if 'fields' in data:
            project_data['fields'] = data['fields']
        if 'workflows' in data:
            project_data['workflows'] = _resolve_workflow_scripts(
                data['workflows'], base_path
            )
        
        return YouTrackConfig(
            projects=[ProjectConfig(**project_data)],
            bundles=data.get('bundles')
        )
            
    return YouTrackConfig(**data)
