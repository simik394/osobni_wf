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


class TestTagConfig:
    """Tests for Tag configuration."""
    
    def test_tag_config_minimal(self):
        """Test minimal tag config."""
        from src.config.schema import TagConfig
        
        config = TagConfig(name="urgent")
        assert config.name == "urgent"
        assert config.untag_on_resolve is False
        assert config.state == "present"
    
    def test_tag_config_full(self):
        """Test tag config with all options."""
        from src.config.schema import TagConfig
        
        config = TagConfig(
            name="blocked",
            untag_on_resolve=True,
            visible_to="All Users",
            state="present"
        )
        assert config.untag_on_resolve is True
        assert config.visible_to == "All Users"
    
    def test_tag_translation(self):
        """Test translating tags to Prolog facts."""
        from src.config.schema import YouTrackConfig, TagConfig
        from src.config.translator import config_to_prolog_facts
        
        config = YouTrackConfig(
            projects=[],
            tags=[
                TagConfig(name="urgent", untag_on_resolve=True),
                TagConfig(name="blocked", untag_on_resolve=False),
            ]
        )
        
        facts = config_to_prolog_facts(config)
        
        assert "target_tag('urgent', 'null', true, 'null')" in facts
        assert "target_tag('blocked', 'null', false, 'null')" in facts
    
    def test_tag_deletion(self):
        """Test tag marked for deletion."""
        from src.config.schema import YouTrackConfig, TagConfig
        from src.config.translator import config_to_prolog_facts
        
        config = YouTrackConfig(
            projects=[],
            tags=[TagConfig(name="old-tag", state="absent")]
        )
        
        facts = config_to_prolog_facts(config)
        
        assert "target_delete_tag('old-tag')" in facts


class TestSavedQueryConfig:
    """Tests for Saved Query configuration."""
    
    def test_saved_query_minimal(self):
        """Test minimal saved query config."""
        from src.config.schema import SavedQueryConfig
        
        config = SavedQueryConfig(name="My Issues", query="for: me")
        assert config.name == "My Issues"
        assert config.query == "for: me"
        assert config.state == "present"
    
    def test_saved_query_translation(self):
        """Test translating saved queries to Prolog facts."""
        from src.config.schema import YouTrackConfig, SavedQueryConfig
        from src.config.translator import config_to_prolog_facts
        
        config = YouTrackConfig(
            projects=[],
            saved_queries=[
                SavedQueryConfig(name="Open Bugs", query="Type: Bug State: Open"),
            ]
        )
        
        facts = config_to_prolog_facts(config)
        
        assert "target_saved_query('Open Bugs', 'Type: Bug State: Open', 'null')" in facts
    
    def test_saved_query_deletion(self):
        """Test saved query marked for deletion."""
        from src.config.schema import YouTrackConfig, SavedQueryConfig
        from src.config.translator import config_to_prolog_facts
        
        config = YouTrackConfig(
            projects=[],
            saved_queries=[SavedQueryConfig(name="Old Query", query="obsolete", state="absent")]
        )
        
        facts = config_to_prolog_facts(config)
        
        assert "target_delete_saved_query('Old Query')" in facts


def test_user_config():
    from src.config.schema import UserConfig
    user = UserConfig(login="test", fullName="Test User", email="test@example.com")
    assert user.login == "test"
    assert user.full_name == "Test User"
    assert user.email == "test@example.com"
    assert user.state == "present"

def test_group_config():
    from src.config.schema import GroupConfig
    group = GroupConfig(name="admins", users=["test"], roles=["Admin"])
    assert group.name == "admins"
    assert group.users == ["test"]
    assert group.roles == ["Admin"]

def test_role_config():
    from src.config.schema import RoleConfig
    role = RoleConfig(name="Admin", permissions=["Read Issue", "Update Issue"])
    assert role.name == "Admin"
    assert role.permissions == ["Read Issue", "Update Issue"]

def test_time_tracking_config():
    from src.config.schema import YouTrackConfig, ProjectConfig, GlobalTimeTrackingConfig, ProjectTimeTrackingConfig
    from src.config.translator import config_to_prolog_facts

    config = YouTrackConfig(
        projects=[
            ProjectConfig(
                name="Demo Project",
                short_name="DEMO",
                time_tracking=ProjectTimeTrackingConfig(enabled=True, estimation_field="Story Points", work_item_types=["Development", "Testing"])
            )
        ],
        time_tracking=GlobalTimeTrackingConfig(first_day_of_week=1, minutes_limit=480, days_of_week=[1, 2, 3, 4, 5])
    )

    facts = config_to_prolog_facts(config)
    assert "target_global_time_tracking(1, 480, [1, 2, 3, 4, 5])." in facts
    assert "target_project_time_tracking('DEMO', true, 'Story Points')." in facts
    assert "target_project_work_item_type('DEMO', 'Development')." in facts
    assert "target_project_work_item_type('DEMO', 'Testing')." in facts

