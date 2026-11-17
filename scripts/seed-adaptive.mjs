import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const read = name => JSON.parse(readFileSync(new URL("../data/source/" + name + ".json", import.meta.url), "utf8"));
const sentences = read("adaptive-sentences");
const experimental = read("experimental");
const listening = read("listening");
const output = new URL("../data/adaptive/", import.meta.url);
const unique = new Set();
const string = value => typeof value === "string" && !!value.trim();

function prompt(value) {
  assert(string(value), "Blank prompt");
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  assert(!unique.has(normalized), "Duplicate prompt: " + value);
  unique.add(normalized);
}

function mcq(item, id, type, fallbackLevel) {
  prompt(item.prompt);
  assert.equal(item.options.length, 4, id);
  assert.equal(new Set(item.options.map(option => option.trim().toLowerCase())).size, 4, id);
  assert(item.options.every(string), id);
  assert(Number.isInteger(item.correctIndex) && item.correctIndex >= 0 && item.correctIndex < 4, id);
  const wrong = ["0", "1", "2", "3"].filter(index => +index !== item.correctIndex);
  assert(string(item.explanation.correct), id);
  assert.deepEqual(Object.keys(item.explanation.distractors).sort(), wrong, id);
  assert(Object.values(item.explanation.distractors).every(string), id);
  assert(item.keyVocabulary.length && item.keyVocabulary.every(lexeme => string(lexeme.term) && /[א-ת]/.test(lexeme.hebrew)), id);
  const difficulty = item.difficulty ?? fallbackLevel;
  assert(Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5, id);
  return { ...item, id, type, difficulty };
}

assert.equal(sentences.length, 20);
assert.equal(experimental.length, 20);
assert.equal(listening.lecture.length, 8);
assert.equal(listening.continuation.length, 8);
mkdirSync(output, { recursive: true });
for (let number = 1; number <= 20; number++) {
  const testId = "test-" + String(number).padStart(2, "0");
  const test = JSON.parse(readFileSync(new URL("../data/tests/" + testId + ".json", import.meta.url), "utf8"));
  for (const section of test.sections) for (const item of section.questions) prompt(item.prompt);
}

for (const [index, item] of experimental.entries()) {
  const number = index + 1;
  const testId = "test-" + String(number).padStart(2, "0");
  assert.deepEqual(sentences[index].map(question => question.difficulty), [2, 3, 3, 4, 1, 2], testId);
  assert.equal(item.grammar.questions.length, 4, testId);
  assert.equal(item.wordFormation.length, 4, testId);
  prompt(item.writing);
  const adaptive = {
    sentences: sentences[index].map((question, j) => {
      assert.equal(question.prompt.match(/____/g)?.length, 1);
      return mcq(question, testId + "-adaptive-sentence-" + (j + 1), "sentence");
    }),
    grammar: item.grammar.questions.map((question, j) => mcq(question, testId + "-grammar-" + (j + 1), "grammar", 3)),
    wordFormation: item.wordFormation.map((question, j) => {
      prompt(question.prompt);
      assert(/^[a-z]+$/i.test(question.base), testId);
      assert(question.answers.length && question.answers.every(word => /^[a-z]+$/i.test(word) &&
        word.toLowerCase() !== question.base.toLowerCase()), testId);
      assert(string(question.explanation), testId);
      return { ...question, id: testId + "-word-" + (j + 1) };
    }),
    writing: item.writing,
  };
  if (number % 5 !== 0) {
    const ordinal = number - Math.floor(number / 5) - 1;
    const type = ordinal % 2 === 0 ? "lecture" : "continuation";
    const block = Math.floor(ordinal / 2);
    const clips = listening[type][block];
    assert.deepEqual(clips.map(clip => clip.questions.length), type === "lecture" ? [1, 2, 2] : [1, 1, 1, 1], testId);
    adaptive.listening = {
      type,
      clips: clips.map((clip, j) => {
        assert(string(clip.context) && string(clip.script), testId);
        const file = type + "-" + (block + 1) + "-" + (j + 1) + ".wav";
        return {
          context: clip.context, transcript: clip.script, audio: "/listening/" + file,
          questions: clip.questions.map((question, k) =>
            mcq(question, testId + "-audio-" + (j + 1) + "-" + (k + 1), type, 3)),
        };
      }),
    };
  }
  writeFileSync(new URL(testId + ".json", output), JSON.stringify(adaptive, null, 2) + "\n");
}
console.log("Seeded 20 supplemental adaptive banks with experimental tasks.");
