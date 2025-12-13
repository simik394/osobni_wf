# Project Management Agent

## Vision

Personal project management should be **frictionless, adaptive, and context-aware**. Unlike corporate project management tools that impose rigid structures, a personal project manager should mold itself to how you *actually* work—capturing ideas when inspiration strikes, resurfacing relevant context when you return after weeks of absence, and keeping everything connected without demanding constant curation.

### Core Principles

#### 1. Zero-Friction Capture
- **Thought-speed input**: Capturing a task or idea should take seconds, not minutes of form-filling
- **Flexible formats**: Accept voice notes, quick text, screenshots, links—whatever is fastest in the moment
- **Smart defaults**: Infer project context from where/when/how something was captured

#### 2. Intelligent Resurfacing
- **Context restoration**: When returning to a project after days or weeks, automatically present the state you left it in—what was in progress, what was blocking, what was next
- **Proactive reminders**: Surface relevant tasks based on location, time, energy level, and available tools
- **Connection mapping**: Show how current work relates to past decisions and future goals

#### 3. Adaptive Structure
- **Emergent organization**: Projects should be able to start as a single note and gradually gain structure as they grow
- **Fluid hierarchy**: Move tasks between projects, merge projects, split them—without losing history
- **Personal vocabulary**: Learn your naming conventions, tags, and categorization patterns

#### 4. Honest Progress Tracking
- **Realistic timelines**: Track actual time spent vs. estimates to improve future predictions
- **Energy accounting**: Recognize that not all hours are equal—some tasks need focus, others can fill gaps
- **Momentum preservation**: Identify what helps you maintain flow and optimize for it

### What It Should Feel Like

Imagine a trusted assistant who:
- Remembers everything you've told them about your projects
- Knows when to remind you and when to stay quiet
- Can brief you on any project in 30 seconds after months of inactivity
- Never judges abandoned projects but helps you consciously close or archive them
- Celebrates small wins without being annoying about it

### Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | Better Approach |
|--------------|--------------|-----------------|
| **Over-structuring** | Forces you to maintain a system instead of doing work | Let structure emerge from actual usage |
| **Guilt-driven reminders** | Creates anxiety, leads to notification blindness | Positive framing, respect for your choices |
| **All-or-nothing tracking** | Abandoned the moment you fall behind | Graceful degradation, easy re-engagement |
| **Feature bloat** | Tool becomes harder to use than the work itself | Progressive disclosure, sensible defaults |

---

## Scope

This agent focuses on:
- **Personal projects**: Side projects, learning goals, creative endeavors, life admin
- **Individual workflows**: Not team collaboration (though export/sharing is valuable)
- **Long-term continuity**: Projects that span weeks to years, not one-off tasks

## Integration Points

The project agent should integrate with:
- **Research agent** (`rsrch`): Link research sessions to project contexts
- **Knowledge base**: Connect projects to relevant notes and references
- **Calendar/Time**: Understand availability and deadlines
- **File system**: Track associated files, repos, and artifacts
