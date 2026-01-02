"""
Translator from YAML config to Prolog facts.

Converts the Pydantic config models to Prolog facts that can be
asserted into the inference engine.
"""
from typing import Iterator

from .schema import (
    YouTrackConfig, ProjectConfig, FieldConfig, BundleValueConfig,
    WorkflowConfig, WorkflowRuleConfig
)


def escape_prolog_string(s: str) -> str:
    """Escape a string for use in Prolog."""
    # Must escape backslash first, then quotes
    if s is None:
        return ''
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")


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
    
    # Global workflows
    if config.workflows:
        for workflow in config.workflows:
            yield from _generate_workflow_facts(workflow)
    
    # Projects
    for project in config.projects:
        yield from _generate_project_facts(project)


def _generate_workflow_facts(workflow: WorkflowConfig, project_short_name: str = None) -> Iterator[str]:
    """Generate facts for a workflow."""
    name = escape_prolog_string(workflow.name)
    title = escape_prolog_string(workflow.title or workflow.name)
    attached = 'true' if workflow.attached else 'false'
    
    # Workflow definition (idempotent, title ignored for identity but used for create)
    yield f"target_workflow('{name}', '{title}', {attached})."
    
    # Rules
    for rule in workflow.rules:
        rule_name = escape_prolog_string(rule.name)
        rule_type = escape_prolog_string(rule.type)
        # Use script content (either inline or loaded from file)
        script = escape_prolog_string(rule.script)
        yield f"target_rule('{name}', '{rule_name}', '{rule_type}', '{script}')."
    
    # Attachment info is implicitly handled by `target_workflow(... true)` context,
    # but we need to link it to the project if specific.
    # Actually, attached=true in global workflow means ??? usually global workflows are just definitions.
    # Attached=true in PROJECT workflow means attached to THAT project.
    
    # Correction: The Prolog schema target_workflow has 3 args: Name, Title, Attached.
    # But attachment is a relationship between Workflow and Project.
    # So `target_workflow` just defines existence.
    # We probably need `target_workflow_attachment(WfName, Project)`.
    # Let's check core.pl:
    # missing_attachment(WorkflowName, ProjectShortName) :- target_workflow(WorkflowName, _, true), target_project(ProjectShortName, _).
    # Ah, the logic in core.pl assumes if `target_workflow(..., true)` exists AND `target_project` exists, it attaches?
    # That might be ambiguous if multiple projects exist.
    
    # Let's refine the translator logic for project-scoped workflows vs global.
    # If project_short_name is provided, we treat it as an attachment request.
    
    # Wait, my core.pl `missing_attachment` logic was:
    # missing_attachment(WorkflowName, ProjectShortName) :-
    #    target_workflow(WorkflowName, _, true),
    #    target_project(ProjectShortName, _), ...
    
    # This implies that `target_workflow` acts somewhat globally in Prolog.
    # But if I have Project A with Workflow X, and Project B with Workflow Y.
    # I yield `target_workflow('X', ...)` and `target_project('A', ...)`
    # And `target_workflow('Y', ...)` and `target_project('B', ...)`.
    # The rule `target_workflow(Name, _, true)` combined with `target_project(ShortName)` 
    # would perform cross product! That's a BUG in my core.pl logic logic for attachments.
    
    # FIX: We need explicit attachment facts.
    # Let's add `target_workflow_attachment(WfName, ProjectShortName)` to this fact generator
    # And I will need to update core.pl to use it.
    
    if project_short_name and workflow.attached:
        yield f"target_workflow_attachment('{name}', '{escape_prolog_string(project_short_name)}')."


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

    # Workflows
    if project.workflows:
        for wf in project.workflows:
            yield from _generate_workflow_facts(wf, project_short_name=short_name)


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
