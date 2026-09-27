import { describe, it, expect } from "vitest";
import { validateKit } from "../lib/validation/kitSchema.js";

function validKit() {
  return {
    source: {
      company: "Acme", company_url: "https://acme.example", role: "Backend Engineer", location: "Remote",
      jd_chars: 500, researched_at: new Date().toISOString(), pages_used: ["https://acme.example/careers"],
    },
    company_brief: { summary: "Acme builds widgets.", what_they_do: "Widgets.", sources: ["https://acme.example"] },
    role: {
      title: "Backend Engineer", seniority: "Senior", responsibilities: ["Build APIs"],
      requirements: [{ id: "r1", text: "5+ years Node", kind: "technical", priority: "must" }],
    },
    questions: [
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Explain event loop.", answer_outline: "...", difficulty: 2, state: "generated" },
    ],
    flashcards: [{ id: "f1", front: "What is Node?", back: "A JS runtime.", requirement_ids: ["r1"], state: "generated" }],
    schedule: { days_available: 3, days: [{ day: 1, focus: "Technical", question_ids: ["q1"], minutes: 25 }, { day: 2, focus: "Review", question_ids: [], minutes: 0 }, { day: 3, focus: "Review", question_ids: [], minutes: 0 }] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe("validateKit", () => {
  it("accepts a well-formed kit matching Appendix A", () => {
    const result = validateKit(validKit());
    expect(result.ok).toBe(true);
  });

  it("rejects a kit missing a required field", () => {
    const kit = validKit();
    delete kit.company_brief.summary;
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-integer duration", () => {
    const kit = validKit();
    kit.schedule.days[0].minutes = 25.5;
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });

  it("rejects a priority value outside must|nice", () => {
    const kit = validKit();
    kit.role.requirements[0].priority = "optional";
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });

  it("rejects a schedule day referencing a question that does not exist", () => {
    const kit = validKit();
    kit.schedule.days[0].question_ids.push("q-does-not-exist");
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/unknown question id/);
  });

  it("rejects a question referencing a requirement that does not exist", () => {
    const kit = validKit();
    kit.questions[0].requirement_ids.push("r-does-not-exist");
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });

  it("rejects difficulty outside 1-3", () => {
    const kit = validKit();
    kit.questions[0].difficulty = 5;
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });
});
