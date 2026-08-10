#!/usr/bin/env bash
#
# gen-langs.sh — builds assets/langs.svg from the primary language of every
# non-fork public repo on the account.
#
# Why repo counts and not bytes: GitHub's byte-based language stats count the
# raw file size, and .ipynb files embed their own outputs (base64 images,
# rendered dataframes). Counting bytes therefore reports ~90% "Jupyter
# Notebook" for this account, which describes the file format rather than the
# work. Counting repositories is boring and honest.
#
# No third-party card service, so nothing can rate-limit, 402 or 503 the
# profile. refresh-stats.yml re-runs this weekly.
#
#   scripts/gen-langs.sh                # unauthenticated (60 req/hr)
#   GH_TOKEN=... scripts/gen-langs.sh   # authenticated, used in CI

set -euo pipefail

USER="${GH_USER:-EsmeAbha}"
OUT="${OUT:-assets/langs.svg}"
TOP_N="${TOP_N:-6}"

cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p "$(dirname "$OUT")"

auth=()
[ -n "${GH_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GH_TOKEN")

# One request gets everything: name, fork flag and primary language per repo.
if ! payload="$(curl -sSf "${auth[@]}" -H 'Accept: application/vnd.github+json' \
     "https://api.github.com/users/$USER/repos?per_page=100&type=owner")"; then
  echo "ERROR: could not list repositories for $USER." >&2
  curl -s https://api.github.com/rate_limit | tr -d ' {}"' | tr ',' '\n' \
    | grep -E '^(limit|remaining|reset):' | head -3 | sed 's/^/  /' >&2
  echo "Re-run with a token:  GH_TOKEN=ghp_... scripts/gen-langs.sh" >&2
  exit 1
fi

# Pair on "full_name", never "name" — every repo object also nests a license
# object with its own "name" ("MIT License"), which silently misaligns any
# pairing done on "name" and yields garbage.
# Do NOT strip spaces from the payload before parsing: that would also strip
# them from inside the values, turning "Jupyter Notebook" into "JupyterNotebook".
# Tolerate optional whitespace in the patterns instead.
langs="$(printf '%s' "$payload" | tr ',' '\n' | awk -F'"' '
  /"full_name" *:/ { own = 0; have = 0 }
  /"fork" *: *false/ { own = 1 }
  /"language" *:/  { if (own && !have) { have = 1; print ($0 ~ /: *null/) ? "Other" : $4 } }
')"

repo_total="$(printf '%s\n' "$langs" | grep -c . || true)"
[ "${repo_total:-0}" -gt 0 ] || { echo "no repositories found for $USER" >&2; exit 1; }

# $2 alone would truncate multi-word names ("Jupyter Notebook" -> "Jupyter"),
# so take the count off the front and keep the whole remainder as the name.
totals="$(printf '%s\n' "$langs" | grep -v '^Other$' | sort | uniq -c | sort -rn \
  | awk '{c = $1; $1 = ""; sub(/^ +/, ""); print c "\t" $0}')"
counted="$(printf '%s\n' "$totals" | awk -F'\t' '{s+=$1} END {print s+0}')"
[ "$counted" -gt 0 ] || { echo "no language data" >&2; exit 1; }

colour() {
  case "$1" in
    TypeScript)        echo "#3178C6" ;;
    Python)            echo "#3572A5" ;;
    JavaScript)        echo "#F1E05A" ;;
    PHP)               echo "#4F5D95" ;;
    R)                 echo "#198CE7" ;;
    Jupyter*)          echo "#DA5B0B" ;;
    CSS)               echo "#663399" ;;
    HTML)              echo "#E34C26" ;;
    Java)              echo "#B07219" ;;
    C++)               echo "#F34B7D" ;;
    C\#)               echo "#178600" ;;
    C)                 echo "#555555" ;;
    Shell)             echo "#89E051" ;;
    Dart)              echo "#00B4AB" ;;
    Kotlin)            echo "#A97BFF" ;;
    *)                 echo "#7F77DD" ;;
  esac
}

W=760; BAR_Y=40; BAR_H=13; BAR_W=700; PAD=30
rows=$(( (TOP_N + 2) / 3 ))
H=$(( 108 + rows * 28 ))

