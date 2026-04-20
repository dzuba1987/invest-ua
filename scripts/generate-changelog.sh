#!/bin/bash
# Generate a changelog from recent git commits for the admin panel.
# Usage: ./scripts/generate-changelog.sh [--days 7] [--author you@example.com] [--max 7]

set -e

DAYS=7
AUTHOR=""
MAX=7

while [ $# -gt 0 ]; do
  case "$1" in
    --days) DAYS="$2"; shift 2 ;;
    --author) AUTHOR="$2"; shift 2 ;;
    --max) MAX="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SKIP_REGEX='^(merge|wip|bump|chore|style|test|revert|format)|typo|cache[[:space:]]*bust|sw[[:space:]]*cache'
# Additional skip patterns for the user-facing summary (more aggressive).
SUMMARY_SKIP='csp|dompurify|shared\s*globals|firebase\s*init|playwright|e2e\s*tests|^split\b|^move\b|subtitle|icons|readme|help\s*to\s*v|Update help'
PREFIX_REGEX='^(feat|fix|refactor|perf|docs|ci|build|chore|style)(\([^)]*\))?:[[:space:]]*'

author_flag=""
[ -n "$AUTHOR" ] && author_flag="--author=$AUTHOR"

SEP='__COMMIT_SEP__'
FIELD='__FIELD__'

raw=$(git log --since="$DAYS days ago" $author_flag --date=short \
  --pretty=format:"%h${FIELD}%ad${FIELD}%s${FIELD}%b${SEP}")

IFS=$'\n'
blocks=()
current=""
while IFS= read -r line || [ -n "$line" ]; do
  current+="$line"$'\n'
  if [[ "$current" == *"$SEP"* ]]; then
    blocks+=("${current%$SEP*}")
    current="${current##*$SEP}"
  fi
done <<< "$raw"
[ -n "${current// }" ] && blocks+=("$current")

clean_subject() {
  local s="$1"
  s=$(echo "$s" | sed -E "s/$PREFIX_REGEX//I")
  s="$(echo "${s:0:1}" | tr '[:lower:]' '[:upper:]')${s:1}"
  echo "$s"
}

# Heuristic translation of common commit-verb patterns into Ukrainian user-friendly phrasing.
humanize() {
  local s="$1"
  s=$(echo "$s" | sed -E 's/^Add /Додано /I')
  s=$(echo "$s" | sed -E 's/^Fix /Виправлено /I')
  s=$(echo "$s" | sed -E 's/^Update /Оновлено /I')
  s=$(echo "$s" | sed -E 's/^Improve /Покращено /I')
  s=$(echo "$s" | sed -E 's/^Remove /Видалено /I')
  s=$(echo "$s" | sed -E 's/^Rename /Перейменовано /I')
  s=$(echo "$s" | sed -E 's/^Show /Показ /I')
  s=$(echo "$s" | sed -E 's/^Major /Велике /I')
  echo "$s"
}

filtered_count=0
skipped_count=0

printf "\n"
SEPLINE=$(printf '%.0s─' {1..78})

results=()
for block in "${blocks[@]}"; do
  block="${block#$'\n'}"
  block="${block%$'\n'}"
  [ -z "$block" ] && continue

  hash="${block%%$FIELD*}"
  rest="${block#*$FIELD}"
  date="${rest%%$FIELD*}"
  rest="${rest#*$FIELD}"
  subject="${rest%%$FIELD*}"
  body="${rest#*$FIELD}"

  if echo "$subject" | grep -iqE "$SKIP_REGEX"; then
    skipped_count=$((skipped_count + 1))
    continue
  fi

  if [[ "$subject" == *"; "* ]]; then
    title="${subject%%; *}"
    extra="${subject#*; }"
  else
    title="$subject"
    extra=""
  fi

  title=$(clean_subject "$title")
  [ -n "$extra" ] && extra=$(clean_subject "$extra").

  descr=""
  [ -n "$extra" ] && descr="$extra"
  body_trimmed=$(echo "$body" | sed '/^$/d')
  if [ -n "$body_trimmed" ]; then
    [ -n "$descr" ] && descr+=$'\n'
    descr+="$body_trimmed"
  fi

  filtered_count=$((filtered_count + 1))
  results+=("$hash|$date|$title|$descr")
done

if [ $filtered_count -eq 0 ]; then
  echo "Знайдено 0 змістовних комітів за останні $DAYS днів."
  [ $skipped_count -gt 0 ] && echo "(Відфільтровано $skipped_count службових комітів.)"
  exit 0
fi

echo "Знайдено $filtered_count комітів за останні $DAYS днів:"
echo ""
echo "$SEPLINE"

i=0
for r in "${results[@]}"; do
  i=$((i + 1))
  hash="${r%%|*}"; rest="${r#*|}"
  date="${rest%%|*}"; rest="${rest#*|}"
  title="${rest%%|*}"; descr="${rest#*|}"

  printf "\n#%d  [%s  %s]\n" "$i" "$date" "$hash"
  echo "Заголовок:"
  echo "  $title"
  if [ -n "$descr" ]; then
    echo "Опис:"
    echo "$descr" | while IFS= read -r ln; do
      [ -n "$ln" ] && echo "  $ln"
    done
  fi
  echo "$SEPLINE"
done

# ── Ready-to-paste summary for newsletter ────────────────────────────────────

summary_items=()
for r in "${results[@]}"; do
  rest="${r#*|}"; rest="${rest#*|}"
  title="${rest%%|*}"
  if echo "$title" | grep -iqE "$SUMMARY_SKIP"; then
    continue
  fi
  # Take only what's before the first colon or em dash for conciseness
  short="${title%%:*}"
  short="${short%%—*}"
  short=$(echo "$short" | sed -E 's/[[:space:]]+$//')
  short=$(humanize "$short")
  summary_items+=("$short")
  [ ${#summary_items[@]} -ge "$MAX" ] && break
done

if [ ${#summary_items[@]} -gt 0 ]; then
  echo ""
  echo "$SEPLINE"
  echo "  ГОТОВО ДО КОПІЮВАННЯ В АДМІНКУ (розсилка)"
  echo "$SEPLINE"
  echo ""
  echo "Тема листа:"
  echo "  Invest UA — оновлення"
  echo ""
  echo "Текст повідомлення (HTML) — скопіюйте блок нижче цілком:"
  echo ""
  echo "───── SNIP ─────"
  echo "<p>Вітаємо! В Invest UA зʼявились нові можливості:</p>"
  echo "<ul>"
  for item in "${summary_items[@]}"; do
    echo "  <li>${item}</li>"
  done
  echo "</ul>"
  echo "<p>Дякуємо, що користуєтесь Invest UA!</p>"
  echo "───── SNIP ─────"
  echo ""
  echo "Перевірте формулювання перед надсиланням. Відкрийте адмінку → «📝 Список змін» → можна додати окремі пункти з детальнішим описом."
  echo ""
fi
