# Release Command

Review all changes in the repository and create a release with proper commit message, version tag, and push to origin.

## Argument: $ARGUMENTS

The argument should be one of:
- `patch` - Bump the patch version (e.g., v0.0.4 -> v0.0.5)
- `minor` - Bump the minor version and reset patch to 0 (e.g., v0.0.4 -> v0.1.0)
- `major` - Bump the major version and reset minor/patch to 0 (e.g., v0.0.4 -> v1.0.0)

If no argument provided, default to `patch`.

## Version Format

This project uses **standard semver with `v` prefix** (e.g., `v0.0.8`, `v1.2.3`).

## Steps to perform:

1. **Read the current version** from `package.json` (the `version` field)
   - Strip any existing `v` prefix if present (for backward compatibility with old `0.0.x` format)
   - The raw version should be in format: MAJOR.MINOR.PATCH

2. **Calculate the new version** based on the argument:
   - Parse the current version (format: MAJOR.MINOR.PATCH)
   - If `patch`: increment PATCH by 1
   - If `minor`: increment MINOR by 1, set PATCH to 0
   - If `major`: increment MAJOR by 1, set MINOR and PATCH to 0

3. **Update package.json** with the new version (with `v` prefix) in all three places:
   - `version` -> `vX.Y.Z`
   - `custom.chrome.version` -> `vX.Y.Z`
   - `custom.firefox.version` -> `vX.Y.Z`

4. **Review changes** using `git status` and `git diff --stat HEAD`

5. **Verify the build** before committing:
   ```
   npm run lint
   npm run build:chrome
   npm run build:firefox
   ```
   If any step fails, fix issues before proceeding.

6. **Create release zip files** in the `releases/` folder:
   ```
   mkdir -p releases
   cd dist/chrome && zip -r ../../releases/plebeian-signer-chrome-vX.Y.Z.zip . && cd ../..
   cd dist/firefox && zip -r ../../releases/plebeian-signer-firefox-vX.Y.Z.zip . && cd ../..
   ```
   Replace `vX.Y.Z` with the actual version number.

7. **Compose a commit message** following this format:
   - First line: 72 chars max, imperative mood summary (e.g., "Release v0.0.8")
   - Blank line
   - Bullet points describing each significant change
   - "Files modified:" section listing affected files
   - Footer with Claude Code attribution

8. **Stage all changes** with `git add -A`

9. **Create the commit** with the composed message

10. **Create a git tag** matching the version (e.g., `v0.0.8`)

11. **Push to origin** with tags:
    ```
    git push origin main --tags
    ```

12. **Report completion** with the new version and commit hash

## Important:
- This is a browser extension with separate Chrome and Firefox builds
- All three version fields in package.json must be updated together
- Always verify both Chrome and Firefox builds compile before committing
- Version format is standard semver with `v` prefix: `vMAJOR.MINOR.PATCH`
- Legacy versions without `v` prefix (e.g., `0.0.7`) are automatically upgraded to the new format
