import typer
import os
from typing import Optional
from dotenv import load_dotenv
from .youtrack import get_youtrack_client

# Load .env file
load_dotenv()

app = typer.Typer(help="QuestDiscovery Agent CLI")

@app.command()
def fetch_issues(
    query: str = typer.Option(..., help="YouTrack search query (e.g. 'project: QUEST')"),
    limit: int = typer.Option(10, help="Max issues to fetch"),
    format: str = typer.Option("text", help="Output format: text or json")
):
    """
    Fetch issues from YouTrack using standalone client (QUEST-5).
    """
    client = get_youtrack_client()
    if not client:
        typer.echo("Error: YOUTRACK_URL and YOUTRACK_TOKEN must be set.", err=True)
        raise typer.Exit(code=1)

    try:
        issues = client.search_issues(query, limit=limit)

        if format == "json":
            import json
            typer.echo(json.dumps(issues, indent=2))
        else:
            typer.echo(f"Found {len(issues)} issues for query: '{query}'")
            for issue in issues:
                summary = issue.get("summary", "No summary")
                issue_id = issue.get("id")
                typer.echo(f"[{issue_id}] {summary}")

    except Exception as e:
        typer.echo(f"Error fetching issues: {e}", err=True)
        raise typer.Exit(code=1)

if __name__ == "__main__":
    app()
