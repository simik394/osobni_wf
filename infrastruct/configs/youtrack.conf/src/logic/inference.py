"""
Prolog inference engine using Janus.

This module bridges Python and SWI-Prolog to run the IaC diff logic.
"""
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import janus, but allow graceful fallback for testing
try:
    import janus_swi as janus
    JANUS_AVAILABLE = True
except Exception as e:
    import sys
    print(f"Janus import failed: {e}", file=sys.stderr)
    JANUS_AVAILABLE = False
    logger.warning(f"janus-swi not available: {e}")


class PrologInferenceEngine:
    """
    Prolog inference engine for YouTrack IaC.
    
    Uses Janus to assert facts and run diff/plan logic.
    """
    
    def __init__(self, rules_path: Optional[Path] = None):
        """
        Initialize the inference engine.
        
        Args:
            rules_path: Path to core.pl rules file. If None, uses default.
        """
        if not JANUS_AVAILABLE:
            raise RuntimeError("janus-swi is not installed. Run: pip install janus-swi")
        
        self.rules_path = rules_path or Path(__file__).parent.parent / "logic" / "core.pl"
        self._initialized = False
    
    def initialize(self) -> None:
        """Load the Prolog rules file."""
        if self._initialized:
            return
        
        # Consult the core rules
        rules_str = str(self.rules_path.absolute())
        janus.consult(rules_str)
        self._initialized = True
        logger.info(f"Loaded Prolog rules from {self.rules_path}")
    
    def clear_facts(self) -> None:
        """Clear all dynamic facts to prepare for new inference."""
        self.initialize()
        
        # Retract all dynamic facts
        janus.query_once("retractall(curr_field(_, _, _))")
        janus.query_once("retractall(curr_project(_, _, _))")
        janus.query_once("retractall(curr_bundle(_, _, _))")
        janus.query_once("retractall(bundle_value(_, _, _))")
        janus.query_once("retractall(target_field(_, _, _))")
        janus.query_once("retractall(target_project(_, _, _))")
        janus.query_once("retractall(target_bundle_value(_, _))")
        janus.query_once("retractall(target_state_value(_, _, _))")
        janus.query_once("retractall(field_uses_bundle(_, _))")
        janus.query_once("retractall(field_required(_, _))")
        
        # Workflow facts
        janus.query_once("retractall(curr_workflow(_, _, _))")
        janus.query_once("retractall(curr_rule(_, _, _, _, _))")
        janus.query_once("retractall(curr_workflow_usage(_, _, _))")
        janus.query_once("retractall(target_workflow(_, _, _))")
        janus.query_once("retractall(target_rule(_, _, _, _))")
        janus.query_once("retractall(target_workflow_attachment(_, _))")
        
        logger.debug("Cleared all dynamic facts")
    
    def assert_current_state(self, fields: list[dict], bundles: list[dict], 
                            projects: list[dict] = None, workflows: list[dict] = None) -> None:
        """
        Assert current YouTrack state as Prolog facts.
        
        Args:
            fields: Custom fields from YouTrack API
            bundles: Bundles from YouTrack API
            projects: Projects from YouTrack API
            workflows: Workflows from YouTrack API
        """
        self.initialize()
        
        # Assert fields
        for field in fields:
            field_id = self._escape(field.get('id', ''))
            name = self._escape(field.get('name', ''))
            field_type = self._escape(field.get('fieldType', {}).get('name', ''))
            janus.query_once(f"assertz(curr_field('{field_id}', '{name}', '{field_type}'))")
        
        logger.debug(f"Asserted {len(fields)} current fields")
        
        # Assert bundles
        for bundle in bundles:
            bundle_id = self._escape(bundle.get('id', ''))
            bundle_name = self._escape(bundle.get('name', ''))
            # Detect bundle type
            values = bundle.get('values', [])
            first_val = values[0] if values else {}
            bundle_type = 'state' if 'isResolved' in first_val else 'enum'
            janus.query_once(f"assertz(curr_bundle('{bundle_id}', '{bundle_name}', '{bundle_type}'))")
            
            for value in bundle.get('values', []):
                if not value.get('archived', False):
                    value_id = self._escape(value.get('id', ''))
                    value_name = self._escape(value.get('name', ''))
                    janus.query_once(f"assertz(bundle_value('{bundle_id}', '{value_id}', '{value_name}'))")
        
        logger.debug(f"Asserted {len(bundles)} current bundles")
        
        # Assert projects
        if projects:
            for project in projects:
                project_id = self._escape(project.get('id', ''))
                name = self._escape(project.get('name', ''))
                short_name = self._escape(project.get('shortName', ''))
                janus.query_once(f"assertz(curr_project('{project_id}', '{name}', '{short_name}'))")
            
            logger.debug(f"Asserted {len(projects)} current projects")

        # Assert workflows and rules
        if workflows:
            for wf in workflows:
                wf_id = self._escape(wf.get('id', ''))
                name = self._escape(wf.get('name', ''))
                title = self._escape(wf.get('title', ''))
                janus.query_once(f"assertz(curr_workflow('{wf_id}', '{name}', '{title}'))")
                
                # Rules
                for rule in wf.get('rules', []):
                    rule_id = self._escape(rule.get('id', ''))
                    rule_name = self._escape(rule.get('name', ''))
                    # Note: YouTrack list_workflow API might not return script content directly
                    # If empty, drift detection might be limited unless populated elsewhere
                    script = self._escape(rule.get('script', ''))
                    janus.query_once(f"assertz(curr_rule('{wf_id}', '{rule_id}', '{rule_name}', 'unknown', '{script}'))")
            
            logger.debug(f"Asserted {len(workflows)} current workflows")
    
    def assert_target_state(self, prolog_facts: str) -> None:
        """
        Assert target state from Prolog facts string.
        
        Args:
            prolog_facts: String of Prolog facts, one per line
        """
        self.initialize()
        
        count = 0
        for line in prolog_facts.strip().split('\n'):
            line = line.strip()
            if line and not line.startswith('%'):
                # Remove trailing period if present for assertz
                fact = line.rstrip('.')
                janus.query_once(f"assertz({fact})")
                count += 1
        
        logger.debug(f"Asserted {count} target facts")
    
    def compute_plan(self) -> list[tuple]:
        """
        Run Prolog inference to compute the action plan.
        
        Returns:
            List of action tuples, e.g.:
            [('create_bundle', 'PriorityBundle', 'enum'),
             ('create_field', 'Priority', 'enum', 'DEMO')]
        """
        self.initialize()
        
        # Query the plan
        # We transform terms to lists (univ =..) to assume robust conversion 
        # by Janus (which might fail on compound terms in some envs)
        # We underscore _Actions to prevent Janus from trying to return the 
        # intermediate term list (which would cause a py_term domain error)
        query = "plan(_Actions), maplist(=.., _Actions, ActionLists)"
        result = janus.query_once(query)
        
        if result is None:
            logger.warning("Prolog plan query returned no results")
            return []
        
        action_lists = result.get("ActionLists", [])
        if action_lists is None:
             # Logic failed
             return []
        
        # Convert lists to tuples for consistency
        plan = [tuple(a) for a in action_lists]
        
        logger.info(f"Computed plan with {len(plan)} actions")
        return plan
    
    def _term_to_tuple(self, term) -> tuple:
        """Convert a Janus Prolog term to a Python tuple."""
        if hasattr(term, 'functor'):
            functor = str(term.functor)
            args = [self._term_to_tuple(arg) if hasattr(arg, 'functor') else str(arg) 
                    for arg in term.args]
            return (functor, *args)
        return (str(term),)
    
    def _escape(self, s: str) -> str:
        """Escape a string for Prolog."""
        return s.replace("\\", "\\\\").replace("'", "\\'")


def run_inference(fields: list[dict], bundles: list[dict], 
                  target_facts: str, projects: list[dict] = None, workflows: list[dict] = None) -> list[tuple]:
    """
    Convenience function to run complete inference.
    
    Args:
        fields: Current fields from YouTrack API
        bundles: Current bundles from YouTrack API
        target_facts: Prolog facts string from config translator
        projects: Current projects from YouTrack API
        workflows: Current workflows from YouTrack API
        
    Returns:
        List of action tuples for the actuator
    """
    engine = PrologInferenceEngine()
    engine.clear_facts()
    engine.assert_current_state(fields, bundles, projects, workflows)
    engine.assert_target_state(target_facts)
    
    return engine.compute_plan()
