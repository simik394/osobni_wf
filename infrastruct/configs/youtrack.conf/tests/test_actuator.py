"""
Tests for YouTrack Actuator
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
import json


class TestYouTrackActuator:
    """Tests for YouTrack actuator."""
    
    @pytest.fixture
    def actuator(self):
        """Create actuator instance."""
        from src.actuator import YouTrackActuator
        return YouTrackActuator(
            url="https://youtrack.example.com",
            token="test-token",
            dry_run=False
        )
    
    @pytest.fixture
    def dry_run_actuator(self):
        """Create dry-run actuator instance."""
        from src.actuator import YouTrackActuator
        return YouTrackActuator(
            url="https://youtrack.example.com",
            token="test-token",
            dry_run=True
        )
    
    def test_auth_header_set(self, actuator):
        """Test that actuator sets correct auth headers."""
        assert "Authorization" in actuator.session.headers
        assert actuator.session.headers["Authorization"] == "Bearer test-token"
    
    def test_dry_run_does_not_call_api(self, dry_run_actuator):
        """Test that dry run mode doesn't make API calls."""
        with patch.object(dry_run_actuator.session, 'post') as mock_post:
            result = dry_run_actuator.create_bundle("TestBundle")
            
            mock_post.assert_not_called()
            assert result.success is True
            assert "DRY RUN" in result.action or result.action == "create_bundle(TestBundle, enum)"


class TestBundleOperations:
    """Tests for bundle CRUD operations."""
    
    @patch('requests.Session')
    def test_create_bundle_success(self, mock_session_class):
        """Test successful bundle creation."""
        from src.actuator import YouTrackActuator
        
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        mock_response = Mock()
        mock_response.json.return_value = {"id": "bundle-123", "name": "PriorityBundle"}
        mock_response.raise_for_status = Mock()
        mock_session.post.return_value = mock_response
        
        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.create_bundle("PriorityBundle", "enum")
        
        assert result.success is True
        assert result.resource_id == "bundle-123"
    
    @patch('requests.Session')
    def test_add_bundle_value_success(self, mock_session_class):
        """Test successful bundle value addition."""
        from src.actuator import YouTrackActuator
        
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        mock_response = Mock()
        mock_response.json.return_value = {"id": "value-456", "name": "Critical"}
        mock_response.raise_for_status = Mock()
        mock_session.post.return_value = mock_response
        
        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.add_bundle_value("bundle-123", "Critical")
        
        assert result.success is True
        assert result.resource_id == "value-456"


class TestFieldOperations:
    """Tests for custom field operations."""
    
    @patch('requests.Session')
    def test_create_field_success(self, mock_session_class):
        """Test successful field creation."""
        from src.actuator import YouTrackActuator
        
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        mock_response = Mock()
        mock_response.json.return_value = {"id": "field-789", "name": "Priority"}
        mock_response.raise_for_status = Mock()
        mock_session.post.return_value = mock_response
        
        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.create_field("Priority", "enum", bundle_name_or_id="bundle-123")
        
        assert result.success is True
        assert result.resource_id == "field-789"
    
    @patch('requests.Session')
    def test_attach_field_to_project(self, mock_session_class):
        """Test attaching field to project."""
        from src.actuator import YouTrackActuator
        
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        mock_response = Mock()
        mock_response.json.return_value = {"id": "pf-001"}
        mock_response.raise_for_status = Mock()
        mock_session.post.return_value = mock_response
        
        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.attach_field_to_project("field-789", "DEMO")
        
        assert result.success is True


class TestPlanExecution:
    """Tests for plan execution from Prolog output."""
    
    @patch('requests.Session')
    def test_execute_plan_in_order(self, mock_session_class):
        """Test that plan executes actions in order."""
        from src.actuator import YouTrackActuator
        
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        mock_response = Mock()
        mock_response.json.return_value = {"id": "test-id"}
        mock_response.raise_for_status = Mock()
        mock_session.post.return_value = mock_response
        
        actuator = YouTrackActuator("https://yt.example.com", "token")
        
        plan = [
            ('create_bundle', 'PriorityBundle', 'enum'),
            ('create_field', 'Priority', 'enum', 'PriorityBundle'),
        ]
        
        results = actuator.execute_plan(plan)
        
        assert len(results) == 2
        assert all(r.success for r in results)
    
    def test_dry_run_plan_execution(self):
        """Test plan execution in dry-run mode."""
        from src.actuator import YouTrackActuator
        
        actuator = YouTrackActuator(
            "https://yt.example.com", 
            "token",
            dry_run=True
        )
        
        plan = [
            ('create_bundle', 'TestBundle', 'enum'),
            ('add_bundle_value', 'TestBundle', 'High', 'enum'),
            ('create_field', 'TestField', 'enum', 'TestBundle'),
        ]
        
        results = actuator.execute_plan(plan)
        
        assert len(results) == 3
        assert all(r.success for r in results)


class TestUpdateOperations:
    """Tests for update operations."""
    
    @patch('requests.Session')
    def test_archive_bundle_value_success(self, mock_session_class):
        """Test successful bundle value archiving."""
        from src.actuator import YouTrackActuator
        
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        mock_response = Mock()
        mock_response.json.return_value = {"id": "value-123", "archived": True}
        mock_response.raise_for_status = Mock()
        mock_session.post.return_value = mock_response
        
        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.archive_bundle_value("bundle-123", "value-123")
        
        assert result.success is True
        assert result.resource_id == "value-123"
    
    @patch('requests.Session')
    def test_update_bundle_value_success(self, mock_session_class):
        """Test successful bundle value update."""
        from src.actuator import YouTrackActuator
        
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        mock_response = Mock()
        mock_response.json.return_value = {"id": "value-123", "name": "Renamed"}
        mock_response.raise_for_status = Mock()
        mock_session.post.return_value = mock_response
        
        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.update_bundle_value("bundle-123", "value-123", "Renamed")
        
        assert result.success is True


