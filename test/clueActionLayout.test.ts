import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

describe("clue action layout contract", () => {
  it("gives clue text flexible width and actions their actual inline width in one row", () => {
    const head = css.match(/\.active-clue-head\s*\{([^}]*)\}/)?.[1] ?? "";
    const block = css.match(/\.active-clue-block\s*\{([^}]*)\}/)?.[1] ?? "";
    const actions = css.match(/\.active-clue-head-actions\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(head).toMatch(/display:\s*grid/);
    expect(head).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
    expect(block).not.toMatch(/padding-inline-end|128px/);
    expect(actions).toMatch(/position:\s*static/);
    expect(actions).toMatch(/display:\s*flex/);
    expect(actions).toMatch(/flex-direction:\s*row/);
    expect(actions).not.toMatch(/absolute|column|inset-block-start|inset-inline-end/);
    expect(css).not.toMatch(/\.active-clue-block\s*\+\s*\.active-clue-block\s+\.active-clue-head-actions\s*\{/);
  });
});
