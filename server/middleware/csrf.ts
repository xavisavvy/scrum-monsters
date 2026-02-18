import { csrfSync } from 'csrf-sync';

const { generateToken, csrfSynchronisedProtection } = csrfSync({
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
  size: 128,
});

export { generateToken, csrfSynchronisedProtection };