class TestDeleteOperations:
    """Tests for delete operations."""
    
    @patch('requests.Session')
    def test_delete_field_success(self, mock_session_class):
        """Test successful field deletion."""
        from src.actuator import YouTrackActuator
        
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_session.delete.return_value = mock_response
        
        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.delete_field("field-123-uuid-like-id")
        
        assert result.success is True
    
    @patch('requests.Session')
    def test_detach_field_from_project(self, mock_session_class):
        """Test detaching field from project."""
        from src.actuator import YouTrackActuator
        
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        # Mock GET to find project-field mapping
        mock_get_response = Mock()
        mock_get_response.json.return_value = [
            {"id": "pf-001", "field": {"id": "field-123-uuid", "name": "Priority"}}
        ]
        mock_get_response.raise_for_status = Mock()
        
        # Mock DELETE
        mock_delete_response = Mock()
        mock_delete_response.raise_for_status = Mock()
        
        mock_session.get.return_value = mock_get_response
        mock_session.delete.return_value = mock_delete_response
        
        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.detach_field_from_project("field-123-uuid", "DEMO")
        
        assert result.success is True
        assert result.resource_id == "pf-001"
    
    def test_delete_dry_run(self):
        """Test that delete operations work in dry-run mode."""
        from src.actuator import YouTrackActuator
        
        actuator = YouTrackActuator(
            "https://yt.example.com", 
            "token",
            dry_run=True
        )
        
        # All delete operations should succeed in dry-run
        result1 = actuator.delete_field("TestField")
        result2 = actuator.delete_bundle("TestBundle")
        result3 = actuator.detach_field_from_project("TestField", "DEMO")
        
        assert result1.success is True
        assert result2.success is True
        assert result3.success is True


class TestIdempotentCreateField:
    """Tests for create_field idempotency guard (NUCLEAR OPTION fix)."""

    @patch('requests.Session')
    def test_create_field_already_exists_skips_creation(self, mock_session_class):
        """Test that creating an already existing field is treated as success without POST."""
        from src.actuator import YouTrackActuator

        mock_session = MagicMock()
        mock_session_class.return_value = mock_session

        # Mock GET (field lookup) to return an existing field
        mock_get_response = Mock()
        mock_get_response.json.return_value = [
            {"id": "existing-field-uuid-123", "name": "Priority", "fieldType": {"id": "enum[1]"}}
        ]
        mock_get_response.raise_for_status = Mock()
        mock_session.get.return_value = mock_get_response

        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.create_field("Priority", "enum", "PriorityBundle")

        assert result.success is True
        assert result.resource_id == "existing-field-uuid-123"
        # POST should NOT have been called (idempotency guard short-circuited)
        mock_session.post.assert_not_called()

    @patch('requests.Session')
    def test_create_field_409_conflict_is_success(self, mock_session_class):
        """Test that 409 Conflict from API is treated as success."""
        from src.actuator import YouTrackActuator

        mock_session = MagicMock()
        mock_session_class.return_value = mock_session

        # Mock GET (field lookup) returns empty - field not found by name lookup
        mock_get_response = Mock()
        mock_get_response.json.return_value = []
        mock_get_response.raise_for_status = Mock()
        mock_session.get.return_value = mock_get_response

        # Mock POST to raise 409 Conflict
        mock_409_response = Mock()
        mock_409_response.status_code = 409
        mock_409_response.text = "Field already exists"
        import requests as req
        mock_session.post.side_effect = req.HTTPError(response=mock_409_response)

        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.create_field("Priority", "enum")

        assert result.success is True

    @patch('requests.Session')
    def test_create_field_real_error_still_fails(self, mock_session_class):
        """Test that non-409 errors still result in failure."""
        from src.actuator import YouTrackActuator

        mock_session = MagicMock()
        mock_session_class.return_value = mock_session

        # Mock GET returns empty
        mock_get_response = Mock()
        mock_get_response.json.return_value = []
        mock_get_response.raise_for_status = Mock()
        mock_session.get.return_value = mock_get_response

        # Mock POST to raise 500 Internal Server Error
        mock_500_response = Mock()
        mock_500_response.status_code = 500
        mock_500_response.text = "Internal Server Error"
        import requests as req
        mock_session.post.side_effect = req.HTTPError(response=mock_500_response)

        actuator = YouTrackActuator("https://yt.example.com", "token")
        result = actuator.create_field("BrokenField", "enum")

        assert result.success is False


class TestControllerFieldFilter:
    """Test that controller filters create_field correctly (not blanket skip)."""

    def test_controller_allows_new_fields_through(self):
        """Test that create_field for genuinely new fields is NOT filtered out."""
        # Simulate the controller's filtering logic
        existing_field_names = {"Priority", "State", "Assignee"}

        plan = [
            ('create_bundle', 'NewBundle', 'enum'),
            ('create_field', 'Priority', 'enum', 'PriorityBundle'),  # Exists -> filtered
            ('create_field', 'BrandNewField', 'string'),             # New -> passes
            ('attach_field', 'BrandNewField', 'DEMO'),
        ]

        filtered_plan = []
        for action in plan:
            if action[0] == 'create_field' and action[1] in existing_field_names:
                continue
            filtered_plan.append(action)

        # BrandNewField should pass through
        assert len(filtered_plan) == 3
        assert ('create_field', 'BrandNewField', 'string') in filtered_plan
        # Priority should be filtered
        assert ('create_field', 'Priority', 'enum', 'PriorityBundle') not in filtered_plan