def test_issue_link_type_config():
    from src.config.schema import YouTrackConfig, IssueLinkTypeConfig
    from src.config.translator import config_to_prolog_facts

    config = YouTrackConfig(
        projects=[],
        issue_link_types=[
            IssueLinkTypeConfig(name="Blocks Release", source_to_target="blocks release", target_to_source="is blocked by release", directed=True, aggregation=False)
        ]
    )

    facts = config_to_prolog_facts(config)
    assert "target_issue_link_type('Blocks Release', 'blocks release', 'is blocked by release', true, false)." in facts

def test_report_config():
    from src.config.schema import YouTrackConfig, ProjectConfig, ReportConfig
    from src.config.translator import config_to_prolog_facts

    config = YouTrackConfig(
        projects=[
            ProjectConfig(
                name="Demo Project",
                short_name="DEMO",
                reports=[
                    ReportConfig(name="Demo Burndown", type="burndown", date_range="current_sprint", estimation_field="Story Points")
                ]
            )
        ],
        reports=[
            ReportConfig(name="Global Flow", type="cumulative_flow", projects=["DEMO"], date_range="last_30_days", field="State")
        ]
    )

    facts = config_to_prolog_facts(config)
    assert "target_report('Demo Burndown', 'burndown', '', 'current_sprint', 'Story Points', 'null', ['DEMO'])." in facts
    assert "target_report('Global Flow', 'cumulative_flow', '', 'last_30_days', 'null', 'State', ['DEMO'])." in facts


def test_lua_config_loading_and_seeding(tmp_path):
    from src.config.parser import load_config
    from src.config.translator import config_to_prolog_facts
    
    # Create a mock Lua config file using programmatic Lua constructs
    lua_content = """
    local function get_welcome_seeds()
      return {
        { summary = "Welcome Issue", description = "Get started here", type = "Task", priority = "Normal" }
      }
    end

    return {
      projects = {
        {
          name = "Lua Generated Project",
          shortName = "LUA",
          seeds = get_welcome_seeds()
        }
      }
    }
    """
    lua_file = tmp_path / "project.lua"
    lua_file.write_text(lua_content, encoding='utf-8')
    
    config = load_config(lua_file)
    assert len(config.projects) == 1
    project = config.projects[0]
    assert project.name == "Lua Generated Project"
    assert project.short_name == "LUA"
    assert len(project.seeds) == 1
    assert project.seeds[0].summary == "Welcome Issue"
    assert project.seeds[0].description == "Get started here"
    
    facts = config_to_prolog_facts(config)
    assert "target_project('LUA', 'Lua Generated Project')." in facts
    assert "target_issue_seed('LUA', 'Welcome Issue', 'Get started here', 'Task', 'Normal')." in facts


