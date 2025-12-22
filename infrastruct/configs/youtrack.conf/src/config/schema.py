"""
Pydantic schema for YouTrack project configuration.

This allows users to define their YouTrack configuration in YAML
instead of raw Prolog facts.
"""
from typing import Optional
from pydantic import BaseModel, Field


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


class ProjectConfig(BaseModel):
    """Configuration for a YouTrack project."""
    name: str = Field(description="Full project name")
    short_name: str = Field(alias="shortName", description="Short name for issue IDs (e.g., 'DEMO')")
    leader: Optional[str] = Field(default=None, description="Leader username or ID")
    fields: list[FieldConfig] = Field(default_factory=list)
    
    model_config = {"populate_by_name": True}  # Allow both short_name and shortName


class YouTrackConfig(BaseModel):
    """Root configuration containing multiple projects."""
    projects: list[ProjectConfig] = Field(default_factory=list)
    
    # Global bundles that can be shared across projects
    bundles: Optional[dict[str, list[str | BundleValueConfig]]] = Field(
        default=None,
        description="Global bundle definitions: bundle_name -> values"
    )
