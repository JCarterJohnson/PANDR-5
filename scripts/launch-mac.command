#!/bin/zsh
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  print 'Install Node.js 22.12 or newer from https://nodejs.org, then open this launcher again.'
  read -r '?Press Return to close. '
  exit 1
fi
node scripts/launch.mjs
