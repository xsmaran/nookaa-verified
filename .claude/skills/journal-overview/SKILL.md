---
name: journal-overview
description: "Collates multiple people's journal files (each named {Name}_journal.md, from the progress-log skill) in the current project into a single combined overview. Use when the user explicitly asks for a project or team overview, wants to see who's done what, asks to collate, combine, or summarize the journals, or asks a cross-person progress question -- phrases like 'give me an overview', 'collate the journals', 'who's done what this week', 'project status', 'team progress', or 'summarize everyone's journal'. This is a deliberate, on-demand report the user asks for -- unlike progress-log's own automatic per-entry logging, don't run this speculatively just because a journal file is present."
---

# Journal Overview

## What this does
Reads every `{Name}_journal.md` file in the current project (the naming convention from the progress-log skill) and produces one combined overview. This is a deliberate report the user asks for — not something that runs automatically just because journal files exist.

## Finding the journals
1. List files in the working directory (or project knowledge, in claude.ai chat) matching `*_journal.md`.
2. Read each one. If a file follows the progress-log format (`## YYYY-MM-DD` headings, one bullet per entry), parse it directly. If a file doesn't match that structure, note it and skip rather than guessing.

## Building the overview
Default to date-first, most recent at the top, each entry tagged with whose journal it came from:
```
## 2026-09-04
- **Bharath** — Learning: covered Playwright locators; solid grasp.
- **Priya** — Job search: submitted application, SDET II role.
```
If asked for a per-person view instead ("what has Priya been doing"), group by person instead — date-first is the default, not the only option.

## Keep it a summary, not a copy
Don't just concatenate the files. Skip exact duplicate lines, compress anything verbose back down to one line, and call out if someone's journal hasn't been updated in a while — a gap is itself useful information for an overview like this.

## When journals aren't available
If no `*_journal.md` files turn up (nothing in a claude.ai Project, nothing uploaded), say so plainly and ask the user to point to or attach the relevant files rather than fabricating an overview.

## Style
A deliberate report, not a background action — a bit more structure than progress-log's own entries is fine (headings, maybe a one-line "at a glance" summary up top), but stay factual. No commentary or opinions about anyone's pace or performance.
