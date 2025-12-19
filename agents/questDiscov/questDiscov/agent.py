"""LangGraph ReAct agent for question prioritization."""

from __future__ import annotations

import os
from typing import Optional

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent

from .tools.graph_tools import (
    add_dependency,
    add_question,
    get_graph_stats,
    mark_answered,
    query_dependencies,
    query_questions,
)
from .tools.obsidian_tools import (
    read_note,
    search_notes,
    sync_priorities_to_obsidian,
    write_priorities,
)
from .tools.priority_tools import (
    compute_priorities,
    explain_priority,
    get_ready_to_work,
)

load_dotenv()

SYSTEM_PROMPT = """You are a research question strategist helping to prioritize research work.

Your goal is to help the user identify the highest-value questions to answer next.
You have access to a knowledge graph of research questions and their dependencies.

## Your Capabilities

1. **Query the graph**: See current questions, dependencies, and their status
2. **Compute priorities**: Calculate which questions are most valuable to answer
3. **Explain reasoning**: Describe why a question has high/low priority
4. **Manage questions**: Add new questions, mark answered, create dependencies
5. **Integrate with Obsidian**: Read notes for context, write priorities to vault

## Priority Factors

Questions are prioritized based on:
- **Entropy**: How uncertain is the answer? (higher = more valuable to investigate)
- **Centrality**: How structurally important is this question? (bridges different areas)
- **Blocking**: How many other questions depend on this one?

## Guidelines

- Always explain your reasoning when recommending questions
- When asked "what should I work on", compute priorities and explain the top choice
- Consider dependencies - don't suggest questions whose prerequisites aren't done
- Be concise but thorough in explanations
"""


def create_questDiscov_agent(model: Optional[str] = None):
    """Create the LangGraph agent with all tools.

    Args:
        model: Optional model name (default: from env or gemini-2.0-flash-exp)

    Returns:
        LangGraph agent
    """
    model_name = model or os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")

    llm = ChatGoogleGenerativeAI(
        model=model_name,
        temperature=0,
    )

    tools = [
        # Graph tools
        query_questions,
        query_dependencies,
        add_question,
        add_dependency,
        mark_answered,
        get_graph_stats,
        # Priority tools
        compute_priorities,
        get_ready_to_work,
        explain_priority,
        # Obsidian tools
        read_note,
        search_notes,
        write_priorities,
        sync_priorities_to_obsidian,
    ]

    agent = create_react_agent(
        llm,
        tools,
        state_modifier=SYSTEM_PROMPT,
    )

    return agent


async def run_agent(query: str, model: Optional[str] = None) -> str:
    """Run the agent with a query and return the response.

    Args:
        query: User query
        model: Optional model override

    Returns:
        Agent's response text
    """
    agent = create_questDiscov_agent(model)

    result = await agent.ainvoke({
        "messages": [HumanMessage(content=query)]
    })

    # Extract final response
    messages = result.get("messages", [])
    if messages:
        return messages[-1].content
    return "No response from agent"


def run_agent_sync(query: str, model: Optional[str] = None) -> str:
    """Synchronous wrapper for run_agent."""
    import asyncio
    return asyncio.run(run_agent(query, model))
