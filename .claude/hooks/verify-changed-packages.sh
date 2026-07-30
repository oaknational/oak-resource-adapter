#!/usr/bin/env sh
# Stop: lints and type-checks the packages this branch changes.
# Same checks as CI, but only for the changed packages so it stays quick. A
# failure goes back to Claude to fix before it finishes.
set -u

input="$(cat)"

# Claude is already fixing a failure this hook reported. Blocking again loops.
if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

root="${CLAUDE_PROJECT_DIR:-.}"
cd "$root" || exit 0

# Nothing installed yet. Silence would look like a pass, hence the message.
if [ ! -x node_modules/.bin/turbo ]; then
  echo '{"systemMessage":"type-check/lint hook skipped: node_modules/.bin/turbo is missing (run pnpm install)."}'
  exit 0
fi

# The base is main, or the working tree if main has not been fetched.
base=origin/main
git rev-parse --verify --quiet "$base" >/dev/null 2>&1 || base=HEAD

if output="$(node_modules/.bin/turbo run type-check lint --filter="...[$base]" --output-logs=errors-only 2>&1)"; then
  exit 0
fi

printf 'type-check or lint failed for the packages this branch changes. Fix these before finishing:\n\n%s\n' "$output" >&2
exit 2
