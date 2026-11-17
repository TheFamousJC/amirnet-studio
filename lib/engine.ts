import { attemptSections, estimateAbility, examPlan, isCore, mayAdvanceEarly, selectSection } from "./adaptive.ts";
import { categories } from "./types.ts";
import type { Mode, Question, Test, UserAttempt, WordFormationItem } from "./types.ts";

function resultsFor(questions: Question[], answers: UserAttempt["answers"], score: number, bonus = 0) {
  const correct = questions.filter(question => answers[question.id] === question.correctIndex);
  const breakdown = categories.map(type => ({
    type,
    total: questions.filter(question => question.type === type).length,
    correct: correct.filter(question => question.type === type).length,
  }));
  return { score, correct: correct.length, total: questions.length, breakdown, bonus };
}

export function scoreTest(test: Test, answers: UserAttempt["answers"]) {
  const questions = test.sections.flatMap(section => section.questions);
  const weight = (difficulty: number) => 1 + (difficulty - 1) * 0.2;
  const totalWeight = questions.reduce((total, question) => total + weight(question.difficulty), 0);
  const earned = questions.reduce((total, question) =>
    total + (answers[question.id] === question.correctIndex ? weight(question.difficulty) : 0), 0);
  return resultsFor(questions, answers, 50 + Math.round(100 * earned / totalWeight));
}

export function wordCorrect(item: WordFormationItem, answer?: string) {
  const text = answer?.trim() ?? "";
  return item.answers.includes(text);
}

export function scoreAttempt(test: Test, attempt: UserAttempt) {
  if (!attempt.route) return scoreTest(test, attempt.answers);
  const sections = attemptSections(test, attempt);
  const questions = sections.filter(section => isCore(section.type)).flatMap(section => section.questions);
  const right = questions.filter(question => attempt.answers[question.id] === question.correctIndex).length;
  const estimate = right === 0 ? 50 : right === questions.length ? 150 :
    Math.max(50, Math.min(150, Math.round(100 + 20 * estimateAbility(questions, attempt.answers))));
  const experimental = sections.filter(section => !isCore(section.type) && section.type !== "writing");
  const bonus = experimental.filter(section =>
    section.questions.filter(item => attempt.answers[item.id] === item.correctIndex).length +
    (section.wordItems?.filter(item => wordCorrect(item, attempt.written?.[item.id])).length ?? 0) >=
    (section.questions.length === 5 ? 4 : 3)
  ).length;
  const score = Math.min(150, estimate + bonus);
  return resultsFor(questions, attempt.answers, score, score - estimate);
}

export function placement(score: number, hebrew = false) {
  const bands = [
    [134, "Exemption (Ptor)", "פטור"], [120, "Advanced II", "מתקדמים ב׳"],
    [100, "Advanced I", "מתקדמים א׳"], [85, "Basic", "בסיסי"],
    [70, "Pre-basic II", "טרום בסיסי ב׳"], [50, "Pre-basic I", "טרום בסיסי א׳"],
  ] as const;
  const band = bands.find(([minimum]) => score >= minimum);
  return band?.[hebrew ? 2 : 1] ?? "—";
}

export function startAttempt(test: Test, mode: Mode, now: number): UserAttempt {
  const attempt: UserAttempt = {
    id: crypto.randomUUID(), mode, testId: test.id, bankVersion: test.bankVersion ?? 1, startedAt: now, finishedAt: null,
    section: 0, question: 0, answers: {}, flagged: {}, checked: {},
    deadline: mode === "strict" ? now + test.sections[0].seconds * 1000 : null,
  };
  if (mode === "strict" && test.adaptive) {
    attempt.route = [];
    attempt.route = [selectSection(test, attempt)];
  }
  return attempt;
}

function advance(test: Test, attempt: UserAttempt, now: number): UserAttempt {
  const next = (attempt.route ? examPlan(test) : test.sections)[attempt.section + 1];
  if (!next) return { ...attempt, finishedAt: now, deadline: null, score: scoreAttempt(test, attempt).score };
  return {
    ...attempt, section: attempt.section + 1, question: 0,
    ...(attempt.route && { route: [...attempt.route, selectSection(test, attempt)] }),
    deadline: attempt.mode === "strict" ? now + next.seconds * 1000 : null,
  };
}

export function reconcile(test: Test, attempt: UserAttempt, now: number) {
  let current = attempt;
  while (current.deadline !== null && now >= current.deadline) {
    current = advance(test, current, current.deadline);
  }
  return current;
}

export type Action = { type: "tick" | "advance" | "next" | "flag" | "check" } |
  { type: "jump" | "select"; index: number } | { type: "write"; value: string };

export function transition(test: Test, attempt: UserAttempt, action: Action, now: number): UserAttempt {
  const current = reconcile(test, attempt, now);
  if (current !== attempt || current.finishedAt !== null) return current;
  const section = attemptSections(test, current)[current.section];
  const question = section.questions[current.question];
  const word = section.wordItems?.[current.question];
  const answerId = question?.id ?? word?.id ?? section.id;
  const size = section.wordItems?.length ?? section.questions.length;
  switch (action.type) {
    case "tick": return current;
    case "advance": return mayAdvanceEarly(section, current) ? advance(test, current, now) : current;
    case "jump": return action.index >= 0 && action.index < size
      ? { ...current, question: action.index } : current;
    case "select": return question && action.index >= 0 && action.index < 4 && !current.checked[question.id]
      ? { ...current, answers: { ...current.answers, [question.id]: action.index } } : current;
    case "write": return word || section.writingPrompt
      ? { ...current, written: { ...current.written, [answerId]: action.value.slice(0, word ? 60 : 12000) } } : current;
    case "flag": return { ...current, flagged: { ...current.flagged, [answerId]: !current.flagged[answerId] } };
    case "check": return question && current.mode === "study" && current.answers[question.id] !== undefined
      ? { ...current, checked: { ...current.checked, [question.id]: true } } : current;
    case "next": {
      if (question && current.mode === "study" && current.answers[question.id] !== undefined && !current.checked[question.id]) {
        return transition(test, current, { type: "check" }, now);
      }
      return current.question < size - 1 ? { ...current, question: current.question + 1 } : current;
    }
  }
}
