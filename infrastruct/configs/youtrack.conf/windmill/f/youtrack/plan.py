import sys
from pathlib import Path

# Add project root to path so we can import src
sys.path.append(str(Path(__file__).parent.parent))

from src.controller.main import YouTrackClient
from src.config import config_to_prolog_facts
from src.config.parser import load_config_string, merge_configs
from src.logic.inference import run_inference, JANUS_AVAILABLE

def main(youtrack_url: str, youtrack_token: str, yaml_config: str):
    """
    Windmill script to compute YouTrack IaC plan.
    """
    if not JANUS_AVAILABLE:
        raise RuntimeError("Janus not available - ensure running in correct Docker image")
    
    # 1. SENSE
    print("Fetching current state...")
    client = YouTrackClient(youtrack_url, youtrack_token)
    
    fields = client.get_custom_fields()
    bundles = client.get_bundles()
    state_bundles = client.get_state_bundles()
    projects = client.get_projects()
    all_bundles = bundles + state_bundles
    
    # 2. CONFIG
    print("Parsing config...")
    # Windmill usually passes strings, but we can also support multi-file merge if logic extended
    # For now, just load the single string passed in argument
    config = load_config_string(yaml_config)
    target_facts = config_to_prolog_facts(config)
    
    # 3. INFER
    print("Running inference...")
    plan = run_inference(fields, all_bundles, target_facts, projects)
    
    return {
        "plan": plan,
        "count": len(plan),
        "target_facts": target_facts # Optional debugging
    }
