import pytest
from src.config.schema import ProjectConfig, FieldConfig, WorkflowConfig
from src.config.templates import TemplateExpander

class TestTemplateExpander:
    def test_expand_std_agent_v1(self):
        """Test that std-agent-v1 adds mandatory fields and workflows."""
        project = ProjectConfig(
            name="Test", shortName="TEST", template="std-agent-v1"
        )
        
        expanded = TemplateExpander.expand(project)
        
        field_names = {f.name for f in expanded.fields}
        assert "Agent Complexity" in field_names
        assert "Agent Effort" in field_names
        assert "Agent Tech Stack" in field_names
        assert "Agent Layer" in field_names
        assert "Agent Maturity" in field_names

        wf_names = {w.name for w in expanded.workflows}
        assert "auto-prioritize" in wf_names
        assert "stale-warning" in wf_names

    def test_no_expansion_without_template(self):
        """Test that projects without template are untouched."""
        project = ProjectConfig(name="Test", shortName="TEST")
        expanded = TemplateExpander.expand(project)
        assert len(expanded.fields) == 0
        assert len(expanded.workflows) == 0

    def test_preserve_overrides(self):
        """Test that project-specific overrides are preserved."""
        # Project defines Agent Complexity with different values
        custom_complexity = FieldConfig(
            name="Agent Complexity", type="enum", values=["Easy", "Hard"]
        )
        project = ProjectConfig(
            name="Test", shortName="TEST", template="std-agent-v1",
            fields=[custom_complexity]
        )
        
        expanded = TemplateExpander.expand(project)
        
        # Should still have global fields
        field_names = {f.name for f in expanded.fields}
        assert "Agent Effort" in field_names
        
        # But Agent Complexity should be the custom one
        complexity = next(f for f in expanded.fields if f.name == "Agent Complexity")
        assert complexity.values == ["Easy", "Hard"] 