class TestVisualIaC:
    """Tests for Visual IaC parsing and semantic Prolog interpretation."""
    
    def test_drawio_xml_parsing(self, tmp_path):
        """Test that the Nim binary drawio2prolog compiles and parses xml correctly."""
        from src.config.parser import parse_drawio_file
        
        xml_content = """<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <object id="proj_node" label="Visual Demo Project" type="project" shortName="VDEMO" leader="jules">
      <mxCell parent="1" vertex="1" style="rounded=1;fillColor=#FFF;"/>
    </object>
    <object id="field_state" label="State" type="field" fieldType="state" defaultValue="Open">
      <mxCell parent="1" vertex="1" style="shape=parallelogram;"/>
    </object>
    <mxCell id="edge_proj_state" source="proj_node" target="field_state" edge="1" parent="1"/>
  </root>
</mxGraphModel>
"""
        drawio_file = tmp_path / "diagram.drawio"
        drawio_file.write_text(xml_content, encoding='utf-8')
        
        facts = parse_drawio_file(drawio_file)
        
        # Key order in Nim tables is non-deterministic, so check for inclusion of fields
        assert "diagram_node('proj_node', 'rounded=1;fillColor=#FFF;', 'Visual Demo Project'," in facts
        assert "'type'='project'" in facts
        assert "'shortName'='VDEMO'" in facts
        assert "'leader'='jules'" in facts
        
        assert "diagram_node('field_state', 'shape=parallelogram;', 'State'," in facts
        assert "'type'='field'" in facts
        assert "'fieldType'='state'" in facts
        assert "'defaultValue'='Open'" in facts
        
        assert "diagram_edge('edge_proj_state', 'proj_node', 'field_state', '', '')." in facts

    def test_drawio_prolog_materialization(self, tmp_path):
        """Test that facts parsed from diagram are materialize_diagram_facts into YouTrack configuration."""
        from src.config.parser import parse_drawio_file
        from src.logic.inference import run_inference
        
        xml_content = """<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    
    <!-- Project -->
    <object id="proj_node" label="Visual Demo Project" type="project" shortName="VDEMO" leader="jules">
      <mxCell parent="1" vertex="1" style="style1;"/>
    </object>
    
    <!-- State Field -->
    <object id="field_state" label="State" type="field" fieldType="state" defaultValue="Open">
      <mxCell parent="1" vertex="1" style="style2;"/>
    </object>
    <mxCell id="edge_proj_state" source="proj_node" target="field_state" edge="1" parent="1"/>
    
    <!-- State Bundle -->
    <object id="bundle_state" label="VDEMO State Bundle" type="bundle" bundleType="state">
      <mxCell parent="1" vertex="1" style="style3;"/>
    </object>
    <mxCell id="edge_state_bundle" source="field_state" target="bundle_state" edge="1" parent="1"/>
    
    <!-- State Values -->
    <object id="state_val_open" label="Open" type="state_value" resolved="false">
      <mxCell parent="1" vertex="1" style="style4;"/>
    </object>
    <object id="state_val_done" label="Done" type="state_value" resolved="true">
      <mxCell parent="1" vertex="1" style="style5;"/>
    </object>
    <mxCell id="edge_val_open" source="state_val_open" target="bundle_state" edge="1" parent="1"/>
    <mxCell id="edge_val_done" source="state_val_done" target="bundle_state" edge="1" parent="1"/>
    
    <!-- Issue Seed -->
    <object id="seed_issue" label="Welcome to Visual IaC" type="seed" description="Hello from drawio" issueType="Task" priority="Normal">
      <mxCell parent="1" vertex="1" style="style6;"/>
    </object>
    <mxCell id="edge_seed_proj" source="seed_issue" target="proj_node" edge="1" parent="1"/>
  </root>
</mxGraphModel>
"""
        drawio_file = tmp_path / "diagram.drawio"
        drawio_file.write_text(xml_content, encoding='utf-8')
        
        target_facts = parse_drawio_file(drawio_file)
        
        # We start with empty current state
        current_fields = []
        current_bundles = []
        current_projects = [{"id": "VDEMO_id", "name": "Visual Demo Project", "shortName": "VDEMO"}]
        current_empty_projects = {"VDEMO": True}
        
        # Run Prolog diff logic inference
        plan = run_inference(
            current_fields, current_bundles, target_facts, current_projects,
            empty_projects=current_empty_projects
        )
        
        # Map to find specific actions
        action_names = [action[0] for action in plan]
        
        # Let's verify each critical action is present in correct sequence:
        assert "ensure_bundle" in action_names
        assert "add_state_value" in action_names
        assert "create_field" in action_names
        assert "attach_field" in action_names
        assert "seed_issue" in action_names
        
        # Verify specific details
        # ensure_bundle('VDEMO State Bundle', 'state')
        ensure_bundle_action = [a for a in plan if a[0] == "ensure_bundle"][0]
        assert ensure_bundle_action[1] == "VDEMO State Bundle"
        assert ensure_bundle_action[2] == "state"
        
        # add_state_value('VDEMO State Bundle', 'Done', 'true')
        done_val_action = [a for a in plan if a[0] == "add_state_value" and a[2] == "Done"][0]
        assert done_val_action[1] == "VDEMO State Bundle"
        assert done_val_action[3] == "true"
        
        # seed_issue('VDEMO', 'Welcome to Visual IaC', 'Hello from drawio', 'Task', 'Normal')
        seed_action = [a for a in plan if a[0] == "seed_issue"][0]
        assert seed_action[1] == "VDEMO"
        assert seed_action[2] == "Welcome to Visual IaC"
        assert seed_action[3] == "Hello from drawio"




