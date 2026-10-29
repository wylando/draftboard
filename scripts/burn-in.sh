#!/bin/sh
# Runs new and changed Cypress specs several times in a row, so a flaky test fails before it lands
# instead of failing at random later. Expects the app on Cypress's baseUrl (the npm scripts start it).
#   BURN_IN_SPECS  comma-separated specs; default: specs changed since BURN_IN_BASE, plus untracked ones
#   BURN_IN_BASE   default origin/main
#   BURN_IN_RUNS   default 5 (Meta's TestGen-LLM counted a test as flaky unless it passed 5 of 5)
# Only spec files are picked up: a change to cypress/support or cypress.config.ts burns nothing in,
# so name the affected specs in BURN_IN_SPECS for those.
set -eu

runs="${BURN_IN_RUNS:-5}"
case "$runs" in
  '' | *[!0-9]* | 0) echo "burn-in: BURN_IN_RUNS must be a positive number, got '$runs'" >&2; exit 1 ;;
esac

specs="${BURN_IN_SPECS:-}"
if [ -z "$specs" ]; then
  base="${BURN_IN_BASE:-origin/main}"
  # Resolved on its own line: inside the pipeline below a missing ref would pass with nothing burned in.
  merge_base=$(git merge-base "$base" HEAD) || { echo "burn-in: no merge base with $base" >&2; exit 1; }
  specs=$(
    {
      git diff --name-only --diff-filter=AMR "$merge_base" -- 'cypress/e2e/*.cy.ts'
      git ls-files --others --exclude-standard -- 'cypress/e2e/*.cy.ts'
    } | sort -u | paste -sd, -
  )
fi

if [ -z "$specs" ]; then
  echo "burn-in: no new or changed specs"
  exit 0
fi

i=1
while [ "$i" -le "$runs" ]; do
  echo "burn-in: run $i of $runs: $specs"
  env -u ELECTRON_RUN_AS_NODE npx cypress run --spec "$specs"
  i=$((i + 1))
done
