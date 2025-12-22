"""
Translator from YAML config to Prolog facts.

Converts the Pydantic config models to Prolog facts that can be
asserted into the inference engine.
"""
from typing import Iterator

from .schema import YouTrackConfig, ProjectConfig, FieldConfig, BundleValueConfig


def escape_prolog_string(s: str) -> str:
    """Escape a string for use in Prolog."""
    # Must escape backslash first, then quotes
    return s.replace("\\", "\\\\").replace("'", "\\'")


def config_to_prolog_facts(config: YouTrackConfig) -> str:
    """
    Convert a YouTrackConfig to a string of Prolog facts.
    
    Args:
        config: Parsed YouTrackConfig
        
    Returns:
        String containing Prolog facts, one per line
    """
    facts = list(_generate_facts(config))
    return '\n'.join(facts)


def _generate_facts(config: YouTrackConfig) -> Iterator[str]:
    """Generate Prolog facts from config."""
    
    # Global bundles
    if config.bundles:
        for bundle_name, values in config.bundles.items():
            for value in values:
                if isinstance(value, str):
                    yield f"target_bundle_value('{escape_prolog_string(bundle_name)}', '{escape_prolog_string(value)}')."
                elif isinstance(value, BundleValueConfig):
                    resolved = 'true' if value.resolved else 'false'
                    yield f"target_state_value('{escape_prolog_string(bundle_name)}', '{escape_prolog_string(value.name)}', {resolved})."
    
    # Projects
    for project in config.projects:
        yield from _generate_project_facts(project)


def _generate_project_facts(project: ProjectConfig) -> Iterator[str]:
    """Generate facts for a single project."""
    short_name = escape_prolog_string(project.short_name)
    name = escape_prolog_string(project.name)
    
    # Project definition
    if project.leader:
        leader = escape_prolog_string(project.leader)
        yield f"target_project('{short_name}', '{name}', '{leader}')."
    else:
        yield f"target_project('{short_name}', '{name}')."
    
    # Fields
    for field in project.fields:
        yield from _generate_field_facts(field, short_name)


def _generate_field_facts(field: FieldConfig, project: str) -> Iterator[str]:
    """Generate facts for a custom field."""
    name = escape_prolog_string(field.name)
    field_type = escape_prolog_string(field.type)
    
    # Field definition
    yield f"target_field('{name}', '{field_type}', '{project}')."
    
    # Bundle association
    if field.bundle:
        bundle = escape_prolog_string(field.bundle)
        yield f"field_uses_bundle('{name}', '{bundle}')."
        
        # Bundle values (if defined inline)
        if field.values:
            for value in field.values:
                if isinstance(value, str):
                    yield f"target_bundle_value('{bundle}', '{escape_prolog_string(value)}')."
                elif isinstance(value, BundleValueConfig):
                    resolved = 'true' if value.resolved else 'false'
                    yield f"target_state_value('{bundle}', '{escape_prolog_string(value.name)}', {resolved})."
    
    # Can be empty setting
    if not field.can_be_empty:
        yield f"field_required('{name}', '{project}')."
