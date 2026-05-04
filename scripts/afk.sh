#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

# jq filter to extract streaming text from assistant messages
stream_text='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'

# jq filter to extract final result
final_result='select(.type == "result").result // empty'

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
input_rel="scripts/.afk-input.md"
input_abs="$workspace_dir/$input_rel"

cleanup() {
  rm -f "$input_abs"
}
trap cleanup EXIT

for ((i=1; i<=$1; i++)); do
  tmpfile=$(mktemp)

  issues=$(gh issue list --state open --json number,title,body,comments)
  ralph_commits=$(git log --grep="RALPH" -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No RALPH commits found")
  prompt=$(cat "$(dirname "$0")/prompt.md")

  printf '%s\n\nPrevious RALPH commits:\n%s\n\n%s\n' "$issues" "$ralph_commits" "$prompt" > "$input_abs"

  echo "[afk] iteration $i, input bytes: $(wc -c < "$input_abs")" >&2

  docker sandbox run claude . -- \
    --verbose \
    --print \
    --output-format stream-json \
    "Read $input_rel in this workspace and execute its instructions verbatim." \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")
  rm -f "$tmpfile"

  if [[ "$result" == *"<promise>NO MORE TASKS</promise>"* ]]; then
    echo "Ralph complete after $i iterations."
    exit 0
  fi
done