#!/usr/bin/env sh
# PostToolUse (Edit|Write): formats the file Claude just wrote.
# CI only checks formatting, so fixing it here keeps it out of the pull request.
set -u

root="${CLAUDE_PROJECT_DIR:-.}"
prettier="$root/node_modules/.bin/prettier"

file="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')"

# No path, or the file sits outside the repo.
[ -n "$file" ] || exit 0
case "$file" in
"$root"/*) ;;
*) exit 0 ;;
esac

# Nothing installed yet, so there is no prettier to run.
[ -x "$prettier" ] || exit 0

cd "$root" || exit 0

# --ignore-unknown skips files prettier cannot read, such as .sql and these
# scripts. Running from the root is what applies .prettierignore.
"$prettier" --ignore-unknown --write "$file" >/dev/null 2>&1 || true
