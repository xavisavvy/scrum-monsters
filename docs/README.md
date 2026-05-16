# Scrum Monsters Documentation

This directory contains detailed documentation for Scrum Monsters. For a quick start, see the main [README.md](../README.md).

## Documentation Index

### Features

Detailed implementation guides for specific features:

- [Audio Persistence](features/AUDIO_PERSISTENCE.md) - Persistent audio mute settings
- [Recurring Rooms](features/RECURRING_ROOMS.md) - Bookmarkable room URLs for recurring meetings
- [QoL Improvements](features/QOL_IMPROVEMENTS.md) - Player name persistence, copy lobby code, quick rejoin

### Deployment

Guides for deploying Scrum Monsters:

- [Replit Deployment](deployment/REPLIT_DEPLOYMENT.md) - Complete guide for Replit hosting
- [Deployment Fixes](deployment/DEPLOYMENT_FIXES_SUMMARY.md) - Host timeout fixes and troubleshooting

### Contributing

Guides for contributors:

- [Versioning](contributing/VERSIONING.md) - Semantic versioning and release workflow
- [Versioning Setup](contributing/VERSIONING_SETUP.md) - Automatic versioning system setup

## Quick Links

| Document | Location | Purpose |
|----------|----------|---------|
| Main README | [README.md](../README.md) | Getting started, features, installation |
| Contributing | [CONTRIBUTING.md](../CONTRIBUTING.md) | How to contribute, code style, PR process |
| Changelog | [CHANGELOG.md](../CHANGELOG.md) | Release history and version notes |
| License | [LICENSE.md](../LICENSE.md) | Licensing information (AGPL + CC BY-NC-ND) |
| Security | [.github/SECURITY.md](../.github/SECURITY.md) | Vulnerability reporting |
| Developer Guide | [CLAUDE.MD](../CLAUDE.MD) | Architecture, API, debugging |

## Structure

```
docs/
├── README.md              # This file - documentation index
├── features/              # Feature-specific documentation
│   ├── AUDIO_PERSISTENCE.md
│   ├── QOL_IMPROVEMENTS.md
│   └── RECURRING_ROOMS.md
├── deployment/            # Deployment guides
│   ├── DEPLOYMENT_FIXES_SUMMARY.md
│   └── REPLIT_DEPLOYMENT.md
└── contributing/          # Contributor guides
    ├── VERSIONING.md
    └── VERSIONING_SETUP.md
```