{
  printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-label="repositories by primary language">\n' "$W" "$H" "$W" "$H"
  printf '  <title>%s — public repositories by primary language</title>\n' "$USER"
  printf '  <defs><clipPath id="round"><rect x="%d" y="%d" width="%d" height="%d" rx="6.5"/></clipPath></defs>\n' "$PAD" "$BAR_Y" "$BAR_W" "$BAR_H"
  printf '  <rect width="100%%" height="100%%" rx="10" fill="#0A0A0F"/>\n'
  printf '  <rect x="0.5" y="0.5" width="%d" height="%d" rx="10" fill="none" stroke="#7F77DD" stroke-opacity="0.25"/>\n' "$((W-1))" "$((H-1))"
  printf '  <text x="%d" y="26" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" letter-spacing="2" fill="#CECBF6">PUBLIC REPOS BY PRIMARY LANGUAGE</text>\n' "$PAD"

  printf '  <g clip-path="url(#round)">\n'
  printf '    <rect x="%d" y="%d" width="%d" height="%d" fill="#1a1926"/>\n' "$PAD" "$BAR_Y" "$BAR_W" "$BAR_H"
  off=0; i=0
  while IFS=$'\t' read -r n lang; do
    [ -z "${lang:-}" ] && continue
    i=$((i+1)); [ "$i" -gt "$TOP_N" ] && break
    seg=$(awk -v b="$n" -v t="$counted" -v w="$BAR_W" 'BEGIN{printf "%.2f", b*w/t}')
    x=$(awk -v p="$PAD" -v o="$off" 'BEGIN{printf "%.2f", p+o}')
    printf '    <rect x="%s" y="%d" width="0" height="%d" fill="%s">\n' "$x" "$BAR_Y" "$BAR_H" "$(colour "$lang")"
    printf '      <animate attributeName="width" values="0;%s" dur="0.9s" begin="%ss" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>\n' \
      "$seg" "$(awk -v i="$i" 'BEGIN{printf "%.2f", 0.15+i*0.09}')"
    printf '    </rect>\n'
    off=$(awk -v o="$off" -v s="$seg" 'BEGIN{printf "%.2f", o+s}')
  done <<< "$totals"
  printf '  </g>\n'

  ly=82; i=0
  while IFS=$'\t' read -r n lang; do
    [ -z "${lang:-}" ] && continue
    i=$((i+1)); [ "$i" -gt "$TOP_N" ] && break
    pct=$(awk -v b="$n" -v t="$counted" 'BEGIN{printf "%.0f", 100*b/t}')
    col=$(( (i-1) % 3 )); row=$(( (i-1) / 3 ))
    x=$(( PAD + col * 235 )); y=$(( ly + row * 28 ))
    printf '  <g opacity="0">\n'
    printf '    <animate attributeName="opacity" values="0;1" dur="0.5s" begin="%ss" fill="freeze"/>\n' "$(awk -v i="$i" 'BEGIN{printf "%.2f", 0.5+i*0.07}')"
    printf '    <circle cx="%d" cy="%d" r="5" fill="%s"/>\n' "$((x+5))" "$((y-4))" "$(colour "$lang")"
    printf '    <text x="%d" y="%d" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" fill="#CECBF6">%s</text>\n' "$((x+18))" "$y" "$lang"
    printf '    <text x="%d" y="%d" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" fill="#8F8AB8">%s repo%s</text>\n' \
      "$((x+178))" "$y" "$n" "$([ "$n" -eq 1 ] && echo '' || echo 's')"
    printf '  </g>\n'
  done <<< "$totals"

  printf '  <text x="%d" y="%d" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="10" fill="#565273">generated from the GitHub API · %s public repos</text>\n' \
    "$PAD" "$((H-14))" "$repo_total"
  printf '</svg>\n'
} > "$OUT"

echo "wrote $OUT  ($repo_total public repos, $counted with a detected language)"
printf '%s\n' "$totals" | head -"$TOP_N" | awk -F'\t' -v t="$counted" '{printf "  %-20s %2d repos  %4.0f%%\n", $2, $1, 100*$1/t}'
