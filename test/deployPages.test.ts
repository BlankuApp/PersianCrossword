import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Pages App Check deployment", () => {
  it("requires a repository site key and checks that the built JavaScript contains it", () => {
    const workflow = readFileSync(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
    expect(workflow).toContain("vars.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY");
    expect(workflow).toMatch(/test -n "\$VITE_RECAPTCHA_ENTERPRISE_SITE_KEY"/);
    expect(workflow).toMatch(/grep -R -F.*VITE_RECAPTCHA_ENTERPRISE_SITE_KEY.*app-dist\/assets/);
  });
});
