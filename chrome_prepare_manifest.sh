#!/bin/bash

# Extract version and strip 'v' prefix if present (manifest requires bare semver)
version=$( cat package.json | jq -r '.custom.chrome.version' | sed 's/^v//')

jq '.version = $newVersion' --arg newVersion $version ./projects/chrome/public/manifest.json > ./projects/chrome/public/tmp.manifest.json && mv ./projects/chrome/public/tmp.manifest.json ./projects/chrome/public/manifest.json

echo $version