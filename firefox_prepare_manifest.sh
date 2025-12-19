#!/bin/bash

# Extract version and strip 'v' prefix if present (manifest requires bare semver)
version=$( cat package.json | jq -r '.custom.firefox.version' | sed 's/^v//')

jq '.version = $newVersion' --arg newVersion $version ./projects/firefox/public/manifest.json > ./projects/firefox/public/tmp.manifest.json && mv ./projects/firefox/public/tmp.manifest.json ./projects/firefox/public/manifest.json

echo $version