---
description: Review a diff for surplus comments and documentation
argument-hint: "[PR number, branch or path — defaults to the diff against origin/main]"
allowed-tools: Bash(git diff *), Bash(git log *), Bash(git merge-base *), Bash(gh pr diff *), Bash(gh pr view *), Read, Grep, Glob
---

Review the comments, docstrings and Markdown in $ARGUMENTS. With no argument,
review the diff against `origin/main`.

Judge them against `docs/COMMENTS_AND_DOCUMENTATION.md`, reading it first if it
is not already in context. Stay in scope: ignore logic, naming, types and test
coverage unless a comment claims something the code does not actually do.

Report, in this order:

1. **Comments that are wrong or out of date.** These are correctness problems,
   not style, so they come first.
2. **Comments that should go.** Give the file and line, quote the comment, and
   name which rule it breaks — restates the code, justifies the change,
   conversation residue, records history, repeats the signature, makes a value
   judgement, guards a speculative edge case, or explains the self-evident.
3. **Documentation that should go or move.** A new document with no reader, or
   one restating the code, the schema or the `package.json` scripts.

For each, give the replacement: usually deletion, occasionally a shorter
comment. Quote the exact text to delete so the fix is mechanical.

Where a comment is load-bearing — a real upstream workaround, a wire format, an
ordering requirement — say so and leave it. Being able to defend the comments
that stay is the point.

Judge only what the diff adds or changes. Do not sweep untouched files unless a
change made an existing comment wrong.

If nothing needs changing, say so in one line. Do not pad the report to look
thorough.
