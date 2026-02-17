# Future Enhancements

Ideas and features to consider for future milestones. Not yet scheduled.

## Combat

- **Boss Reanimation by Spectators**: Allow spectators to reanimate a defeated boss by healing it back above 0 HP. Requires resetting `boss.defeated = false` and `boss.currentHealth > 0` in `gameState.attackBoss()` (server/gameState.ts). Currently the dead-boss guard (`defeated || currentHealth <= 0`) blocks all interactions including spectator heals once the boss dies. Implementation would need a new "reanimate" threshold or mechanic separate from normal spectator healing.
