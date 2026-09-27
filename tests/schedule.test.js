import { describe, it, expect } from "vitest";
import { buildSchedule } from "../lib/generation/schedule.js";

const requirements = [
  { id: "r1", text: "React", kind: "technical", priority: "must" },
  { id: "r2", text: "Node", kind: "technical", priority: "must" },
];

function makeQuestions(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    requirement_ids: [i % 2 === 0 ? "r1" : "r2"],
    category: "technical",
    difficulty: (i % 3) + 1,
  }));
}

describe("buildSchedule", () => {
  it("produces exactly the number of days requested", () => {
    const schedule = buildSchedule(requirements, makeQuestions(6), 3);
    expect(schedule.days).toHaveLength(3);
    expect(schedule.days_available).toBe(3);
  });

  it("spans exactly the requested days even with far more material than days (1-day case)", () => {
    const schedule = buildSchedule(requirements, makeQuestions(10), 1);
    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0].question_ids).toHaveLength(10);
  });

  it("spans exactly the requested days even with far less material than days (60-day case)", () => {
    const schedule = buildSchedule(requirements, makeQuestions(3), 60);
    expect(schedule.days).toHaveLength(60);
    // every day has a real integer duration, including the surplus review days
    for (const day of schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThanOrEqual(0);
    }
  });

  it("every duration is a non-negative integer", () => {
    const schedule = buildSchedule(requirements, makeQuestions(7), 4);
    for (const day of schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
    }
  });

  it("places higher-difficulty questions on earlier days than lower-difficulty ones", () => {
    const questions = [
      { id: "q1", requirement_ids: ["r1"], category: "technical", difficulty: 1 },
      { id: "q2", requirement_ids: ["r1"], category: "technical", difficulty: 3 },
    ];
    const schedule = buildSchedule(requirements, questions, 2);
    expect(schedule.days[0].question_ids).toContain("q2");
    expect(schedule.days[1].question_ids).toContain("q1");
  });

  it("every question_ids entry refers to a real question", () => {
    const questions = makeQuestions(5);
    const schedule = buildSchedule(requirements, questions, 3);
    const validIds = new Set(questions.map((q) => q.id));
    for (const day of schedule.days) {
      for (const qid of day.question_ids) expect(validIds.has(qid)).toBe(true);
    }
  });

  it("handles zero questions without crashing", () => {
    const schedule = buildSchedule(requirements, [], 5);
    expect(schedule.days).toHaveLength(5);
    expect(schedule.days.every((d) => d.question_ids.length === 0)).toBe(true);
  });
});
