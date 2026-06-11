#!/bin/bash
# aws-sdk-proxy-lambda.sh
thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app="$(basename "$thisDir")"
# ###########################################################################################
# sync lambda zip to s3
lambda() {(
  set -euo pipefail
  # #############################################################
  cd "$thisDir"
  bun run build && bun run dist
  # sha256sum dist/*.zip
  # #############################################################
  aws_load_profile
  aws s3 sync "$thisDir/dist/" "s3://$KN_CBS_BUCKET/apps/$app/dist/" --delete
)}
# ###########################################################################################
# ###########################################################################################
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  func="${1:-lambda}"
  shift
  "$func" "$@"
fi