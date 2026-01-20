from typing import List
from .schema import ProjectConfig, FieldConfig, WorkflowConfig, AgileBoardConfig

class TemplateExpander:
    """Expands project templates into full configuration."""

    @staticmethod
    def expand(project: ProjectConfig) -> ProjectConfig:
        if not project.template:
            return project

        if project.template == "std-agent-v1":
            return TemplateExpander._apply_std_agent_v1(project)
        
        # Future templates can be added here
        return project

    @staticmethod
    def _apply_std_agent_v1(project: ProjectConfig) -> ProjectConfig:
        """Applies the Standard Agent V1 template."""
        
        # 1. Mandatory Global Fields
        mandatory_fields = [
            FieldConfig(name="Agent Complexity", type="enum", bundle="ComplexityBundle", 
                       values=["Low", "Medium", "High"], default_value="Medium"),
            FieldConfig(name="Agent Effort", type="period"),
            FieldConfig(name="Agent Tech Stack", type="enum", bundle="TechStackBundle",
                       values=["TypeScript", "Python", "Go", "Prolog", "Ansible"], can_be_empty=True),
            FieldConfig(name="Agent Layer", type="enum", bundle="LayerBundle",
                       values=["Agent", "Infra", "Integration", "Docs"], default_value="Agent"),
            FieldConfig(name="Agent Maturity", type="integer", default_value="0"),
            # Enforce Vision/Goal hierarchy support
            FieldConfig(name="Type", type="enum", bundle="Types",
                       values=["Task", "Bug", "Epic", "Vision", "Goal-LT", "Goal-ST"], default_value="Task"),
        ]

        # Merge fields (preserve project-specific overrides if they exist)
        existing_names = {f.name for f in project.fields}
        for field in mandatory_fields:
            if field.name not in existing_names:
                project.fields.append(field)

        # 2. Standard Workflows
        # (Assuming these are defined globally in the system)
        mandatory_workflows = [
            WorkflowConfig(name="auto-prioritize", attached=True),
            WorkflowConfig(name="stale-warning", attached=True)
        ]
        
        existing_wfs = {w.name for w in project.workflows}
        for wf in mandatory_workflows:
            if wf.name not in existing_wfs:
                project.workflows.append(wf)

        return project
