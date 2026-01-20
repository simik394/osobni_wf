"""
Unit tests for the advanced solver matcher.
"""

import unittest
import sys
import os
from unittest.mock import MagicMock

# Add project root to PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from agents.planner.models import Task, Priority
from agents.planner.solver_matcher import match_solver

class TestSolverMatcher(unittest.TestCase):

    def test_explicit_tag_matching(self):
        """Test that explicit tags override all other logic."""
        task = Task(id='TEST-1', summary='Implement a new feature', priority=Priority.MAJOR, goal_id='G-1')
        issue = {'tags': [{'name': 'jules'}]}
        match = match_solver(task, issue)
        self.assertEqual(match.solver, 'jules')
        self.assertEqual(match.confidence, 1.0)
        self.assertIn('explicit tag', match.reason)

    def test_regex_matching(self):
        """Test that regex matching on the summary works correctly."""
        # Use 'Investigate' to trigger the perplexity solver's regex
        task = Task(id='TEST-2', summary='Investigate the best way to do sentiment analysis', priority=Priority.NORMAL, goal_id='G-1')
        match = match_solver(task)
        self.assertEqual(match.solver, 'perplexity')
        self.assertEqual(match.confidence, 0.9)
        self.assertIn('summary regex match', match.reason)

    def test_file_type_capability_matching(self):
        """Test that solvers are matched based on file types."""
        task = Task(
            id='TEST-3',
            # Use a neutral summary to avoid triggering a regex match
            summary='Update the CI/CD pipeline',
            priority=Priority.CRITICAL,
            affected_files=['.github/workflows/ci.yml', 'scripts/deploy.sh'],
            goal_id='G-2'
        )
        match = match_solver(task)
        # jules supports .sh files, so it should be a good match
        self.assertEqual(match.solver, 'jules')
        self.assertIn('capability match', match.reason)

    def test_complexity_filtering(self):
        """Test that solvers are filtered by task complexity."""
        task = Task(
            id='TEST-4',
            # This summary will not match any regex
            summary='A very complex task that requires a lot of work',
            priority=Priority.SHOW_STOPPER,
            estimate_hours=40,
            goal_id='G-3'
        )
        match = match_solver(task)
        # Only jules can handle complexity 10
        self.assertEqual(match.solver, 'jules')
        self.assertIn('capability match', match.reason)

    def test_fallback_solver(self):
        """Test that a fallback solver is recommended."""
        task = Task(
            id='TEST-5',
            # This summary will not match any regex
            summary='Database performance improvements',
            priority=Priority.MAJOR,
            estimate_hours=12,
            goal_id='G-4'
        )
        match = match_solver(task)
        self.assertIsNotNone(match.fallback)
        self.assertIn(match.solver, ['gemini', 'jules'])


if __name__ == '__main__':
    unittest.main()
