"""Intent detection logic for the Proj agent.

Classifies user input into specific intents (capture, query, update, review, etc.)
using an LLM.
"""

from typing import Literal
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

class IntentClassification(BaseModel):
    """Classification of user intent."""
    intent: Literal["capture", "triage", "resume", "review", "estimate", "respond"] = Field(
        ..., description="The primary intent of the user."
    )
    confidence: float = Field(..., description="Confidence score between 0 and 1.")
    reasoning: str = Field(..., description="Brief explanation of why this intent was chosen.")

INTENT_PROMPT = """You are a personal project management assistant's intent classifier.
Analyze the user's message and categorize it into one of the following intents:

1. **capture**: The user wants to add a new task, idea, note, or item to their inbox or project.
   Examples: "Remind me to call Mom", "Add buy milk to groceries", "New idea for project X", "Note: this is important".
2. **triage**: The user wants to process their inbox or organize items.
   Examples: "Check inbox", "Process my notes", "Triage tasks", "What's in the inbox?".
3. **resume**: The user wants to restore context or continue working on a project.
   Examples: "Where was I?", "Resume project X", "Context for my last task", "Catch me up".
4. **review**: The user wants to see their progress, priorities, or a summary.
   Examples: "What should I do today?", "Weekly review", "Show my priorities", "Status report".
5. **estimate**: The user wants to estimate task durations or sync estimates.
   Examples: "Estimate my tasks", "Update time estimates", "Sync estimates".
6. **respond**: General conversation, greetings, or questions not covered above.
   Examples: "Hi", "Help", "Who are you?", "Thank you".

Output the intent, confidence, and reasoning.
"""

from functools import lru_cache

@lru_cache(maxsize=1)
def get_intent_detector():
    """Get the intent detection chain."""
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)
    structured_llm = llm.with_structured_output(IntentClassification)

    prompt = ChatPromptTemplate.from_messages([
        ("system", INTENT_PROMPT),
        ("human", "{input}"),
    ])

    return prompt | structured_llm

def detect_intent(message: str) -> IntentClassification:
    """Detect intent from a user message."""
    detector = get_intent_detector()
    try:
        return detector.invoke({"input": message})
    except Exception as e:
        # Fallback for errors
        print(f"[IntentDetector] Error: {e}")
        return IntentClassification(intent="respond", confidence=0.0, reasoning="Error in detection")
