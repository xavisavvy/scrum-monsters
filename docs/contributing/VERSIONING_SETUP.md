# Automatic Versioning System - Setup Summary

**Date**: 2026-01-17
**Status**: ✅ Complete and Ready to Use

## What Was Implemented

### 1. **Conventional Commits** with commitlint
- Enforces standardized commit message format
- Validates all commits before they're created
- Provides clear error messages for invalid commits

### 2. **Automatic Versioning** with standard-version
- Analyzes commits to determine version bump
- Automatically updates package.json
- Generates CHANGELOG.md from commits
- Creates git tags for releases

### 3. **Git Hooks** with Husky
- Pre-commit validation of commit messages
- Prevents invalid commits from being created
- Runs automatically on every commit

## Files Created/Modified

### Configuration Files
```
.commitlintrc.json         # Commit message validation rules
.versionrc.json            # Versioning configuration
.husky/commit-msg          # Git hook for commit validation
package.json               # Added versioning scripts
```

### Documentation
```
VERSIONING.md              # Comprehensive versioning guide
CONTRIBUTING.md            # Updated with commit conventions
CHANGELOG.md               # Auto-generated changelog
.github/COMMIT_CONVENTION.md  # Quick reference guide
VERSIONING_SETUP.md        # This file
```

### Updated Files
```
.gitignore                 # Added CHANGELOG comment
```

## How to Use

### Making Commits

Your commits **must** follow this format:

```bash
<type>(<scope>): <subject>
```

**Example:**
```bash
git commit -m "feat(lobby): add player statistics"
git commit -m "fix(audio): resolve mute sync issue"
git commit -m "docs(readme): update installation steps"
```

**Validation happens automatically** - invalid commits will be rejected.

### Creating Releases

#### Automatic (Recommended)
```bash
npm run release
```
Analyzes commits and determines the appropriate version bump automatically.

#### Manual Version Bump
```bash
npm run release:patch   # 1.0.0 → 1.0.1 (bug fixes)
npm run release:minor   # 1.0.0 → 1.1.0 (new features)
npm run release:major   # 1.0.0 → 2.0.0 (breaking changes)
```

#### Preview First
```bash
npm run release:dry-run
```
Shows what would happen without making any changes.

#### After Release
```bash
# Push commits and tags to GitHub
git push --follow-tags origin main
```

## Commit Types and Version Bumps

| Commit Type | Description | Version Bump |
|-------------|-------------|--------------|
| `feat:` | New feature | MINOR (1.0.0 → 1.1.0) |
| `fix:` | Bug fix | PATCH (1.0.0 → 1.0.1) |
| `perf:` | Performance | PATCH (1.0.0 → 1.0.1) |
| `BREAKING CHANGE:` | Breaking change | MAJOR (1.0.0 → 2.0.0) |
| `docs:` | Documentation | None |
| `style:` | Formatting | None |
| `refactor:` | Code restructure | None |
| `test:` | Tests | None |
| `build:` | Build system | None |
| `ci:` | CI/CD | None |
| `chore:` | Miscellaneous | None |

## Examples

### Good Commits ✅

```bash
feat(lobby): add recurring meeting rooms
fix(websocket): resolve timeout issues on Replit
perf(battle): optimize projectile rendering by 30%
docs(readme): add versioning documentation
refactor(audio): extract audio logic into custom hook
```

### Bad Commits ❌

```bash
added new feature              # Missing type
fix: bug                      # Subject too vague
Feat(lobby): Add feature      # Capitalized (should be lowercase)
feat(lobby)                   # Missing subject
fix(lobby): fixed the bug.    # Don't use past tense or periods
```

### Breaking Change Example

```bash
git commit -m "feat(api): change create_lobby event structure

Changed the structure of the create_lobby WebSocket event to support
custom lobby IDs for recurring meeting rooms.

BREAKING CHANGE: The create_lobby event now requires initialSettings
to be an object instead of separate parameters. Clients must update
to the new format:

Before:
  emit('create_lobby', { lobbyName, hostName })

After:
  emit('create_lobby', {
    lobbyName,
    hostName,
    initialSettings: { customLobbyId: 'my-room' }
  })

Migration: Wrap any settings in an initialSettings object."
```

**Result**: Version bumps from 1.0.0 → 2.0.0

## Validation Errors

