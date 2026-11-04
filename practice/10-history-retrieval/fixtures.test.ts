import { readFileSync } from "node:fs";
import { expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { createHistoryFixture } from "./fixtures.ts";

it("AI fixture persists branch and compaction entries in isolated files", () => {
  const fixture = createHistoryFixture();
  try {
    const text = readFileSync(fixture.sources[0].file, "utf8");
    expect(text).toContain(fixture.ids.discarded);
    expect(text).toContain(fixture.ids.decision);
    expect(text).toContain('"type":"compaction"');
    expect(readFileSync(fixture.sources[1].file, "utf8")).toContain("SQLite");
  } finally { fixture.dispose(); }
});
