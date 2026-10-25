import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

describe("clue action layout contract", () => {
  it("keeps four 26px actions in one inline strip without adding clue height", () => {
    expect(css).toMatch(/\.active-clue-block\s*\{[^}]*padding-inline-end:\s*calc\(128px\s*\+\s*var\(--stack-gap\)\)/s);
    expect(css).toMatch(/\.active-clue-head-actions\s*\{[^}]*position:\s*absolute;[^}]*flex-direction:\s*row;/s);
  });
});
