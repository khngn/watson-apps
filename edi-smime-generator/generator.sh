#!/bin/bash
thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app="$(basename "$thisDir")"
# ###########################################################################################
clean() {(
  set -euo pipefail
  # #############################################################
  rm -rfv "$thisDir/data/"
)}
# ###########################################################################################
# generate data files
gen() {(
  set -euo pipefail
  local env="${1:-E1}"
  # #############################################################
  ./src/generator.ts "$env"
)}
# ###########################################################################################
# sync lambda zip to s3
lambda() {(
  set -euo pipefail
  # #############################################################
  cd "$thisDir"
  bun run build && bun run dist
  # #############################################################
  aws_load_profile
  aws s3 sync "$thisDir/dist/" "s3://$KN_CBS_BUCKET/apps/$app/dist/" --delete
)}
# ###########################################################################################
# sync data to clipboard s3
data() {(
  set -euo pipefail
  local env="${1:-E1}"
  # #############################################################
  cd "$thisDir"
  # #############################################################
  # atlas_ci atlas_s3_sync_exports_down
  aws_load_profile
  # local bucket_var="KNESG_BUCKET_${env}"
  # local bucket="${!bucket_var}"
  aws s3 sync "$thisDir/data/" "s3://kn-clipboard-bucket/$env/knesg/" --delete
)}
# ###########################################################################################
# Move data from clipboard bucket to destination bucket
move_data() {(
  set -euo pipefail
  local env="${1:-E1}"
  # #############################################################
  cd "$thisDir"
  # #############################################################
  if [[ "$env" == "E4" ]]; then
    destinationBucket="edikn-e4-knesg-bucket-generator-df090a6"
  else
    destinationBucket="edikn-e1-knesg-bucket-generator-83ced7a"
  fi
  watson_bot runYaml "
  - task: TransferS3Objects
    parameters:
      sourceBucket: kn-clipboard-bucket
      sourcePrefix: $env/knesg/
      destinationBucket: $destinationBucket
      destinationPrefix: ''
      deleteSourceOnSuccess: true
  "
)}
# ###########################################################################################
run() {(
  set -euo pipefail
  local env="${1:-E1}"
  # #############################################################

  cd "$thisDir"
  # 1. Clean up
  clean
  # 2. Generate data
  gen "$env"
  # 3. Sync data up to s3 clipboard bucket
  data "$env"
  # 4. Move data from clipboard bucket to destination bucket
  move_data "$env"
  # watson_bot runWith '[{
  #   "task": "TransferS3Objects",
  #   "parameters": {
  #     "sourceBucket": "kn-clipboard-bucket",
  #     "sourcePrefix": "'"$env"'/knesg/",
  #     "destinationBucket": "'"$destinationBucket"'",
  #     "destinationPrefix": "",
  #     "deleteSourceOnSuccess": true
  #   }
  # }]'
  # curl -sS --location 'knwatson-e1.nonprod-stefoundationsedi.cp4.homeaffairs.gov.au/s3-buckets/copy' \
  #   --header 'Content-Type: application/json' \
  #   --data '{
  #     "sourceBucket": "kn-clipboard-bucket",
  #     "sourcePrefix": "'"$env"'/knesg/",
  #     "destinationBucket": "'"$destinationBucket"'",
  #     "deleteSource": true
  #   }' | jq -r .

  # "destinationBucket": "edikn-e1-knesg-bucket-generator-83ced7a",
)}
# ###########################################################################################
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  func="${1:-run}"
  shift
  "$func" "$@"
fi