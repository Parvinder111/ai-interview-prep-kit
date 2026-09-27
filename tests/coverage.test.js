import { describe, it, expect } from "vitest";
import { checkCoverage } from "../lib/generation/coverage.js";

const requirements = [
  { id: "r1", text: "5+ years React", kind: "technical", priority: "must" },
  { id: "r2", text: "Mentors juniors", kind: "behavioural", priority: "must" },
  { id: "r3", text: "AWS experience", kind: "technical", priority: "nice" },
];

describe("checkCoverage", () => {
  it("finds no gaps when every must requirement has a question", () => {
    const questions = [
      { id: "q1", requirement_ids: ["r1"] },
      { id: "q2", requirement_ids: ["r2"] },
    ];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).toEqual([]);
  });

  it("reports an uncovered must requirement", () => {
    const questions = [{ id: "q1", requirement_ids: ["r1"] }];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).toEqual(["r2"]);
  });

  it("never flags a nice-to-have requirement as a gap", () => {
    const questions = [{ id: "q1", requirement_ids: ["r1"] }, { id: "q2", requirement_ids: ["r2"] }];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).not.toContain("r3");
  });

  it("a question covering multiple requirements clears all of them", () => {
    const questions = [{ id: "q1", requirement_ids: ["r1", "r2"] }];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).toEqual([]);
  });

  it("handles an empty question bank by flagging every must requirement", () => {
    const result = checkCoverage(requirements, []);
    expect(result.uncoveredRequirementIds.sort()).toEqual(["r1", "r2"]);
  });
});
