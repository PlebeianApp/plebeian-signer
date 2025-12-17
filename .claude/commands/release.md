# Release Command

Review all changes in the repository and create a release with proper commit message, version tag, and push to origin.

## Argument: $ARGUMENTS

The argument should be one of:
- `patch` - Bump the patch version (e.g., 0.0.4 -> 0.0.5)
- `minor` - Bump the minor version and reset patch to 0 (e.g., 0.0.4 -> 0.1.0)
- `major` - Bump the major version and reset minor/patch to 0 (e.g., 0.0.4 -> 1.0.0)

If no argument provided, default to `patch`.

## Steps to perform:

1. **Read the current version** from `package.json` (the `version` field)

2. **Calculate the new version** based on the argument:
   - Parse the current version (format: MAJOR.MINOR.PATCH)
   - If `patch`: increment PATCH by 1
   - If `minor`: increment MINOR by 1, set PATCH to 0
   - If `major`: increment MAJOR by 1, set MINOR and PATCH to 0

3. **Update package.json** with the new version in all three places:
   - `version`
   - `custom.chrome.version`
   - `custom.firefox.version`

4. **Review changes** using `git status` and `git diff --stat HEAD`

5. **Verify the build** before committing:
   ```
   npm run lint
   npm run build:chrome
   npm run build:firefox
   ```
   If any step fails, fix issues before proceeding.

6. **Compose a commit message** following this format:
   - First line: 72 chars max, imperative mood summary (e.g., "Release v0.0.5")
   - Blank line
   - Bullet points describing each significant change
   - "Files modified:" section listing affected files
   - Footer with Claude Code attribution

7. **Stage all changes** with `git add -A`

8. **Create the commit** with the composed message

9. **Create a git tag** with the new version prefixed with 'v' (e.g., `v0.0.5`)

10. **Push to origin** with tags:
    ```
    git push origin main --tags
    ```

11. **Report completion** with the new version and commit hash

## Important:
- This is a browser extension with separate Chrome and Firefox builds
- All three version fields in package.json must be updated together
- Always verify both Chrome and Firefox builds compile before committing
