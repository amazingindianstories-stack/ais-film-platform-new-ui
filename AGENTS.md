# AIS Film Platform - Codex Guidelines

## Required Tools — MemPalace & HeadRoom

Both are installed and registered as MCP servers. **Use them every session — non-negotiable.**

### MemPalace (persistent memory)
- **MCP server**: `mempalace-mcp` (project-level, stdio)
- **Palace**: `ais_film_platform_new_ui` — 607 drawers mined from project files
- **Config**: `mempalace.yaml` at project root
- **Use for**: Searching project context, storing/recalling decisions, cross-session memory
- **Key commands**: `mempalace search "query"`, `mempalace mine .`, `mempalace status`
- **MCP tools**: Use `mcp__mempalace__*` tools to search, store, and recall context during sessions

### HeadRoom (context compression)
- **MCP server**: `headroom mcp serve` (global, stdio)
- **Use for**: Compressing large tool outputs, reducing token usage, preserving context budget
- **MCP tools**: `headroom_compress` (compress content), `headroom_retrieve` (restore original), `headroom_stats` (session savings)
- **Proxy mode** (optional): `headroom proxy --port 8787` then `ANTHROPIC_BASE_URL=http://127.0.0.1:8787 Codex`

### Integration Rules
- At session start: check MemPalace for relevant context with `mempalace search`
- Use HeadRoom to compress large file reads or tool outputs before processing
- Before closing: save important decisions/context to MemPalace
- On long sessions: run `headroom_stats` to monitor token budget

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to tasks/todo.md with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to tasks/todo.md
6. **Capture Lessons**: Update tasks/lessons.md after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