If you see this:
```
✖   type may not be empty [type-empty]
✖   subject may not be empty [subject-empty]
```

Fix your commit message:
```bash
git commit --amend -m "feat(scope): proper message"
```

## What Happens During Release

1. **Analyzes commits** since last release
2. **Determines version bump** based on commit types
3. **Updates package.json** with new version
4. **Generates CHANGELOG.md** from commits
5. **Creates commit**: `chore(release): X.Y.Z`
6. **Creates git tag**: `vX.Y.Z`

## CHANGELOG Generation

The CHANGELOG.md is automatically generated with these sections:

- **Features** - All `feat:` commits
- **Bug Fixes** - All `fix:` commits
- **Performance Improvements** - All `perf:` commits
- **Breaking Changes** - Commits with `BREAKING CHANGE:`
- **Documentation** - Significant `docs:` commits
- **Code Refactoring** - Significant `refactor:` commits

## Workflow Example

### Feature Development

```bash
# 1. Create feature branch
git checkout -b feature/player-stats

# 2. Make changes and commit (validated automatically)
git add .
git commit -m "feat(lobby): add player statistics tracking

Track total games played, win rate, and average estimation time.
Statistics are displayed on player profile cards in the lobby."

# 3. More commits as needed
git commit -m "test(lobby): add player statistics tests"
git commit -m "docs(readme): document player statistics feature"

# 4. Push and create PR
git push origin feature/player-stats
```

### After PR Merge

```bash
# 1. Pull latest main
git checkout main
git pull origin main

# 2. Preview release
npm run release:dry-run

# 3. Create release
npm run release

# 4. Verify changes
git show HEAD
cat CHANGELOG.md

# 5. Push release
git push --follow-tags origin main
```

## npm Scripts

```bash
npm run release              # Auto version bump
npm run release:minor        # Force minor bump
npm run release:major        # Force major bump
npm run release:patch        # Force patch bump
npm run release:dry-run      # Preview without changes
npm run version:check        # Show current version
```

## Benefits

### For Developers
- **Clear commit history** - Easy to understand what changed
- **Automated releases** - No manual version management
- **Generated changelogs** - Documentation writes itself
- **Enforced standards** - Consistent commit format

### For Users
- **Semantic versioning** - Predictable version numbers
- **Detailed changelogs** - Know what changed in each release
- **Breaking change warnings** - Clear migration guides
- **Release notes** - Organized by type

### For Project
- **Professional workflow** - Industry-standard practices
- **Easy collaboration** - Clear contribution guidelines
- **Automated CI/CD** - Can integrate with GitHub Actions
- **Version tracking** - Complete project history

## Testing the System

### Test Valid Commit

```bash
# Should succeed
git commit --allow-empty -m "feat(test): validate commit system"
```

### Test Invalid Commit

```bash
# Should fail with validation error
git commit --allow-empty -m "invalid commit message"
```

### Test Release

```bash
# Preview what would happen
npm run release:dry-run
```

## Troubleshooting

### Problem: Commit rejected

**Solution**: Fix your message format
```bash
# Amend the commit with proper format
git commit --amend -m "feat(scope): proper message"
```

### Problem: Wrong version bump

**Solution**: Use manual version specification
```bash
npm run release:minor  # or :major or :patch
```

### Problem: Need to undo release

**Solution**: Delete tag and reset
```bash
git tag -d v1.1.0
git reset --hard HEAD~1
npm run release  # Try again
```

## Next Steps

1. **Make your first proper commit**:
   ```bash
   git add .
   git commit -m "chore(project): setup automatic versioning system"
   ```

2. **Create your first release**:
   ```bash
   npm run release
   ```

3. **Push to GitHub**:
   ```bash
   git push --follow-tags origin main
   ```

4. **Share guidelines** with team members:
   - Point them to `CONTRIBUTING.md`
   - Share `.github/COMMIT_CONVENTION.md` quick reference
   - Link to `VERSIONING.md` for full details

## Resources

- **Full Guide**: See [VERSIONING.md](./VERSIONING.md)
- **Contributing**: See [CONTRIBUTING.md](../../CONTRIBUTING.md)
- **Quick Reference**: See [.github/COMMIT_CONVENTION.md](../../.github/COMMIT_CONVENTION.md)

---

**System Status**: ✅ Ready to use
**Current Version**: 1.0.0
**Next Release**: Run `npm run release` when ready
