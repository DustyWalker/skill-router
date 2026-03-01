---
name: skill-router
description: Dynamic skill recommender with semantic search. Use when the user asks "what skills should I use for X", "how do I do X with my skills", or when you need to find which installed skills/commands/agents/MCP servers apply to a task.
triggers:
  - "what skills should I use"
  - "how do I do X with my skills"
  - "find a skill for"
  - "what tools do I have"
  - "which agent should I use"
  - "recommend a skill"
boundaries:
  - "NOT for: creating new skills (use writing-skills or create-agent-skills)"
  - "NOT for: reviewing skill quality (use skill-reflect)"
  - "NOT for: self-evolution (use godel-evolve)"
---

# Skill Router — Semantic Capability Recommender

Searches **all installed capabilities** using BM25+TF-IDF and recommends the best matches.

## What It Indexes

| Category | Type | Count |
|----------|------|-------|
| Skills | `skill` | ~168 |
| Commands | `cmd` | ~26 |
| Agents | `agent` | ~44 |
| Built-in Subagents | `subagent` | 3 |
| MCP Servers | `mcp` | ~16 |

## How to Use

### Step 1: Run the query

```bash
node {baseDir}/scripts/query.mjs "$ARGUMENTS"
```

If `$ARGUMENTS` is empty, ask the user what they need help with.

### Step 2: Interpret results

Results are ranked by relevance with confidence scores:
- **[HIGH]** — Strong match. Recommend directly.
- **[MED]** — Good match but alternatives exist. Present options.
- **[LOW]** — Weak match. Mention but don't emphasize.

### Step 3: Read the selected skill

For the top recommendation, read its full SKILL.md to understand how to invoke it:

```
Read the file at the Path shown in the results
```

### Step 4: Recommend a sequence

If the task spans multiple phases (think → plan → build → review → ship), present a pipeline:

```
RECOMMENDED CHAIN:
1. [skill] brainstorming → clarify requirements
2. [skill] workflows:plan → create implementation plan
3. [skill] frontend-design → build the component
4. [agent] code-reviewer → review code quality
5. [skill] verification-before-completion → verify it works
```

## Fallback

If `query.mjs` fails (missing index, Node error):

```bash
bash {baseDir}/scripts/index-skills.sh
```

Then analyze the full TSV output manually (v1 behavior).

## Type Reference

| Type | What It Is | How to Use |
|------|-----------|------------|
| `skill` | Reusable prompt/workflow | `Skill("name")` or auto-invoked |
| `cmd` | Slash command | Type `/command-name` |
| `agent` | Specialized subagent | `Agent(subagent_type="source:category/name")` |
| `subagent` | Built-in agent type | `Agent(subagent_type="general-purpose\|Explore\|Plan")` |
| `mcp` | External tool server | Auto-available as `mcp__servername__toolname` |
