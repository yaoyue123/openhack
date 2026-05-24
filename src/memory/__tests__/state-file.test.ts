import { describe, it, expect } from "vitest";
import { parsePhase } from "../state-file.js";

describe("parsePhase", () => {
  it("extracts phase from standard template", () => {
    const content = `# Current State

## Objective
Test

## Phase
recon

## What I Know
`;
    expect(parsePhase(content)).toBe("recon");
  });

  it("extracts phase with colon format", () => {
    const content = "## Phase: exploit\n";
    expect(parsePhase(content)).toBe("exploit");
  });

  it("extracts phase with blank line after heading", () => {
    const content = "## Phase\n\nescalate\n";
    expect(parsePhase(content)).toBe("escalate");
  });

  it("returns null when no phase heading exists", () => {
    const content = "# Just a heading\nno phase here\n";
    expect(parsePhase(content)).toBeNull();
  });

  it("extracts phase from realistic state content", () => {
    const content = `## Phase
done

## Blockers
None
`;
    expect(parsePhase(content)).toBe("done");
  });
});
