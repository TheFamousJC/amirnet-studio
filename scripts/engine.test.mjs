import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placement, reconcile, scoreTest, startAttempt, transition } from "../lib/engine.ts";

const fixture = JSON.parse(readFileSync(new URL("../data/tests/test-01.json", import.meta.url), "utf8"));
const first = fixture.sections[0].questions[0];

test("scoring endpoints, weighting, and exemption boundary", () => {
  const questions = fixture.sections.flatMap(section => section.questions);
  const [easier, harder] = [questions.find(q => q.difficulty === 1), questions.find(q => q.difficulty === 5)];
  assert.equal(scoreTest(fixture, {}).score, 50);
  assert.equal(scoreTest(fixture, Object.fromEntries(questions.map(q => [q.id, q.correctIndex]))).score, 150);
  assert(scoreTest(fixture, { [harder.id]: harder.correctIndex }).score > scoreTest(fixture, { [easier.id]: easier.correctIndex }).score);
  assert.equal(placement(133), "Advanced II");
  assert.equal(placement(134), "Exemption (Ptor)");
});

test("strict expiry catches up and never accepts a late answer into the next block", () => {
  let attempt = startAttempt(fixture, "strict", 1000);
  attempt = transition(fixture, attempt, { type: "flag" }, 2000);
  attempt = transition(fixture, attempt, { type: "select", index: 2 }, 3000);
  const next = transition(fixture, attempt, { type: "select", index: 3 }, 241000);
  assert.equal(next.section, 1);
  assert.equal(next.deadline, 481000);
  assert.deepEqual(next.answers, { [first.id]: 2 });
  assert.equal(next.flagged[first.id], true);
  const restored = reconcile(fixture, next, 481001);
  assert.equal(restored.section, 2);
  assert.equal(restored.deadline, 1381000);
  const finished = reconcile(fixture, restored, 3000000);
  assert.equal(finished.finishedAt, 2761000);
  assert.equal(finished.deadline, null);
  assert.equal(transition(fixture, finished, { type: "advance" }, 3000001), finished);
});

test("study has no deadline and locks a choice after immediate feedback", () => {
  let attempt = startAttempt(fixture, "study", 1000);
  assert.equal(reconcile(fixture, attempt, 3000000), attempt);
  attempt = transition(fixture, attempt, { type: "select", index: 1 }, 3000000);
  attempt = transition(fixture, attempt, { type: "next" }, 3000001);
  assert.equal(attempt.question, 0);
  assert.equal(attempt.checked[first.id], true);
  assert.equal(transition(fixture, attempt, { type: "select", index: 3 }, 3000002), attempt);
  assert.equal(transition(fixture, attempt, { type: "next" }, 3000003).question, 1);
});

test("new attempts record the bank edition and original tests retain edition one", () => {
  const original = JSON.parse(readFileSync(new URL("../data/archive/v1/test-01.json", import.meta.url), "utf8"));
  assert.equal(startAttempt(fixture, "study", 1000).bankVersion, 2);
  assert.equal(startAttempt(original, "strict", 1000).bankVersion, 1);
});
