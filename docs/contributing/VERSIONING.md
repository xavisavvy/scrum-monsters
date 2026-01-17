# Versioning and Release Guide

**Date**: 2026-01-17
**System**: Conventional Commits + Standard-Version + Semantic Versioning

## Overview

ScrumQuest uses automated versioning based on [Semantic Versioning](https://semver.org/) (SemVer) and [Conventional Commits](https://www.conventionalcommits.org/).

## Semantic Versioning

Version format: `MAJOR.MINOR.PATCH`

```
1.2.3
│ │ │
│ │ └─ PATCH: Bug fixes, small improvements
│ └─── MINOR: New features (backward compatible)
└───── MAJOR: Breaking changes (incompatible API changes)
```

### Version Bump Rules

| Commit Type | Version Bump | Example Change |
|-------------|--------------|----------------|
| `fix:` | PATCH | 1.2.3 → 1.2.4 |
| `feat:` | MINOR | 1.2.3 → 1.3.0 |
| `BREAKING CHANGE:` | MAJOR | 1.2.3 → 2.0.0 |
| `perf:` | PATCH | 1.2.3 → 1.2.4 |
| `docs:`, `style:`, `refactor:`, `test:`, `build:`, `ci:`, `chore:` | None | No version change |

## Conventional Commits

### Commit Message Structure

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Type

Must be one of:

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code formatting (no logic change)
- **refactor**: Code restructuring (no behavior change)
- **perf**: Performance improvement
- **test**: Adding/updating tests
- **build**: Build system changes
- **ci**: CI/CD changes
- **chore**: Miscellaneous tasks
- **revert**: Revert previous commit

### Scope

Optional, specifies what part of the codebase was changed:

**Client-side:**
- `ui` - UI components
- `lobby` - Lobby functionality
- `battle` - Battle system
- `audio` - Audio system
- `avatar` - Avatar selection

**Server-side:**
- `server` - General server changes
- `websocket` - WebSocket functionality
- `gamestate` - Game state management
- `api` - REST API endpoints

**Cross-cutting:**
- `deps` - Dependencies
- `docs` - Documentation
- `config` - Configuration

### Subject

- Use imperative mood: "add" not "added" or "adds"
- Don't capitalize first letter
- No period at the end
- Maximum 100 characters

### Body

Optional, provides additional context:

- Explain **what** and **why**, not **how**
- Use imperative mood
- Wrap at 72 characters

### Footer

Optional, for breaking changes and issue references:

```
BREAKING CHANGE: describe incompatible change

Fixes #123
Closes #456
```

## Examples

### Feature Addition

```bash
git commit -m "feat(lobby): add player name persistence

Implemented localStorage-based persistence for player names.
Users no longer need to re-enter their name on each visit.

- Added PlayerNameStorage utility
- Updated LobbyCreation, LobbyJoin, and RoomJoin components
- Names persist across sessions for 30 days"
```

**Result**: Version `1.2.3` → `1.3.0` (MINOR bump)

### Bug Fix

```bash
git commit -m "fix(websocket): resolve ping timeout on Replit

Increased ping timeout from 60s to 90s for Replit deployments.
Prevents premature disconnections during high latency periods.

Fixes #42"
```

**Result**: Version `1.2.3` → `1.2.4` (PATCH bump)

### Breaking Change

```bash
git commit -m "feat(api): refactor lobby creation endpoint

Changed lobby creation to support custom lobby IDs for recurring rooms.

BREAKING CHANGE: The create_lobby WebSocket event now accepts an
optional customLobbyId in initialSettings. Existing clients will
continue to work but won't be able to create recurring rooms.

Before:
  emit('create_lobby', { lobbyName, hostName, initialSettings })

After:
  emit('create_lobby', {
    lobbyName,
    hostName,
    initialSettings: { ...settings, customLobbyId }
  })"
```

**Result**: Version `1.2.3` → `2.0.0` (MAJOR bump)

### Documentation

```bash
git commit -m "docs(readme): add QoL improvements section

Documented the three new quality-of-life features:
- Player name persistence
- Copy lobby code button
- Quick rejoin last lobby"
```

**Result**: No version change (docs don't trigger releases)

### Performance Improvement

```bash
git commit -m "perf(battle): optimize projectile rendering

Reduced projectile re-renders by memoizing calculation functions.
Improves FPS by ~15% during intense battles with 10+ projectiles.

Performance metrics:
- Before: 45 FPS average
- After: 52 FPS average"
```

**Result**: Version `1.2.3` → `1.2.4` (PATCH bump)

## Creating Releases

### Automated Release (Recommended)

Automatically determines version based on commits:

```bash
npm run release
```

This will:
1. Analyze commits since last release
2. Determine version bump (MAJOR/MINOR/PATCH)
3. Update `package.json` version
4. Generate/update `CHANGELOG.md`
5. Create a commit: `chore(release): X.Y.Z`
6. Create a git tag: `vX.Y.Z`

### Manual Version Specification

Force a specific version bump:

```bash
# Patch release (1.2.3 → 1.2.4)
npm run release:patch

# Minor release (1.2.3 → 1.3.0)
npm run release:minor

# Major release (1.2.3 → 2.0.0)
npm run release:major
```

### Preview Release

See what would happen without making changes:

```bash
npm run release:dry-run
```

Output shows:
- Commits to be included
- Version bump determination
- CHANGELOG content
- Files to be modified

### Publishing Release

After running `npm run release`:

```bash
# Push commits and tags
git push --follow-tags origin main

# If using GitHub Releases, create release from tag
gh release create vX.Y.Z --generate-notes
```

## Changelog

The `CHANGELOG.md` is automatically generated from commit messages.

### Changelog Sections

Commits are grouped by type:

- **Features** (`feat:`)
- **Bug Fixes** (`fix:`)
- **Performance Improvements** (`perf:`)
- **Reverts** (`revert:`)
- **Documentation** (`docs:`) - if significant
- **Code Refactoring** (`refactor:`) - if significant
- **Breaking Changes** (any commit with `BREAKING CHANGE:`)

### Changelog Format

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-01-17

### Features

* **lobby:** add player name persistence ([abc1234](commit-link))
* **lobby:** add copy lobby code button ([def5678](commit-link))
* **menu:** add quick rejoin last lobby ([ghi9012](commit-link))

### Bug Fixes

* **websocket:** resolve ping timeout on Replit ([jkl3456](commit-link))

## [1.2.0] - 2026-01-16

### Features

* **rooms:** add recurring meeting rooms ([mno7890](commit-link))
```

## Commit Validation

### Git Hooks

**Husky** runs commit validation automatically:

```
.husky/
└── commit-msg  # Runs commitlint on commit messages
```

### commitlint Configuration

`.commitlintrc.json`:
```json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [2, "always", ["feat", "fix", "docs", ...]],
    "subject-case": [2, "never", ["upper-case"]],
    "subject-empty": [2, "never"],
    "header-max-length": [2, "always", 100]
  }
}
```

### Validation Errors

Common errors and fixes:

**Error**: `type may not be empty`
```bash
# ❌ Bad
git commit -m "add new feature"

