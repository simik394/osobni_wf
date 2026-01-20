# Task Capture Workflow

## Decision Logic: Goal vs. Step

When capturing a new item, decide whether it is a **Goal** or a **Step** based on the following criteria:

### Create a **Goal** when:
- It represents a **high-level objective** or a desired state (the "What").
- It is **ambitious** or long-term.
- It can be broken down into smaller sub-goals or steps.
- It defines a direction or priority (`priority`, `ambitiousnes`).
- Example: "Implement a new feature", "Learn a new language".

### Create a **Step** when:
- It represents a **concrete action** or task (the "How").
- It has a specific **duration** (`duration_exp`).
- It has clear inputs and outputs (`requires`, `produces`).
- It supports or enables a goal or another step (`supports`, `enables`).
- It is actionable immediately or has specific constraints (`urgent`, `important`).
- Example: "Write function X", "Read chapter 1".

## Workflow
1.  **Identify the outcome.**
2.  If it's a broad outcome, create a **Goal** using the `goal.md` template.
3.  If it's a specific action to achieve that outcome, create a **Step** using the `step.md` template.
4.  Link Steps to Goals using `supports` or `enables` fields, or `is_substep_of`.
