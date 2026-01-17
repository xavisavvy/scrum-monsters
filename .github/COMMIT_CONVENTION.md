# Quick Commit Convention Reference

## Format

```
<type>(<scope>): <subject>
```

## Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | MINOR (1.0.0 → 1.1.0) |
| `fix` | Bug fix | PATCH (1.0.0 → 1.0.1) |
| `perf` | Performance | PATCH (1.0.0 → 1.0.1) |
| `docs` | Documentation | None |
| `style` | Formatting | None |
| `refactor` | Code restructure | None |
| `test` | Tests | None |
| `build` | Build system | None |
| `ci` | CI/CD | None |
| `chore` | Miscellaneous | None |

## Common Scopes

`client`, `server`, `websocket`, `lobby`, `battle`, `audio`, `ui`, `docs`, `deps`

## Examples

```bash
# Feature
feat(lobby): add player name persistence

# Bug fix
fix(websocket): resolve timeout on Replit

# Performance
perf(battle): optimize projectile rendering

# Breaking change
feat(api): change lobby creation endpoint

BREAKING CHANGE: customLobbyId now required
```

## Commands

```bash
# Create release
npm run release

# Preview release
npm run release:dry-run

# Check version
npm run version:check
```

## Full Documentation

See [VERSIONING.md](../VERSIONING.md) for complete details.
