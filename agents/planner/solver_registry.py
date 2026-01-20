"""
Centralized Solver Registry

- Defines all available solvers
- Provides structured capabilities for matching
- Based on `SOLVER_REGISTRY.md`
"""

from dataclasses import dataclass, field
from typing import Optional, List
import re

@dataclass
class SolverCapability:
    """Solver with its capabilities and constraints"""
    name: str

    # Matching criteria
    summary_regex: Optional[re.Pattern] = None
    capability_tags: List[str] = field(default_factory=list)
    supported_file_types: List[str] = field(default_factory=list)
    required_tools: List[str] = field(default_factory=list)

    # Constraints
    max_complexity: int = 5  # 1-10, higher = can handle more complex tasks
    concurrency: int = 1     # Max parallel sessions

    # Metadata
    strengths: List[str] = field(default_factory=list)

# The global registry of all known solvers
SOLVER_REGISTRY = {
    'local-slm': SolverCapability(
        name='local-slm',
        summary_regex=re.compile(r'^(quick|simple|offline|local)\b', re.IGNORECASE),
        capability_tags=['quick', 'text'],
        max_complexity=3,
        concurrency=999,
        strengths=['Quick tasks', 'Privacy-sensitive', 'Offline operation'],
    ),
    'gemini': SolverCapability(
        name='gemini',
        summary_regex=re.compile(r'^(analyze|review|audit|assess|document|describe|explain|plan)\b', re.IGNORECASE),
        capability_tags=['analysis', 'planning', 'docs', 'code-review'],
        required_tools=['youtrack'],
        max_complexity=7,
        concurrency=10,
        strengths=['Text analysis', 'Code review', 'Documentation generation'],
    ),
    'perplexity': SolverCapability(
        name='perplexity',
        summary_regex=re.compile(r'^(research|investigate|explore|compare|fact-check)\b', re.IGNORECASE),
        capability_tags=['research', 'web-search'],
        max_complexity=5,
        concurrency=1,
        strengths=['Web research', 'Source citation', 'Fact verification'],
    ),
    'angrav': SolverCapability(
        name='angrav',
        summary_regex=re.compile(r'^(automate|browser|ui|click|navigate)\b', re.IGNORECASE),
        capability_tags=['automation', 'browser', 'gemini-ui'],
        max_complexity=6,
        concurrency=3,
        strengths=['Browser automation', 'Google AI Studio', 'Rate limit tracking'],
    ),
    'jules': SolverCapability(
        name='jules',
        summary_regex=re.compile(r'^(implement|create|add|build|refactor|fix|bug)\b', re.IGNORECASE),
        capability_tags=['code', 'implementation', 'refactor', 'bug-fix'],
        supported_file_types=['.py', '.ts', '.js', '.go', '.md', '.sh'],
        max_complexity=10,
        concurrency=15,
        strengths=['Code implementation', 'Refactoring', 'Bug fixes'],
    ),
}

def get_solver(name: str) -> Optional[SolverCapability]:
    """Get a solver by name"""
    return SOLVER_REGISTRY.get(name)

def list_solvers() -> List[SolverCapability]:
    """List all available solvers"""
    return list(SOLVER_REGISTRY.values())
