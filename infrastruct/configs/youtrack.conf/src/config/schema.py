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


class TagConfig(BaseModel):
    """Configuration for a global tag."""
    name: str = Field(description="Tag name")
    color: Optional[str] = Field(
        default=None,
        description="Tag color (hex code like '#ff0000')"
    )
    untag_on_resolve: bool = Field(
        default=False,
        description="Automatically remove tag when issue is resolved"
    )
    visible_to: Optional[str] = Field(
        default=None,
        description="Group name that can see this tag (None = owner only)"
    )
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete this tag"
    )


class SavedQueryConfig(BaseModel):
    """Configuration for a saved search."""
    name: str = Field(description="Saved search name")
    query: str = Field(description="YouTrack search query")
    visible_to: Optional[str] = Field(
        default=None,
        description="Group name that can see this search (None = owner only)"
    )
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete this saved search"
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
    
    # Backlog configuration
    backlog_query: Optional[str] = Field(
        default=None,
        description="YouTrack search query for the board backlog (e.g., 'project: DEMO State: Open')"
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




class RoleConfig(BaseModel):
    """Configuration for a custom role."""
    name: str = Field(description="Role name")
    description: Optional[str] = Field(default=None, description="Role description")
    permissions: list[str] = Field(default_factory=list, description="List of permission names")
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete this role"
    )

class UserConfig(BaseModel):
    """Configuration for a YouTrack user."""
    login: str = Field(description="User login (username)")
    full_name: str = Field(alias="fullName", description="User's full name")
    email: str = Field(description="User's email address")
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete/ban this user"
    )

    model_config = {"populate_by_name": True}

class GroupConfig(BaseModel):
    """Configuration for a user group."""
    name: str = Field(description="Group name")
    roles: list[str] = Field(default_factory=list, description="Global roles assigned to this group")
    users: list[str] = Field(default_factory=list, description="List of user logins in this group")
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete this group"
    )

class RoleAssignmentConfig(BaseModel):
    """Configuration for a role assignment in a project."""
    subject: str = Field(description="Login of the user or name of the group")
    type: Literal['user', 'group'] = Field(description="Type of subject: 'user' or 'group'")
    role: str = Field(description="Name of the role to assign")
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to revoke this role assignment"
    )

class GlobalTimeTrackingConfig(BaseModel):
    """Global configuration for YouTrack Time Tracking."""
    first_day_of_week: int = Field(alias="firstDayOfWeek", default=1, description="First day of the week (1=Monday, 7=Sunday)")
    minutes_limit: int = Field(alias="minutesLimit", default=480, description="Daily limit in minutes (e.g. 480 = 8h)")
    days_of_week: list[int] = Field(alias="daysOfWeek", default_factory=lambda: [1, 2, 3, 4, 5], description="Working days of week")

    model_config = {"populate_by_name": True}

class ProjectTimeTrackingConfig(BaseModel):
    """Project-specific time tracking configuration."""
    enabled: bool = Field(default=False, description="Enable time tracking for the project")
    estimation_field: Optional[str] = Field(alias="estimationField", default=None, description="Custom field for estimation")
    work_item_types: list[str] = Field(alias="workItemTypes", default_factory=list, description="Work item types for this project")

    model_config = {"populate_by_name": True}

class IssueLinkTypeConfig(BaseModel):
    """Configuration for custom issue link type."""
    name: str = Field(description="Name of the link type")
    source_to_target: str = Field(alias="sourceToTarget", description="Outward name (e.g. blocks)")
    target_to_source: str = Field(alias="targetToSource", description="Inward name (e.g. is blocked by)")
    directed: bool = Field(default=True, description="Whether the link type is directed")
    aggregation: bool = Field(default=False, description="Whether the link type aggregates values")
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete this link type"
    )

    model_config = {"populate_by_name": True}

class ReportConfig(BaseModel):
    """Configuration for YouTrack Reports."""
    name: str = Field(description="Report name")
    type: Literal['burndown', 'cumulative_flow'] = Field(description="Report type")
    projects: list[str] = Field(default_factory=list, description="Project shortNames to include")
    date_range: str = Field(alias="dateRange", default="last_30_days", description="E.g. last_30_days, current_sprint")
    estimation_field: Optional[str] = Field(alias="estimationField", default=None, description="For burndown reports")
    field: Optional[str] = Field(default=None, description="For cumulative flow reports (e.g., State)")
    state: Literal['present', 'absent'] = Field(
        default='present',
        description="Set to 'absent' to delete this report"
    )

    model_config = {"populate_by_name": True}

class ProjectConfig(BaseModel):
    """Configuration for a YouTrack project."""
    name: str = Field(description="Full project name")
    short_name: str = Field(alias="shortName", description="Short name for issue IDs (e.g., 'DEMO')")
    leader: Optional[str] = Field(default=None, description="Leader username or ID")
    template: Optional[str] = Field(
        default=None, 
        description="Name of a standard template to apply (e.g., 'std-agent-v1')"
    )
    fields: list[FieldConfig] = Field(default_factory=list)
    workflows: list[WorkflowConfig] = Field(default_factory=list)
    boards: list[AgileBoardConfig] = Field(default_factory=list, description="Agile boards for this project")
    role_assignments: list[RoleAssignmentConfig] = Field(default_factory=list, description="Role assignments for this project")
    time_tracking: Optional[ProjectTimeTrackingConfig] = Field(alias="timeTracking", default=None, description="Project-specific time tracking settings")
    reports: list[ReportConfig] = Field(default_factory=list, description="Reports for this project")
    
    model_config = {"populate_by_name": True}  # Allow both short_name and shortName


class YouTrackConfig(BaseModel):
    """Root configuration containing multiple projects."""
    projects: list[ProjectConfig] = Field(default_factory=list)
    
    # Global access management
    users: Optional[list[UserConfig]] = Field(default=None, description="Global user definitions")
    groups: Optional[list[GroupConfig]] = Field(default=None, description="Global group definitions")
    roles: Optional[list[RoleConfig]] = Field(default=None, description="Global role definitions")

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
    
    # Global tags
    tags: Optional[list[TagConfig]] = Field(
        default=None,
        description="Global tag definitions"
    )
    
    # Saved queries (searches)
    saved_queries: Optional[list[SavedQueryConfig]] = Field(
        default=None,
        description="Saved search definitions"
    )

    # Time tracking
    time_tracking: Optional[GlobalTimeTrackingConfig] = Field(alias="timeTracking", default=None, description="Global time tracking settings")

    # Custom issue link types
    issue_link_types: Optional[list[IssueLinkTypeConfig]] = Field(alias="issueLinkTypes", default=None, description="Custom issue link types")

    # Global reports
    reports: Optional[list[ReportConfig]] = Field(default=None, description="Global reports")

    model_config = {"populate_by_name": True}


