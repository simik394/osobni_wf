"""
Historical Tracker - PM Agent Phase 3

Logs task completions with actual duration for estimate calibration.
Stores data in append-only JSONL format.

Usage:
    python cli.py log --task SAM-1 --actual 6h --solver jules
    python cli.py calibrate --project SAM
"""

import json
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional


# Default history file location
HISTORY_FILE = Path(__file__).parent / "history" / "completions.jsonl"


@dataclass
class TaskCompletion:
    """Record of a completed task"""
    task_id: str
    estimated_hours: float
    actual_hours: float
    solver: str
    completed_at: str  # ISO format
    success: bool = True
    notes: Optional[str] = None
    
    def to_dict(self) -> dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict) -> 'TaskCompletion':
        return cls(**data)


@dataclass
class CalibrationStats:
    """Aggregated stats for estimate calibration"""
    sample_size: int
    avg_ratio: float  # actual / estimated
    std_dev: float
    by_solver: dict[str, float]  # solver → avg ratio


def ensure_history_dir():
    """Create history directory if needed"""
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)


def log_completion(
    task_id: str,
    estimated_hours: float,
    actual_hours: float,
    solver: str,
    success: bool = True,
    notes: str = None,
    history_file: Path = None
) -> TaskCompletion:
    """
    Log a task completion to history.
    
    Args:
        task_id: YouTrack issue ID
        estimated_hours: Original estimate
        actual_hours: Actual time spent
        solver: Which solver completed it
        success: Whether task was successful
        notes: Optional notes
        history_file: Override history file location
    
    Returns:
        The logged completion record
    """
    history_file = history_file or HISTORY_FILE
    ensure_history_dir()
    
    completion = TaskCompletion(
        task_id=task_id,
        estimated_hours=estimated_hours,
        actual_hours=actual_hours,
        solver=solver,
        completed_at=datetime.now().isoformat(),
        success=success,
        notes=notes,
    )
    
    # Append to JSONL file
    with open(history_file, 'a') as f:
        f.write(json.dumps(completion.to_dict()) + '\n')
    
    return completion


def load_history(history_file: Path = None) -> list[TaskCompletion]:
    """Load all completions from history file"""
    history_file = history_file or HISTORY_FILE
    
    if not history_file.exists():
        return []
    
    completions = []
    with open(history_file) as f:
        for line in f:
            line = line.strip()
            if line:
                data = json.loads(line)
                completions.append(TaskCompletion.from_dict(data))
    
    return completions


def calculate_calibration(completions: list[TaskCompletion]) -> CalibrationStats:
    """
    Calculate calibration stats from completion history.
    
    Returns stats on how estimates compare to actuals.
    """
    if not completions:
        return CalibrationStats(
            sample_size=0,
            avg_ratio=1.0,
            std_dev=0.0,
            by_solver={},
        )
    
    # Calculate ratios
    ratios = []
    by_solver: dict[str, list[float]] = {}
    
    for c in completions:
        if c.estimated_hours > 0:
            ratio = c.actual_hours / c.estimated_hours
            ratios.append(ratio)
            
            if c.solver not in by_solver:
                by_solver[c.solver] = []
            by_solver[c.solver].append(ratio)
    
    # Overall stats
    avg_ratio = sum(ratios) / len(ratios) if ratios else 1.0
    
    # Standard deviation
    if len(ratios) > 1:
        variance = sum((r - avg_ratio) ** 2 for r in ratios) / len(ratios)
        std_dev = variance ** 0.5
    else:
        std_dev = 0.0
    
    # Per-solver averages
    solver_avgs = {
        solver: sum(rs) / len(rs)
        for solver, rs in by_solver.items()
    }
    
    return CalibrationStats(
        sample_size=len(completions),
        avg_ratio=avg_ratio,
        std_dev=std_dev,
        by_solver=solver_avgs,
    )


def calibrate_estimate(
    original_hours: float,
    solver: str = None,
    history_file: Path = None
) -> float:
    """
    Adjust an estimate based on historical data.
    
    Args:
        original_hours: Original estimate
        solver: Optional solver to use solver-specific calibration
        history_file: Override history file location
    
    Returns:
        Calibrated estimate
    """
    completions = load_history(history_file)
    stats = calculate_calibration(completions)
    
    if stats.sample_size < 3:
        # Not enough data, return original
        return original_hours
    
    # Use solver-specific ratio if available
    if solver and solver in stats.by_solver:
        ratio = stats.by_solver[solver]
    else:
        ratio = stats.avg_ratio
    
    return original_hours * ratio


def format_calibration(stats: CalibrationStats) -> str:
    """Format calibration stats for display"""
    lines = []
    lines.append("## Estimation Calibration")
    lines.append("")
    lines.append(f"**Sample size:** {stats.sample_size} completions")
    lines.append(f"**Average ratio:** {stats.avg_ratio:.2f}x (actual/estimated)")
    lines.append(f"**Std deviation:** ±{stats.std_dev:.2f}")
    lines.append("")
    
    if stats.by_solver:
        lines.append("### By Solver")
        lines.append("")
        lines.append("| Solver | Avg Ratio | Interpretation |")
        lines.append("|--------|-----------|----------------|")
        
        for solver, ratio in sorted(stats.by_solver.items()):
            if ratio < 0.9:
                interp = "Faster than expected"
            elif ratio > 1.1:
                interp = "Slower than expected"
            else:
                interp = "On target"
            lines.append(f"| {solver} | {ratio:.2f}x | {interp} |")
    
    lines.append("")
    
    if stats.avg_ratio > 1.1:
        lines.append("> ⚠️ **Estimates are optimistic** - multiply by {:.1f} for accuracy".format(stats.avg_ratio))
    elif stats.avg_ratio < 0.9:
        lines.append("> ✅ **Estimates are conservative** - tasks complete faster than expected")
    else:
        lines.append("> ✅ **Estimates are calibrated** - actual time matches estimates")
    
    return "\n".join(lines)


# CLI commands
def cmd_log(args):
    """Log a task completion"""
    # Parse hours (support "6h" or "6" format)
    actual = args.actual
    if isinstance(actual, str):
        actual = actual.replace('h', '').strip()
    actual_hours = float(actual)
    
    estimated = getattr(args, 'estimated', 4)  # Default 4h
    if isinstance(estimated, str):
        estimated = estimated.replace('h', '').strip()
    estimated_hours = float(estimated)
    
    completion = log_completion(
        task_id=args.task,
        estimated_hours=estimated_hours,
        actual_hours=actual_hours,
        solver=args.solver or 'unknown',
        success=not getattr(args, 'failed', False),
        notes=getattr(args, 'notes', None),
    )
    
    print(f"✅ Logged completion for {args.task}")
    print(f"   Estimated: {estimated_hours}h → Actual: {actual_hours}h")
    print(f"   Solver: {completion.solver}")
    print(f"   Ratio: {actual_hours/estimated_hours:.2f}x")


def cmd_calibrate(args):
    """Show calibration stats"""
    completions = load_history()
    
    if not completions:
        print("No completion history found.")
        print(f"Log completions with: python cli.py log --task SAM-1 --actual 6h")
        return
    
    stats = calculate_calibration(completions)
    print(format_calibration(stats))
    
    if args.json:
        output = {
            'sample_size': stats.sample_size,
            'avg_ratio': stats.avg_ratio,
            'std_dev': stats.std_dev,
            'by_solver': stats.by_solver,
        }
        print()
        print(json.dumps(output, indent=2))
