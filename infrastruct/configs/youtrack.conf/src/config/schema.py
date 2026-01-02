"""
Pydantic schema for YouTrack project configuration.

This allows users to define their YouTrack configuration in YAML
instead of raw Prolog facts.
"""
from typing import Optional, Literal, Union
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
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete/detach this field"
    )
    default_value: Optional[str] = Field(
        default=None,
        description="Default value name (must verify if type supports defaults)"
    )


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
        """Ensure either script or script_file is provided, not both (unless deleting)."""
        if self.state == 'absent':
            return self  # No validation needed for deletion
        if self.script and self.script_file:
            raise ValueError("Provide either 'script' or 'script_file', not both")
        if not self.script and not self.script_file:
            raise ValueError("Either 'script' or 'script_file' is required")
        return self
    
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete this rule"
    )


class WorkflowConfig(BaseModel):
    """Configuration for a workflow (collection of rules)."""
    name: str = Field(description="Workflow internal name")
    title: Optional[str] = Field(default=None, description="Human-readable title")
    attached: bool = Field(default=True, description="Whether to attach to the project")
    rules: list[WorkflowRuleConfig] = Field(default_factory=list)
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete this workflow and all its rules"
    )


class SprintSettings(BaseModel):
    """Sprint settings for an Agile Board."""
    enabled: bool = Field(default=False, description="Enable sprints (False = show all issues)")


class AgileBoardConfig(BaseModel):
    """Configuration for an Agile Board."""
    name: str = Field(description="Board name")
    projects: list[str] = Field(default_factory=list, description="Project shortNames to include")
    column_field: str = Field(default="State", description="Custom field to use for columns")
    
    # Sprint settings
    sprints: SprintSettings = Field(
        default_factory=lambda: SprintSettings(enabled=False),
        description="Sprint configuration"
    )
    
    # Visibility - list of group names
    visible_to: list[str] = Field(
        default_factory=lambda: ["All Users"],
        description="Group names that can view the board"
    )
    
    # Columns - list of column names or detailed config with WIP limits
    columns: list[Union[str, 'ColumnConfig']] = Field(
        default_factory=list,
        description="Column names or column configs with WIP limits"
    )
    
    # Swimlane field
    swimlane_field: Optional[str] = Field(
        default=None,
        description="Custom field to use for swimlanes (e.g., 'Subsystem')"
    )
    
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete this board"
    )
    
    color_coding: Optional['ColorCodingConfig'] = Field(
        default=None,
        description="Configuration for card color coding"
    )
    
    # Estimation fields for burndown charts
    estimation_field: Optional[str] = Field(
        default=None,
        description="Custom field used for estimation (e.g., 'Story Points')"
    )
    original_estimation_field: Optional[str] = Field(
        default=None,
        description="Custom field for original estimation"
    )
    
    # Orphan swimlane settings
    orphans_at_top: bool = Field(
        default=True,
        description="Place orphan swimlane at the top of the board"
    )
    hide_orphans_swimlane: bool = Field(
        default=False,
        description="Hide the orphans swimlane from the board"
    )


class ColumnConfig(BaseModel):
    """Configuration for a board column with WIP limits."""
    name: str = Field(description="Column name (must match a field value)")
    min_wip: Optional[int] = Field(default=None, description="Minimum cards in column")
    max_wip: Optional[int] = Field(default=None, description="Maximum cards in column")


class ColorCodingConfig(BaseModel):
    """Configuration for card color coding on the board."""
    mode: Literal['field', 'project'] = Field(description="Coloring mode: 'field' or 'project'")
    field: Optional[str] = Field(default=None, description="Name of custom field if mode is 'field'")



class ProjectConfig(BaseModel):
    """Configuration for a YouTrack project."""
    name: str = Field(description="Full project name")
    short_name: str = Field(alias="shortName", description="Short name for issue IDs (e.g., 'DEMO')")
    leader: Optional[str] = Field(default=None, description="Leader username or ID")
    fields: list[FieldConfig] = Field(default_factory=list)
    workflows: list[WorkflowConfig] = Field(default_factory=list)
    boards: list[AgileBoardConfig] = Field(default_factory=list, description="Agile boards for this project")
    
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
