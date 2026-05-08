import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock storage BEFORE importing routes (vi.mock is hoisted).
vi.mock("../storage.js", () => ({
  storage: {
    getUserByAuth0Sub: vi.fn(),
  },
}));

import authRoutes from "./routes";
import { storage } from "../storage.js";
import { mockOidcMiddleware, type OidcStub } from "./__testHelpers/mockOidc";
import { configureAuth0 } from "./auth0";

function makeApp(stub: OidcStub) {
  const app = express();
  app.use(express.json());
  app.use(mockOidcMiddleware(stub));
  app.use("/api/auth", authRoutes);
  return app;
}

describe("auth routes - /me", () => {
  beforeEach(() => {
    vi.mocked(storage.getUserByAuth0Sub).mockReset();
  });

  it("me unauthenticated returns user:null", async () => {
    const app = makeApp({ isAuthenticated: () => false });
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
    expect(storage.getUserByAuth0Sub).not.toHaveBeenCalled();
  });

  it("me authenticated returns the user", async () => {
    vi.mocked(storage.getUserByAuth0Sub).mockResolvedValueOnce({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      displayName: "Alice",
      avatarUrl: null,
      auth0Sub: "auth0|123",
    } as any);
    const app = makeApp({
      isAuthenticated: () => true,
      user: { sub: "auth0|123" },
    });
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      displayName: "Alice",
      avatarUrl: null,
    });
    expect(storage.getUserByAuth0Sub).toHaveBeenCalledWith("auth0|123");
  });

  it("me orphan sub returns user:null", async () => {
    // Authenticated at the IdP but no matching row in our DB
    vi.mocked(storage.getUserByAuth0Sub).mockResolvedValueOnce(undefined);
    const app = makeApp({
      isAuthenticated: () => true,
      user: { sub: "auth0|orphan" },
    });
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
    expect(storage.getUserByAuth0Sub).toHaveBeenCalledWith("auth0|orphan");
  });
});

describe("auth routes - /providers", () => {
  // Snapshot/restore process.env per test so mutations do not leak to
  // other suites (T-43-05 mitigation in threat register).
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("providers configured returns auth0:true", async () => {
    process.env.AUTH0_CLIENT_ID = "test-client-id";
    process.env.AUTH0_ISSUER_BASE_URL = "https://example.auth0.com";
    const app = makeApp({ isAuthenticated: () => false });
    const res = await request(app).get("/api/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ auth0: true });
  });

  it("providers unconfigured returns auth0:false", async () => {
    delete process.env.AUTH0_CLIENT_ID;
    delete process.env.AUTH0_ISSUER_BASE_URL;
    const app = makeApp({ isAuthenticated: () => false });
    const res = await request(app).get("/api/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ auth0: false });
  });
});

describe("auth routes - /login redirect smoke", () => {
  // Structural assertion ONLY — we verify that `configureAuth0` is exported as
  // a function and that mounting it on an Express app does not throw when the
  // AUTH0_* env vars are set to placeholder values. We do NOT issue a request
  // that triggers the real redirect (the `auth()` factory contacts the issuer
  // URL on first request, which is brittle in CI). We do NOT vi.mock the
  // factory either — per RESEARCH §Anti-Patterns, mocking the factory hides
  // regressions.
  //
  // TODO(stretch): assert .status === 302 against a fake issuer once
  // express-openid-connect exposes a test mode.
  it("login redirect handler is registered when AUTH0_* configured", () => {
    const ORIGINAL = { ...process.env };
    try {
      process.env.AUTH0_CLIENT_ID = "test-client-id";
      process.env.AUTH0_CLIENT_SECRET = "test-client-secret";
      process.env.AUTH0_ISSUER_BASE_URL = "https://example.auth0.com";
      // AUTH0_SECRET must be >= 32 chars per express-openid-connect
      process.env.AUTH0_SECRET = "x".repeat(40);
      process.env.BASE_URL = "http://localhost:5000";

      // 1. Structural: configureAuth0 is an exported function
      expect(typeof configureAuth0).toBe("function");

      // 2. Structural: mounting the middleware does not throw
      const middleware = configureAuth0();
      expect(typeof middleware).toBe("function");

      const app = express();
      expect(() => app.use(middleware)).not.toThrow();
    } finally {
      process.env = { ...ORIGINAL };
    }
  });
});
