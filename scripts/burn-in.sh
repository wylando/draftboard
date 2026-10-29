#!/bin/sh
# Runs new and changed Cypress specs several times in a row, so a flaky test fails before it lands
# instead of failing at random later. Expects the app on Cypress's baseUrl (the npm scripts start it).
#   BURN_IN_SPECS  comma-separated specs; default: specs changed since BURN_IN_BASE, plus untracked ones
#   BURN_IN_BASE   default origin/main
#   BURN_IN_RUNS   default 5 (Meta's TestGen-LLM counted a test as flaky unless it passed 5 of 5)
set -eu

runs="${BURN_IN_RUNS:-5}"
base="${BURN_IN_BASE:-origin/main}"
specs="${BURN_IN_SPECS:-$(
  {
    git diff --name-only --diff-filter=AMR "$(git merge-base "$base" HEAD)" -- 'cypress/e2e/*.cy.ts'
    git ls-files --others --exclude-standard -- 'cypress/e2e/*.cy.ts'
  } | sort -u | paste -sd, -
)}"

if [ -z "$specs" ]; then
  echo "burn-in: no new or changed specs"
  exit 0
fi

i=1
while [ "$i" -le "$runs" ]; do
  echo "burn-in: run $i of $runs: $specs"
  env -u ELECTRON_RUN_AS_NODE cypress run --spec "$specs"
  i=$((i + 1))
done
