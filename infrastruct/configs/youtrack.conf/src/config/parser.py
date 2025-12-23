"""
YAML config parser for YouTrack IaC.

Loads configuration from YAML files in obsidian-rules/ directory.
"""
from pathlib import Path
from typing import Union

import yaml

from .schema import ProjectConfig, YouTrackConfig, FieldConfig, BundleValueConfig


def load_config(path: Union[str, Path]) -> YouTrackConfig:
    """
    Load a single YAML config file.
    
    Args:
        path: Path to YAML file
        
    Returns:
        Parsed YouTrackConfig
    """
    path = Path(path)
    
    with open(path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    
    # Handle single project format (no 'projects' key)
    if 'project' in data:
        # Single project shorthand
        project_data = data['project']
        if 'fields' in data:
            project_data['fields'] = data['fields']
        return YouTrackConfig(
            projects=[ProjectConfig(**project_data)],
            bundles=data.get('bundles')
        )
    
    return YouTrackConfig(**data)


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
        configs.append(load_config(path))
    
    for path in directory.glob('*.yml'):
        configs.append(load_config(path))
    
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
    
    for config in configs:
        all_projects.extend(config.projects)
        if config.bundles:
            all_bundles.update(config.bundles)
    
    return YouTrackConfig(
        projects=all_projects,
        bundles=all_bundles if all_bundles else None
    )


def load_config_string(yaml_content: str) -> YouTrackConfig:
    """
    Load config from a YAML string.
    
    Args:
        yaml_content: Raw YAML string
        
    Returns:
        Parsed YouTrackConfig
    """
    data = yaml.safe_load(yaml_content)
    
    # Handle single project format (no 'projects' key)
    if 'project' in data:
        # Single project shorthand
        project_data = data['project']
        if 'fields' in data:
            project_data['fields'] = data['fields']
        return YouTrackConfig(
            projects=[ProjectConfig(**project_data)],
            bundles=data.get('bundles')
        )
            
    return YouTrackConfig(**data)