# ✅ Good
git commit -m "feat: add new feature"
```

**Error**: `subject may not be empty`
```bash
# ❌ Bad
git commit -m "feat:"

# ✅ Good
git commit -m "feat: add new feature"
```

**Error**: `subject must not be sentence-case`
```bash
# ❌ Bad
git commit -m "feat: Add new feature"

# ✅ Good
git commit -m "feat: add new feature"
```

**Error**: `header must not be longer than 100 characters`
```bash
# ❌ Bad
git commit -m "feat: add a super long feature description that goes on and on and exceeds the maximum allowed length"

# ✅ Good
git commit -m "feat: add feature with detailed description

This feature includes several improvements:
- Improvement 1
- Improvement 2
- Improvement 3"
```

### Bypassing Validation

**⚠️ Not Recommended** - Only for emergencies:

```bash
git commit -m "emergency fix" --no-verify
```

## Best Practices

### Commit Frequency

- Commit often with logical, atomic changes
- Each commit should represent one logical change
- Don't bundle multiple unrelated changes

### Commit Messages

- **Be specific**: "fix login bug" → "fix(auth): resolve session timeout on page refresh"
- **Use present tense**: "add feature" not "added feature"
- **Reference issues**: Include "Fixes #123" or "Closes #456"
- **Explain why**: Body should explain motivation, not implementation

### Breaking Changes

- **Always document**: Include `BREAKING CHANGE:` in footer
- **Provide migration path**: Explain how to upgrade
- **Show before/after**: Include code examples
- **Major version only**: Don't sneak breaking changes into patches

### Scope Guidelines

- **Be consistent**: Use existing scopes when possible
- **Be specific**: `lobby` not `frontend`
- **Optional**: Skip scope if change is global
- **New scopes**: Document in this file

## Workflow Examples

### Feature Development

```bash
# 1. Create feature branch
git checkout -b feature/player-stats

