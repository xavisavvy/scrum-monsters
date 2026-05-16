import { test } from '@playwright/test';

test.describe('Voting Screen Visual Regression', () => {
  // TODO: voting-screen visuals require a 2-player session with a ticket
  // already in flight (host adds ticket + presses Start). The previous
  // implementation looked for a generic "create" button on `/`, silently
  // skipped when it didn't match, then either captured a blank page or
  // produced a non-deterministic snapshot.
  //
  // `.fixme` until a multi-page test fixture is wired up that drives
  // host + player into the battle phase deterministically.
  test.fixme('voting screen with battle scene - desktop', async () => {});
  test.fixme('voting screen - mobile', async () => {});
});
