import type { Category, Question, Section, SectionKind, Test, UserAttempt } from "./types.ts";

interface Stage { type: SectionKind; seconds: number; count: number }

const core: Stage[] = [
  { type: "sentence", seconds: 240, count: 4 },
  { type: "sentence", seconds: 240, count: 4 },
  { type: "reading", seconds: 900, count: 5 },
  { type: "restatement", seconds: 360, count: 3 },
  { type: "restatement", seconds: 360, count: 3 },
  { type: "sentence", seconds: 240, count: 4 },
];

export function examPlan(test: Test): Stage[] {
  const word: Stage = { type: "wordFormation", seconds: 180, count: 4 };
  const grammar: Stage = { type: "grammar", seconds: 240, count: 4 };
  const writing: Stage = { type: "writing", seconds: 720, count: 1 };
  const listening = test.adaptive?.listening?.type;
  const audio: Stage | null = listening ? { type: listening, seconds: listening === "lecture" ? 420 : 240, count: listening === "lecture" ? 5 : 4 } : null;
  const written = test.number % 2 === 0 ? word : grammar;
  const ending = test.number % 5 === 0 ? [writing] : audio
    ? (test.number % 3 === 0 ? [audio, written] : [written, audio])
    : [word, grammar];
  return [...core, ...ending];
}

export function isCore(type: SectionKind): type is Category {
  return type === "sentence" || type === "reading" || type === "restatement";
}

function pool(test: Test, type: SectionKind): Question[] {
  const questions = test.sections.filter(section => section.type === type).flatMap(section => section.questions);
  return type === "sentence" ? [...questions, ...(test.adaptive?.sentences ?? [])] : questions;
}

export function attemptSections(test: Test, attempt: UserAttempt): Section[] {
  if (!attempt.route) return test.sections;
  return attempt.route.map((ids, index) => {
    const { type, seconds } = examPlan(test)[index];
    const id = test.id + "-adaptive-" + (index + 1);
    if (type === "writing") return { id, type, seconds, questions: [], writingPrompt: test.adaptive!.writing };
    if (type === "wordFormation") return { id, type, seconds, questions: [], wordItems: test.adaptive!.wordFormation };
    if (type === "grammar") return { id, type, seconds, questions: test.adaptive!.grammar };
    if (type === "lecture" || type === "continuation") {
      const clips = test.adaptive!.listening!.clips;
      return { id, type, seconds, clips, questions: clips.flatMap(clip => clip.questions) };
    }
    const candidates = pool(test, type);
    const questions = ids.map(questionId => {
      const question = candidates.find(item => item.id === questionId);
      if (!question) throw new Error("Saved section item is missing: " + questionId);
      return question;
    });
    const passage = type === "reading"
      ? test.sections.find(section => section.questions.some(question => question.id === ids[0]))?.passage
      : undefined;
    return { id, type, seconds, questions, passage };
  });
}

// Regularized Rasch-style estimate using editorial item difficulty on a shared scale.
export function estimateAbility(questions: Question[], answers: UserAttempt["answers"]) {
  let low = -4;
  let high = 4;
  for (let iteration = 0; iteration < 24; iteration++) {
    const theta = (low + high) / 2;
    let gradient = -0.55 * theta;
    for (const question of questions) {
      const location = (question.difficulty - 3) * 0.85;
      const probability = 1 / (1 + Math.exp(location - theta));
      gradient += Number(answers[question.id] === question.correctIndex) - probability;
    }
    if (gradient > 0) low = theta;
    else high = theta;
  }
  return (low + high) / 2;
}

function passageDemand(section: Section) {
  const paragraphs = section.passage!.paragraphs.join(" ");
  const words = paragraphs.match(/[a-z]+(?:['’-][a-z]+)*/gi) ?? [];
  const sentences = paragraphs.split(/[.!?]+/).filter(line => line.trim()).length;
  return words.length / Math.max(1, sentences) + 22 * words.filter(word => word.length >= 8).length / words.length;
}

export function selectSection(test: Test, attempt: UserAttempt): string[] {
  const delivered = attemptSections(test, attempt);
  const stage = examPlan(test)[delivered.length];
  if (!stage || !isCore(stage.type)) return [];
  const previous = delivered.flatMap(section => section.questions);
  const seen = new Set(previous.map(question => question.id));
  const ability = estimateAbility(previous, attempt.answers);
  const highest = delivered.length === 1 ? 4 : 5;
  const target = delivered.length === 0 ? 3 : Math.max(1, Math.min(highest, 3 + Math.round(ability / 0.65)));
  if (stage.type === "reading") {
    const passages = test.sections.filter(section => section.type === "reading").sort((a, b) => passageDemand(a) - passageDemand(b));
    return passages[target >= 4 ? 1 : 0].questions.map(question => question.id);
  }
  return pool(test, stage.type)
    .filter(question => !seen.has(question.id))
    .sort((a, b) => Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target) || a.difficulty - b.difficulty)
    .slice(0, stage.count)
    .sort((a, b) => a.difficulty - b.difficulty)
    .map(question => question.id);
}

export function mayAdvanceEarly(section: Section, attempt: UserAttempt) {
  if (!attempt.route) return true;
  if (section.writingPrompt) return !!attempt.written?.[section.id]?.trim();
  if (section.wordItems) return section.wordItems.every(item => /^[a-z]+$/i.test(attempt.written?.[item.id]?.trim() ?? ""));
  return section.questions.every(item => attempt.answers[item.id] !== undefined);
}
