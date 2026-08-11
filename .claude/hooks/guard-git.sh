#!/usr/bin/env sh
# PreToolUse (Bash): blocks --no-verify, and commits on main.
# --no-verify skips commitlint and the gitleaks scan, so it is not allowed.
set -u

cmd="$(jq -r '.tool_input.command // empty')"
[ -n "$cmd" ] || exit 0

# The first non-option word after `git` is the subcommand. Matching that rather
# than the whole string keeps `git log --grep=commit`, and any command that
# merely mentions git, out of the way.
subcommand="$(printf '%s\n' "$cmd" | awk '{
  for (i = 1; i <= NF; i++) {
    if ($i != "git") continue
    for (j = i + 1; j <= NF; j++) {
      if ($j == "-C" || $j == "-c" || $j == "--git-dir" || $j == "--work-tree") { j++; continue }
      if ($j ~ /^-/) continue
      print $j
      exit
    }
  }
}')"

is_commit=false
is_push=false
case "$subcommand" in
commit) is_commit=true ;;
push) is_push=true ;;
*) exit 0 ;;
esac

# -n means --no-verify on commit, but --dry-run on push, so it only counts as a
# bypass for commits.
if printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])--no-verify([[:space:]]|$)' ||
  { [ "$is_commit" = true ] && printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])-n([[:space:]]|$)'; }; then
  echo "Blocked: --no-verify skips .husky/commit-msg (commitlint) and .husky/pre-push (gitleaks secret scan). Run the command without it and fix whatever the hook reports." >&2
  exit 2
fi

if [ "$is_commit" = true ]; then
  branch="$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null || true)"
  case "$branch" in
  main | master | production)
    echo "Blocked: refusing to commit on '$branch'. Create a feat/, fix/ or chore/ branch first, then commit." >&2
    exit 2
    ;;
  esac
fi

exit 0
