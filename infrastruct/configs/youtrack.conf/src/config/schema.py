"""
Pydantic schema for YouTrack project configuration.

This allows users to define their YouTrack configuration in YAML
instead of raw Prolog facts.
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field, model_validator


class BundleValueConfig(BaseModel):
    """Configuration for a bundle value (enum or state)."""
    name: str
    resolved: bool = False  # Only used for state bundles


class FieldConfig(BaseModel):
    """Configuration for a custom field."""
    name: str
    type: str = Field(description="enum, state, string, integer, date, etc.")
    bundle: Optional[str] = Field(default=None, description="Bundle name for enum/state fields")
    values: Optional[list[str | BundleValueConfig]] = Field(
        default=None,
        description="Values for the bundle. Use strings for enum, or BundleValueConfig for states."
    )
    can_be_empty: bool = True


class WorkflowRuleConfig(BaseModel):
    """Configuration for a workflow rule."""
    name: str = Field(description="Rule internal name (lowercase, no spaces)")
    title: Optional[str] = Field(default=None, description="Human-readable title")
    type: Literal['on-change', 'on-schedule', 'state-machine', 'action', 'custom'] = Field(
        default='on-change',
        description="Rule type"
    )
    # Either inline script or file reference
    script: Optional[str] = Field(default=None, description="Inline JavaScript code")
    script_file: Optional[str] = Field(default=None, description="Path to .js file (relative to project dir)")
    
    @model_validator(mode='after')
    def check_script_source(self):
        """Ensure either script or script_file is provided, not both."""
        if self.script and self.script_file:
            raise ValueError("Provide either 'script' or 'script_file', not both")
        if not self.script and not self.script_file:
            raise ValueError("Either 'script' or 'script_file' is required")
        return self


class WorkflowConfig(BaseModel):
    """Configuration for a workflow (collection of rules)."""
    name: str = Field(description="Workflow internal name")
    title: Optional[str] = Field(default=None, description="Human-readable title")
    attached: bool = Field(default=True, description="Whether to attach to the project")
    rules: list[WorkflowRuleConfig] = Field(default_factory=list)


class ProjectConfig(BaseModel):
    """Configuration for a YouTrack project."""
    name: str = Field(description="Full project name")
    short_name: str = Field(alias="shortName", description="Short name for issue IDs (e.g., 'DEMO')")
    leader: Optional[str] = Field(default=None, description="Leader username or ID")
    fields: list[FieldConfig] = Field(default_factory=list)
    workflows: list[WorkflowConfig] = Field(default_factory=list)
    
    model_config = {"populate_by_name": True}  # Allow both short_name and shortName


class YouTrackConfig(BaseModel):
    """Root configuration containing multiple projects."""
    projects: list[ProjectConfig] = Field(default_factory=list)
    
    # Global bundles that can be shared across projects
    bundles: Optional[dict[str, list[str | BundleValueConfig]]] = Field(
        default=None,
        description="Global bundle definitions: bundle_name -> values"
    )
    
    # Global workflows that can be shared across projects
    workflows: Optional[list[WorkflowConfig]] = Field(
        default=None,
        description="Global workflow definitions"
    )
