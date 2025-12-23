import sys
from pathlib import Path

# Add project root
sys.path.append(str(Path(__file__).parent.parent))

from src.actuator import YouTrackActuator

def main(youtrack_url: str, youtrack_token: str, plan: list):
    """
    Windmill script to execute YouTrack IaC plan.
    """
    if not plan:
        print("Empty plan, nothing to do.")
        return {"success": True, "actions": 0}

    print(f"Executing plan with {len(plan)} actions...")
    
    # Rehydrate tuples if they became lists via JSON serialization
    # Prolog inference returns tuples, but JSON makes them lists
    hydrated_plan = [tuple(a) if isinstance(a, list) else a for a in plan]
    
    actuator = YouTrackActuator(youtrack_url, youtrack_token, dry_run=False)
    results = actuator.execute_plan(hydrated_plan)
    
    succeeded = sum(1 for r in results if r.success)
    failed = len(results) - succeeded
    
    output = {
        "succeeded": succeeded,
        "failed": failed,
        "details": [
            {
                "action": r.action,
                "success": r.success,
                "error": r.error, 
                "resource_id": r.resource_id
            }
            for r in results
        ]
    }
    
    if failed > 0:
        # Raise exception to fail the Windmill job if partial failure
        # Or just return output. Let's return output but print error
        print(f"FAILED: {failed} actions failed")
    
    return output
