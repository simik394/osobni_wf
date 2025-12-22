"""
Tests for Prolog inference engine.

Note: Most tests require janus-swi to be installed, which is only
available in the Docker container. Tests are skipped when Janus is unavailable.
"""
import pytest


# Check if Janus is available
try:
    from src.logic.inference import JANUS_AVAILABLE
except ImportError:
    JANUS_AVAILABLE = False


@pytest.mark.skipif(not JANUS_AVAILABLE, reason="janus-swi not installed")
class TestPrologInferenceEngine:
    """Tests that require Janus - run in Docker."""
    
    def test_engine_initialization(self):
        """Test that engine can be initialized."""
        from src.logic.inference import PrologInferenceEngine
        engine = PrologInferenceEngine()
        engine.initialize()
        assert engine._initialized is True
    
    def test_clear_facts(self):
        """Test that facts can be cleared."""
        from src.logic.inference import PrologInferenceEngine
        engine = PrologInferenceEngine()
        engine.clear_facts()  # Should not raise
    
    def test_assert_current_state(self):
        """Test asserting current state."""
        from src.logic.inference import PrologInferenceEngine
        
        engine = PrologInferenceEngine()
        engine.clear_facts()
        
        fields = [{"id": "f1", "name": "Priority", "fieldType": {"name": "enum"}}]
        bundles = [{"id": "b1", "name": "PriorityBundle", "values": []}]
        
        engine.assert_current_state(fields, bundles)
        # Should not raise
    
    def test_compute_plan_empty(self):
        """Test computing plan when in sync."""
        from src.logic.inference import PrologInferenceEngine
        
        engine = PrologInferenceEngine()
        engine.clear_facts()
        
        # No target facts, so plan should be empty
        plan = engine.compute_plan()
        assert plan == []


class TestInferenceWithoutJanus:
    """Tests that work without Janus."""
    
    def test_janus_availability_flag(self):
        """Test JANUS_AVAILABLE flag is set correctly."""
        from src.logic.inference import JANUS_AVAILABLE
        # Just check it's a boolean
        assert isinstance(JANUS_AVAILABLE, bool)
    
    def test_escape_function(self):
        """Test the escape helper."""
        from src.logic.inference import PrologInferenceEngine
        
        # Skip if Janus not available (can't instantiate engine)
        if not JANUS_AVAILABLE:
            pytest.skip("Janus not available")
        
        engine = PrologInferenceEngine()
        assert engine._escape("O'Brien") == "O\\'Brien"
        assert engine._escape("back\\slash") == "back\\\\slash"
