"""
Tests for YAML config module.
"""
import pytest
from pathlib import Path
import tempfile


class TestSchema:
    """Tests for Pydantic schema validation."""
    
    def test_project_config_minimal(self):
        """Test minimal project config."""
        from src.config.schema import ProjectConfig
        
        config = ProjectConfig(name="Test", short_name="TEST")
        assert config.name == "Test"
        assert config.short_name == "TEST"
        assert config.fields == []
    
    def test_project_config_with_alias(self):
        """Test project config with shortName alias."""
        from src.config.schema import ProjectConfig
        
        config = ProjectConfig(**{"name": "Test", "shortName": "TEST"})
        assert config.short_name == "TEST"
    
    def test_field_config_enum(self):
        """Test enum field configuration."""
        from src.config.schema import FieldConfig
        
        config = FieldConfig(
            name="Priority",
            type="enum",
            bundle="PriorityBundle",
            values=["High", "Medium", "Low"]
        )
        assert config.bundle == "PriorityBundle"
        assert len(config.values) == 3
    
    def test_field_config_state_with_resolved(self):
        """Test state field with resolved flag."""
        from src.config.schema import FieldConfig, BundleValueConfig
        
        config = FieldConfig(
            name="State",
            type="state",
            bundle="StateBundle",
            values=[
                BundleValueConfig(name="Open", resolved=False),
                BundleValueConfig(name="Done", resolved=True),
            ]
        )
        assert config.values[1].resolved is True


class TestParser:
    """Tests for YAML parser."""
    
    def test_load_single_project_config(self):
        """Test loading single project format."""
        from src.config.parser import load_config
        
        yaml_content = """
project:
  name: Test Project
  shortName: TEST

fields:
  - name: Priority
    type: enum
    bundle: PriorityBundle
    values: [High, Medium, Low]
"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write(yaml_content)
            f.flush()
            
            config = load_config(f.name)
            
        assert len(config.projects) == 1
        assert config.projects[0].short_name == "TEST"
        assert len(config.projects[0].fields) == 1


class TestTranslator:
    """Tests for YAML to Prolog translator."""
    
    def test_simple_field_translation(self):
        """Test translating a simple field to Prolog facts."""
        from src.config.schema import YouTrackConfig, ProjectConfig, FieldConfig
        from src.config.translator import config_to_prolog_facts
        
        config = YouTrackConfig(
            projects=[
                ProjectConfig(
                    name="Test",
                    short_name="TEST",
                    fields=[
                        FieldConfig(name="Priority", type="enum", bundle="PriorityBundle")
                    ]
                )
            ]
        )
        
        facts = config_to_prolog_facts(config)
        
        assert "target_project('TEST', 'Test')" in facts
        assert "target_field('Priority', 'enum', 'TEST')" in facts
        assert "field_uses_bundle('Priority', 'PriorityBundle')" in facts
    
    def test_state_values_with_resolved(self):
        """Test state values include resolved flag."""
        from src.config.schema import YouTrackConfig, ProjectConfig, FieldConfig, BundleValueConfig
        from src.config.translator import config_to_prolog_facts
        
        config = YouTrackConfig(
            projects=[
                ProjectConfig(
                    name="Test",
                    short_name="TEST",
                    fields=[
                        FieldConfig(
                            name="State",
                            type="state",
                            bundle="StateBundle",
                            values=[
                                BundleValueConfig(name="Done", resolved=True)
                            ]
                        )
                    ]
                )
            ]
        )
        
        facts = config_to_prolog_facts(config)
        
        assert "target_state_value('StateBundle', 'Done', true)" in facts
    
    def test_escape_special_characters(self):
        """Test that special characters are escaped."""
        from src.config.translator import escape_prolog_string
        
        assert escape_prolog_string("O'Brien") == "O\\'Brien"


class TestAgileBoardConfig:
    """Tests for Agile Board configuration."""
    
    def test_agile_board_config_minimal(self):
        """Test minimal agile board config."""
        from src.config.schema import AgileBoardConfig
        
        config = AgileBoardConfig(name="My Board")
        assert config.name == "My Board"
        assert config.column_field == "State"  # Default
        assert config.projects == []
        assert config.state == "present"
    
    def test_agile_board_config_with_projects(self):
        """Test agile board config with project list."""
        from src.config.schema import AgileBoardConfig
        
        config = AgileBoardConfig(
            name="Multi-Project Board",
            projects=["PROJ1", "PROJ2"],
            column_field="Status"
        )
        assert len(config.projects) == 2
        assert config.column_field == "Status"


class TestAgileTranslator:
    """Tests for Agile Board translator."""
    
    def test_agile_board_translation(self):
        """Test translating agile board to Prolog facts."""
        from src.config.schema import YouTrackConfig, ProjectConfig, AgileBoardConfig
        from src.config.translator import config_to_prolog_facts
        
        config = YouTrackConfig(
            projects=[
                ProjectConfig(
                    name="Test",
                    short_name="TEST",
                    boards=[
                        AgileBoardConfig(name="Test Board", column_field="State")
                    ]
                )
            ]
        )
        
        facts = config_to_prolog_facts(config)
        
        assert "target_board('Test Board', 'State', 'TEST')" in facts
        assert "target_board_project('Test Board', 'TEST')" in facts
    
    def test_field_default_translation(self):
        """Test translating field default_value to Prolog facts."""
        from src.config.schema import YouTrackConfig, ProjectConfig, FieldConfig
        from src.config.translator import config_to_prolog_facts
        
        config = YouTrackConfig(
            projects=[
                ProjectConfig(
                    name="Test",
                    short_name="TEST",
                    fields=[
                        FieldConfig(
                            name="Priority",
                            type="enum",
                            bundle="PriorityBundle",
                            default_value="Normal"
                        )
                    ]
                )
            ]
        )
        
        facts = config_to_prolog_facts(config)
        
        assert "target_field_default('Priority', 'Normal', 'TEST')" in facts

