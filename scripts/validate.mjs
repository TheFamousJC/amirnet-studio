import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const layout = [
  ["sentence", 6, 240], ["sentence", 6, 240], ["reading", 5, 900],
  ["restatement", 6, 240], ["restatement", 6, 240], ["reading", 5, 900],
];
const kinds = ["detail", "inference", "main", "tone", "vocabulary"];
const normalized = value => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const meaningful = value => typeof value === "string" && value.trim().length > 0 && !/lorem ipsum|placeholder|repeat for tests/i.test(value);

export function validateBank(tests) {
  assert.equal(tests.length, 20, "Test count");
  const prompts = new Set();
  const passages = new Set();
  const titles = new Set();
  const ids = new Set();
  const lengths = [];
  for (const [index, test] of tests.entries()) {
    const id = "test-" + String(index + 1).padStart(2, "0");
    assert.equal(test.id, id);
    assert.equal(test.number, index + 1);
    assert(meaningful(test.title));
    assert.equal(test.sections.length, layout.length, id);
    for (const [sectionIndex, section] of test.sections.entries()) {
      const [type, length, seconds] = layout[sectionIndex];
      assert.equal(section.type, type, section.id);
      assert.equal(section.seconds, seconds, section.id);
      assert.equal(section.questions.length, length, section.id);
      assert(meaningful(section.id) && section.id.startsWith(id) && !ids.has(section.id), section.id);
      ids.add(section.id);
      if (type === "reading") {
        assert(meaningful(section.passage?.title), section.id);
        assert(!titles.has(normalized(section.passage.title)), section.passage.title);
        titles.add(normalized(section.passage.title));
        assert(section.passage.paragraphs.length >= 3 && section.passage.paragraphs.every(meaningful), section.id);
        const body = normalized(section.passage.paragraphs.join(" "));
        const words = body.split(" ").length;
        assert(words >= 350 && words <= 450, section.id + ": " + words + " words");
        lengths.push(words);
        assert(!passages.has(body), section.id + " duplicate passage");
        passages.add(body);
        assert.deepEqual(section.questions.map(question => question.kind).sort(), kinds, section.id);
      } else {
        assert.equal(section.passage, undefined, section.id);
        const advanced = sectionIndex === 1 || sectionIndex === 4;
        assert(section.questions.every(question => advanced ? question.difficulty >= 3 : question.difficulty <= 3), section.id);
      }
      for (const question of section.questions) {
        assert(meaningful(question.id) && question.id.startsWith(section.id) && !ids.has(question.id), question.id);
        ids.add(question.id);
        assert.equal(question.type, type, question.id);
        assert(Number.isInteger(question.difficulty) && question.difficulty >= 1 && question.difficulty <= 5, question.id);
        assert(meaningful(question.prompt), question.id);
        if (type === "sentence") assert.equal(question.prompt.match(/____/g)?.length, 1, question.id);
        const prompt = normalized(question.prompt);
        assert(!prompts.has(prompt), question.id + " duplicate prompt: " + question.prompt);
        prompts.add(prompt);
        assert(Array.isArray(question.options) && question.options.length === 4 && question.options.every(meaningful), question.id);
        assert.equal(new Set(question.options.map(normalized)).size, 4, question.id);
        assert(Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < 4, question.id);
        assert(meaningful(question.explanation?.correct), question.id);
        assert.deepEqual(Object.keys(question.explanation.distractors), ["0", "1", "2", "3"].filter(key => +key !== question.correctIndex), question.id);
        assert(Object.values(question.explanation.distractors).every(meaningful), question.id);
        assert(Array.isArray(question.keyVocabulary) && question.keyVocabulary.length > 0 && question.keyVocabulary.every(({ term, hebrew }) => meaningful(term) && meaningful(hebrew) && /[א-ת]/.test(hebrew)), question.id);
      }
    }
  }
  return { tests: tests.length, questions: prompts.size, passages: passages.size, minPassageWords: Math.min(...lengths), maxPassageWords: Math.max(...lengths) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = new URL("../data/tests/", import.meta.url);
  const files = readdirSync(directory).filter(file => file.endsWith(".json")).sort();
  const tests = files.map(file => {
    const test = JSON.parse(readFileSync(new URL(file, directory), "utf8"));
    assert.equal(file, test.id + ".json");
    return test;
  });
  for (const item of tests) assert.equal(item.bankVersion, 2, item.id + " bank edition");
  console.log(validateBank(tests));
}
