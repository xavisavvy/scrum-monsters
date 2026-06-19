import { describe, it, expect } from "vitest";
import { injectMetaTags } from "./seoMiddleware";

const TEMPLATE = "<html><head><title>x</title></head><body></body></html>";

describe("injectMetaTags XSS escaping", () => {
  it("escapes a script-injection payload in the /game/:lobbyId path", () => {
    const evil = '/game/"><script>alert(1)</script>';
    const out = injectMetaTags(TEMPLATE, evil);
    // The raw breakout sequence must never appear in the output.
    expect(out).not.toContain('"><script>alert(1)</script>');
    expect(out).not.toContain("<script>alert(1)</script>");
    // It must be HTML-attribute-escaped instead.
    expect(out).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes the lobbyId where it flows into title/og:title", () => {
    const out = injectMetaTags(TEMPLATE, '/game/<img src=x onerror=alert(1)>');
    expect(out).not.toContain("<img src=x onerror=alert(1)>");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("renders the expected static title for a known route", () => {
    const out = injectMetaTags(TEMPLATE, "/about");
    expect(out).toContain("About Scrum Monsters");
    expect(out).toContain('<link rel="canonical" href="https://scrummonsters.com/about" />');
  });

  it("emits a clean canonical/og:url for the home route", () => {
    const out = injectMetaTags(TEMPLATE, "/");
    expect(out).toContain('content="https://scrummonsters.com" />');
  });
});
