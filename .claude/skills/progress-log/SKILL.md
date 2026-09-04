---
name: progress-log
description: "Tracks and recalls progress on anything the user is working toward across sessions: topics learned, job search stages, project milestones, interview prep, or any multi-step effort. Maintains a dated journal file ({YourName}_journal.md) as a running diary, grouped by date, with precise, concise entries. Use whenever the user completes a meaningful step worth logging, or asks about progress or history -- phrases like 'what have I learned so far', 'where did I leave off', 'log this', 'update the journal', 'how far along am I', or 'what's my status on X'. Also apply automatically at the end of a session handled by another skill, such as learning-new-topics, that hands off here. Each run checks the journal for what's already captured and appends only what's new."
---

# Progress Log

## What this does
Keeps a running, dated journal of progress on anything ongoing: topics learned, job search milestones, project phases, interview prep. It reads like a personal diary: entries grouped under a date heading, precise and short, no padding.

## The journal file
- **Naming**: `{YourName}_journal.md` — the `{Name}_journal.md` pattern keeps journals from colliding when a project's knowledge base is shared across multiple people, since each person's copy of this skill uses their own name instead of a generic `journal.md`.
- **Whose name goes there**: the first time this skill runs for someone, settle on a name once (their given name is enough — ask if it isn't obvious from context) and reuse it consistently for every journal entry after that. Don't re-ask on every run.
- **Location**: `/mnt/user-data/outputs/{YourName}_journal.md` in claude.ai chat, or the project's working directory in Claude Code/Cowork. Treat it as a live file, not scratch — read and append to it directly there.
- **Structure** — one `## YYYY-MM-DD` heading per day, most recent date at the top, with each entry as a single concise bullet underneath:
  ```
  ## 2026-09-04
  - **Learning — Playwright locators**: covered auto-waiting & role-based selectors; solid grasp. Next: parallel execution.
  - **Job search — Acme Corp**: submitted application for SDET II role.
  ```
- **Precise and concise.** One line per entry. Name the specific thing — "covered Playwright auto-wait vs explicit wait," not "worked on testing." Cut anything that isn't the fact itself.

## Finding the current journal
Before writing, look for an existing journal to continue rather than starting a new one:
1. Check the working directory / `/mnt/user-data/outputs/{YourName}_journal.md` for a copy already in play this session.
2. Check uploaded files or project knowledge for a `{YourName}_journal.md` carried over from elsewhere — ignore any other `{Name}_journal.md` files that belong to someone else.
3. If none exists, start a fresh file with today's heading.

## Updating it
Every time this skill runs:
1. Read the journal's most recent entries (today's section, if present) to see what's already captured.
2. Check the current session for what's happened that isn't reflected yet — new topics, decisions, milestones.
3. Append only that delta as new bullets under today's heading (create the heading if it's not there yet, at the top of the file). Never re-log something already recorded.
4. Save the file in place and present it, so the user always has the current version visible.

## Where this actually persists
Be upfront and accurate about this rather than implying it's automatic everywhere:
- **Claude Code or Cowork, pointed at a real project directory** (e.g. alongside an existing repo): genuine zero-friction persistence. `{YourName}_journal.md` lives on disk like any other project file — no uploads, no re-attaching, ever. The unique name also means it won't collide with a teammate's own file in a shared repo.
- **claude.ai chat, via a Project**: Claude reads `{YourName}_journal.md` from project knowledge automatically in every chat there, and the unique name means it coexists safely with any teammates' own `{TheirName}_journal.md` in the same shared project. Claude still can't write back to project knowledge directly — that's a known platform limitation — so the user re-uploads the updated file into the project once per update; friction drops from "every conversation" to "once per update," not to zero.
- **claude.ai chat, outside a Project**: no automatic carryover at all; re-attach `{YourName}_journal.md` at the start of each new conversation.

Mention this once if it's relevant to how the user is working — don't repeat it every time.

## Recalling progress
When asked about progress ("what have I learned," "where did I leave off," "what's my status on X"):
1. If `{YourName}_journal.md` is available this session, read it directly — it's the source of truth.
2. If not, fall back to conversation_search (and recent_chats for "recently") with keywords from the category/topic.
3. Summarize grouped by date or category rather than dumping raw entries. If nothing turns up, say so plainly and ask what they remember covering.

## Related
For a combined view across multiple people's journals in the same project, see the `journal-overview` skill — it reads every `{Name}_journal.md` on demand rather than just this one.

## Style
Short and plain. This skill should be nearly invisible most of the time — a couple of bullets appended at the end of something else, not a production of its own.
