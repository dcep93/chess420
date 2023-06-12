#!/bin/bash

set -euo pipefail

cd app/src/chess420
printf "const recorded_sha = \`%s\n%s\`;\nexport default recorded_sha;\n" "$(TZ='America/New_York' date)" "$(git log -1)" > recorded_sha.tsx
