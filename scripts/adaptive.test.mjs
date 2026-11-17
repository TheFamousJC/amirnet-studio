import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attemptSections, examPlan, mayAdvanceEarly } from "../lib/adaptive.ts";
import { reconcile, scoreAttempt, startAttempt, transition } from "../lib/engine.ts";

const data = Array.from({ length: 20 }, (_, index) => {
  const file = "test-" + String(index + 1).padStart(2, "0") + ".json";
  const read = path => JSON.parse(readFileSync(new URL("../data/" + path + "/" + file, import.meta.url), "utf8"));
  return { ...read("tests"), adaptive: read("adaptive") };
});
const exam = data[0];
const doAction = (form, attempt, action) => transition(form, attempt, action, attempt.deadline - 1000);
const section = (form, attempt) => attemptSections(form, attempt)[attempt.section];
const answerBlock = (form, attempt, correct) => ({
  ...attempt,
  answers: { ...attempt.answers, ...Object.fromEntries(section(form, attempt).questions.map((item, index) =>
    [item.id, correct(index) ? item.correctIndex : (item.correctIndex + 1) % 4])) },
});
const advance = (form, attempt) => doAction(form, attempt, { type: "advance" });

test("the timed blueprint covers all 20 forms, all official types and both endings", () => {
  const experimentKinds = new Set();
  for (const form of data) {
    const plan = examPlan(form);
    assert.deepEqual(plan.slice(0, 6).map(({ type, count, seconds }) => [type, count, seconds]), [
      ["sentence", 4, 240], ["sentence", 4, 240], ["reading", 5, 900],
      ["restatement", 3, 360], ["restatement", 3, 360], ["sentence", 4, 240],
    ]);
    const elapsed = plan.reduce((total, stage) => total + stage.seconds, 0);
    assert(elapsed >= 46 * 60 && elapsed <= 51 * 60);
    plan.slice(6).forEach(stage => experimentKinds.add(stage.type));
    for (const strength of [false, true]) {
      let attempt = startAttempt(form, "strict", 1000);
      for (let block = 0; block < 6; block++) {
        const active = section(form, attempt);
        assert.equal(active.questions.length, plan[block].count, form.id);
        if (block === 2) assert(active.passage?.paragraphs.length);
        attempt = advance(form, answerBlock(form, attempt, () => strength));
      }
      const ids = attempt.route.slice(0, 6).flat();
      assert.equal(ids.length, 23);
      assert.equal(new Set(ids).size, ids.length, form.id);
      assert.deepEqual(attemptSections(form, JSON.parse(JSON.stringify(attempt))), attemptSections(form, attempt));
    }
    const expired = reconcile(form, startAttempt(form, "strict", 1000), 1000 + elapsed * 1000 + 10);
    assert.equal(expired.finishedAt, 1000 + elapsed * 1000);
    assert.equal(expired.route.length, plan.length);
    assert.equal(expired.score, 50);
  }
  assert.deepEqual([...experimentKinds].sort(), ["continuation", "grammar", "lecture", "wordFormation", "writing"]);
});

test("the same moderate opening routes strong and weak performances to different blocks", () => {
  const mean = active => active.questions.reduce((total, item) => total + item.difficulty, 0) / active.questions.length;
  for (const form of data) {
    const entry = startAttempt(form, "strict", 1000);
    let low = advance(form, answerBlock(form, entry, () => false));
    let high = advance(form, answerBlock(form, entry, () => true));
    assert.equal(mean(section(form, entry)), 3, form.id);
    assert(mean(section(form, high)) > mean(section(form, low)), form.id);
    low = advance(form, answerBlock(form, low, () => false));
    high = advance(form, answerBlock(form, high, () => true));
    assert.notEqual(section(form, high).passage.title, section(form, low).passage.title, form.id);
    for (let i = 0; i < 3; i++) {
      low = advance(form, answerBlock(form, low, () => false));
      high = advance(form, answerBlock(form, high, () => true));
    }
    assert(mean(section(form, high)) > mean(section(form, low)), form.id + " final sentence block");
  }
});

test("early advancement requires all answers and expiry rejects a stale keystroke", () => {
  const entry = startAttempt(exam, "strict", 1000);
  assert.equal(advance(exam, entry), entry);
  assert.equal(mayAdvanceEarly(section(exam, entry), entry), false);
  const answered = answerBlock(exam, entry, () => true);
  const next = advance(exam, answered);
  assert.equal(next.deadline, entry.deadline - 1000 + 240000);
  assert.equal(next.section, 1);
  const late = transition(exam, entry, { type: "select", index: 3 }, entry.deadline);
  assert(late.route.length === 2);
  assert.deepEqual(late.answers, {});
});

test("experimental answers add no penalty and an essay can be resumed", () => {
  let item = startAttempt(exam, "strict", 1000);
  for (let i = 0; i < 6; i++) item = advance(exam, answerBlock(exam, item, index => index < 2));
  const core = scoreAttempt(exam, item).score;
  while (item.finishedAt === null) {
    item = advance(exam, answerBlock(exam, item, () => true));
  }
  assert.equal(item.score, core + 2);

  const writingForm = data[4];
  let essay = startAttempt(writingForm, "strict", 1000);
  for (let i = 0; i < 6; i++) essay = advance(writingForm, answerBlock(writingForm, essay, index => index < 2));
  assert.equal(section(writingForm, essay).type, "writing");
  assert.equal(advance(writingForm, essay), essay);
  essay = doAction(writingForm, essay, { type: "write", value: "An original draft." });
  essay = JSON.parse(JSON.stringify(essay));
  const submitted = advance(writingForm, essay);
  assert.notEqual(submitted.finishedAt, null);
  assert.equal(submitted.written[section(writingForm, essay).id], "An original draft.");
  assert.equal(scoreAttempt(writingForm, submitted).bonus, 0);

  const wordForm = data[1];
  let words = startAttempt(wordForm, "strict", 1000);
  for (let i = 0; i < 6; i++) words = advance(wordForm, answerBlock(wordForm, words, index => index < 2));
  assert.equal(section(wordForm, words).type, "wordFormation");
  assert.equal(advance(wordForm, words), words);
  const wordScore = scoreAttempt(wordForm, words).score;
  for (const [index, question] of section(wordForm, words).wordItems.entries()) {
    words = doAction(wordForm, words, { type: "jump", index });
    words = doAction(wordForm, words, { type: "write", value: question.answers[0] });
  }
  assert.equal(advance(wordForm, words).section, 7);
  assert.equal(scoreAttempt(wordForm, words).score, wordScore + 1);
});

test("study and pre-adaptive attempts keep their fixed banks", () => {
  const study = startAttempt(exam, "study", 1000);
  assert.equal(study.route, undefined);
  assert.equal(attemptSections(exam, study).flatMap(part => part.questions).length, 34);
  const { adaptive: _, ...oldShape } = exam;
  const old = startAttempt(oldShape, "strict", 1000);
  assert.equal(old.route, undefined);
  assert.equal(section(exam, old).questions.length, 6);
  assert.equal(advance(exam, old).section, 1);
});