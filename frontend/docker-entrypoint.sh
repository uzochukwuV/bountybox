#!/bin/sh
# Runs from nginx's /docker-entrypoint.d before the server starts (the nginx
# image sources every *.sh there). Turns the container's VITE_* environment
# variables into /usr/share/nginx/html/env.js, which index.html loads and
# src/lib/env.js reads as window.__ENV__.
set -eu

OUT=/usr/share/nginx/html/env.js
KEYS="VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_SUPABASE_BUCKET VITE_PRIVY_APP_ID VITE_PRIVY_SESSION_URL VITE_BOUNTYBOARD_ADDRESS"

json_escape() {
  # Escape backslash and double-quote for a JSON string.
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

{
  printf 'window.__ENV__ = {'
  first=1
  for key in $KEYS; do
    eval "value=\${$key:-}"
    [ -z "$value" ] && continue
    [ "$first" -eq 1 ] || printf ','
    first=0
    printf '"%s":"%s"' "$key" "$(json_escape "$value")"
  done
  printf '};\n'
} > "$OUT"

# nginx workers run as an unprivileged user and must be able to read this.
chmod 0644 "$OUT"

echo "inject-env: wrote $OUT"
