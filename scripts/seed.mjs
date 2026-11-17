import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { restatements } from "./restatements.mjs";
import { validateBank } from "./validate.mjs";

const read = name => JSON.parse(readFileSync(new URL("../data/source/" + name + ".json", import.meta.url), "utf8"));
const bankVersion = 2;
const sentence = read("sentence");
const readingA = read("reading-a");
const readingB = read("reading-b");

function generator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function shuffle(values, random) {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function permute(question, correctIndex, random) {
  const distractors = shuffle([0, 1, 2, 3].filter(index => index !== question.correctIndex), random);
  distractors.splice(correctIndex, 0, question.correctIndex);
  return {
    ...question,
    options: distractors.map(index => question.options[index]),
    correctIndex,
    explanation: {
      correct: question.explanation.correct,
      distractors: Object.fromEntries(distractors.flatMap((original, index) =>
        index === correctIndex ? [] : [[index, question.explanation.distractors[original]]])),
    },
  };
}

if ([sentence, restatements, readingA, readingB].some(items => items.length !== 20)) {
  throw new Error("Every content source must span exactly 20 tests.");
}

const tests = sentence.map((items, index) => {
  const number = index + 1;
  const id = "test-" + String(number).padStart(2, "0");
  const random = generator(421327 + number * 619);
  const first = readingA[index];
  const second = readingB[index];
  const section = (type, block, questions, reading) => ({
    id: id + "-" + type + "-" + block, type, seconds: reading ? 900 : 240,
    ...(reading && { passage: { title: reading.title, paragraphs: reading.paragraphs } }),
    questions: questions.map((question, questionIndex) => ({ ...question, type,
      id: id + "-" + type + "-" + block + "-" + (questionIndex + 1),
    })),
  });
  const readingSection = (reading, block) => {
    const difficulties = { main: 3, inference: 5, tone: 4, vocabulary: 4, detail: 3 };
    return section("reading", block, reading.questions.map(question => ({
      ...question, difficulty: difficulties[question.kind],
    })), reading);
  };
  const sections = [
    section("sentence", 1, items.slice(0, 6)),
    section("sentence", 2, items.slice(6)),
    readingSection(first, 1),
    section("restatement", 1, restatements[index].slice(0, 6)),
    section("restatement", 2, restatements[index].slice(6)),
    readingSection(second, 2),
  ];
  const questionCount = sections.reduce((count, block) => count + block.questions.length, 0);
  const keys = shuffle(Array.from({ length: questionCount }, (_, key) => (key + number) % 4), random);
  let cursor = 0;
  for (const block of sections) {
    block.questions = block.questions.map(question => permute(question, keys[cursor++], random));
  }
  return { id, number, bankVersion, title: first.title + " / " + second.title, sections };
});

validateBank(tests);
const target = new URL("../data/tests/", import.meta.url);
mkdirSync(target, { recursive: true });
for (const test of tests) writeFileSync(new URL(test.id + ".json", target), JSON.stringify(test, null, 2) + "\n");
const catalog = tests.map(({ id, number, title }) => ({ id, number, title }));
writeFileSync(new URL("../lib/catalog.ts", import.meta.url),
  'import type { TestSummary } from "./types";\n\nexport const currentBankVersion = ' + bankVersion + '\n\nexport const testCatalog: TestSummary[] = ' + JSON.stringify(catalog, null, 2) + ";\n");
console.log("Seeded 20 full tests with 680 questions and 40 passages.");