# 2. Make changes and commit
git add .
git commit -m "feat(lobby): add player statistics tracking

Track games played, win rate, and average estimation time.
Statistics are displayed on player profile cards."

# 3. More commits as needed
git commit -m "feat(lobby): add statistics UI component"
git commit -m "test(lobby): add player statistics tests"

# 4. Create PR
git push origin feature/player-stats
```

### Bug Fix

```bash
# 1. Create bugfix branch
git checkout -b fix/audio-sync

# 2. Fix and commit
git commit -m "fix(audio): resolve mute state sync across tabs

Fixed issue where muting audio in one tab didn't sync to others.
Now uses localStorage events for cross-tab communication.

Fixes #89"

# 3. Push and create PR
git push origin fix/audio-sync
```

### Release Process

```bash
# 1. Ensure you're on main with latest changes
git checkout main
git pull origin main

# 2. Preview release
npm run release:dry-run

# 3. Create release
npm run release

# 4. Review CHANGELOG.md and version bump
git show HEAD

# 5. Push release
git push --follow-tags origin main

# 6. Create GitHub Release (optional)
gh release create v1.3.0 --generate-notes
```

## Version History

Check current version:

```bash
npm run version:check
```

View version history:

```bash
git tag
git log --oneline --decorate
```

## Configuration Files

### `.versionrc.json`

Standard-version configuration:

```json
{
  "types": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" },
    { "type": "perf", "section": "Performance Improvements" }
  ],
  "packageFiles": ["package.json"],
  "bumpFiles": ["package.json"]
}
```

### `.commitlintrc.json`

Commit message validation rules:

```json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [2, "always", ["feat", "fix", ...]],
    "header-max-length": [2, "always", 100]
  }
}
```

## Troubleshooting

### Issue: Commit rejected by commitlint

**Solution**: Fix your commit message format:
```bash
git commit --amend -m "feat(scope): proper message format"
```

### Issue: Wrong version bump

**Solution**: Use manual version specification:
```bash
npm run release:minor  # or :major or :patch
```

### Issue: Forgot to include commit in release

**Solution**: Create another release after adding the commit:
```bash
git commit -m "feat: the forgotten feature"
npm run release
```

### Issue: Need to undo release

**Solution**: Delete tag and reset:
```bash
git tag -d v1.3.0
git reset --hard HEAD~1
npm run release  # Try again
```

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [commitlint](https://commitlint.js.org/)
- [standard-version](https://github.com/conventional-changelog/standard-version)

---

**Last Updated**: 2026-01-17
**Current Version**: 1.0.0
