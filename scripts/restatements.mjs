import { readFileSync } from "node:fs";

const upper = value => value[0].toUpperCase() + value.slice(1);
const sentence = value => upper(value) + ".";
const entry = (prompt, options, correct, distractors) => ({
  prompt: sentence(prompt),
  options: options.map(sentence),
  correctIndex: 0,
  explanation: { correct, distractors: Object.fromEntries(distractors.map((reason, index) => [index + 1, reason])) },
});

const families = [
  { difficulty: 1, term: "although", hebrew: "אף על פי ש־", make: ([a, b], variant) => entry(
    (variant === 1 ? b + ', even though ' + a : variant === 2 ? 'it is true that ' + a + ', yet ' + b : 'although ' + a + ', ' + b),
    [a + '; nevertheless, ' + b, 'because ' + a + ', ' + b, b + ' only before it became clear that ' + a, b + ', which prevented anyone from finding out whether ' + a],
    'Both facts hold. “Nevertheless” preserves the contrast between “' + a + '” and “' + b + '.”',
    ['It presents the first fact as the reason for the second, whereas the sentence expresses a contrast.',
     'It limits the second fact to an earlier time and adds a discovery that the original never mentions.',
     'It introduces an obstacle to discovering the first fact, which the original states directly.']) },
  { difficulty: 1, term: "owing to", hebrew: "בגלל", make: ([a, b], variant) => entry(
    variant === 1 ? b + ' as a result of the fact that ' + a : variant === 2 ? b + ' because ' + a : 'owing to the fact that ' + a + ', ' + b,
    [a + '; consequently, ' + b, b + '; consequently, ' + a, a + '; nevertheless, ' + b, b + ', but it is unknown whether ' + a],
    '“Consequently” preserves the direction of the explanation: ' + a + ', leading to the result that ' + b + '.',
    ['It reverses the direction of cause and result.', 'It replaces the causal relationship with a concession.',
     'It casts doubt on the cause, which the original treats as an established fact.']) },
  { difficulty: 2, term: "once", hebrew: "ברגע ש־ / לאחר ש־", make: ([a, b]) => entry(
    'once ' + a + ', ' + b,
    [b + ' after ' + a, b + ' before ' + a, b.replace(' will ', ' will not ') + ' even after ' + a, b + ', regardless of whether ' + a],
    '“Once” places the completed event first. Only afterward is the second action scheduled. The first event has to be complete.',
    ['It places the scheduled action before the event that the sentence puts first.', 'It denies the stated plan to carry out the second action.',
     'It makes the first event irrelevant to the timing of the second.']) },
  { difficulty: 2, term: "on condition that", hebrew: "בתנאי ש־", make: ([a, b], variant) => entry(
    b + ' only if ' + a,
    [b + ' only on condition that ' + a, b + ' whether or not ' + a, b + ' in every case in which ' + a, b + ' only if it is impossible to establish that ' + a],
    'The condition “' + a + '” is necessary for the stated outcome. The sentence leaves open whether meeting it is sufficient.',
    ['It removes the requirement by making the outcome independent of the condition.', 'It treats the condition as sufficient and promises the outcome whenever it is met.',
     'It makes inability to verify the condition a reason for the outcome. The original requires that the condition itself be met.']) },
  { difficulty: 3, term: "by comparison", hebrew: "בהשוואה", make: ([a, b, phrase, reverse, dimension]) => entry(
    a + ' seemed ' + phrase + ' ' + b,
    [b + ' appeared to exceed ' + a + ' in ' + dimension, a + ' appeared to exceed ' + b + ' in ' + dimension, a + ' appeared to match ' + b + ' in ' + dimension, 'the difference in ' + dimension + ' was established when ' + b + ' ' + reverse + ' ' + a + ' in a formal test'],
    'It states the same apparent ordering by putting the higher-ranked item, ' + b + ', first. The comparison concerns ' + dimension + '.',
    ['It reverses the relative ranking of the two items.', 'It describes the two items as equal on the stated measure.',
     'It turns an impression into a demonstrated finding and invents a formal test.']) },
  { difficulty: 3, term: "but for", hebrew: "אלמלא / לולא", make: ([a, b]) => entry(
    'but for ' + a + ', ' + b,
    [b + ' in the absence of ' + a, b + ' because of ' + a, b + ' regardless of the effect of ' + a, 'whether ' + a + ' made any difference to the outcome is unknown'],
    '“But for” means “without.” The outcome “' + b + '” belongs to the hypothetical situation in which ' + a + ' was absent.',
    ['It attributes the hypothetical result to the presence of the factor rather than its absence.',
     'It predicts the same result without changing whether the factor was present.', 'It treats the effect as uncertain, whereas the original specifies how the hypothetical outcome differs.']) },
  { difficulty: 3, term: "even if", hebrew: "גם אם", make: ([a, b]) => entry(
    'even if ' + a + ', ' + b,
    [b + ', including in the event that ' + a, b + ' only in the event that ' + a, b.replace(' will still ', ' will ').replace(' will ', ' may or may not ') + ', depending on whether ' + a, a + '; therefore, ' + b],
    'The second outcome holds even in the special case that ' + a + '. The original leaves that case hypothetical.',
    ['It turns a condition that would make no difference into a requirement.', 'It makes the outcome depend on the hypothetical condition.',
     'It turns an open possibility into an established fact and presents it as the cause.']) },
  { difficulty: 4, term: "endorse", hebrew: "לתמוך רשמית", make: ([a, b]) => entry(
    a + ' neither endorsed nor expressly rejected ' + b,
    [a + ' offered no endorsement of ' + b + ' and issued no explicit rejection either', a + ' accepted ' + b + ' in principle while withholding public support',
     a + ' rejected ' + b + ' without giving a reason', a + ' withdrew an earlier endorsement of ' + b],
    '“Neither … nor” rules out both endorsement and explicit rejection. It leaves any private reservations or tacit views unspecified.',
    ['It invents an acceptance in principle, which cannot be inferred from the original.',
     'It asserts an explicit rejection, which the original rules out.',
     'It invents a prior endorsement and a reversal of position.']) },
  { difficulty: 4, term: "stem from", hebrew: "לנבוע מ־", make: ([a, b, c]) => entry(
    a + ' stemmed less from ' + b + ' than from ' + c,
    [c + ' contributed more to ' + a + ' than ' + b + ' did', b + ' was the greater contributor to ' + a + ', though ' + c + ' also mattered',
     b + ' and ' + c + ' played equally important roles in ' + a, a + ' was the principal reason for both ' + b + ' and ' + c],
    'The original ranks two contributing factors. It gives “' + c + '” greater explanatory weight than “' + b + '.”',
    ['It reverses the relative importance of the factors.', 'It makes the factors equally important despite the stated inequality.',
     'It makes the outcome cause the factors that are supposed to explain it.']) },
  { difficulty: 5, term: "not until", hebrew: "רק לאחר ש־", make: ([a, b, c]) => {
    const negative = 'did not ' + b.replace(/^(unlocked|displayed|circulated|reopened|released|credited|moved|played|left|awarded|treated|announced|compared|removed|made|agreed|accepted|lent)(?= )/, verb => ({
      unlocked:"unlock", displayed:"display", circulated:"circulate", reopened:"reopen", released:"release", credited:"credit", moved:"move",
      played:"play", left:"leave", awarded:"award", treated:"treat", announced:"announce", compared:"compare", removed:"remove", made:"make",
      agreed:"agree", accepted:"accept", lent:"lend",
    })[verb]);
    return entry(
      a + ' ' + negative + ' until ' + c,
      [a + ' ' + b + ' only after ' + c, a + ' ' + b + ' before ' + c,
       a + ' ' + negative + ', although ' + c, a + ' ' + b + ' as evidence that ' + c],
      'The event in the “until” clause preceded the main action. The version with “only after” preserves both the sequence and the occurrence of the action.',
      ['It reverses the sequence by placing the main action first.', 'It makes the main action fail to occur, whereas the original reports that it happened later.',
       'It turns a timing relationship into an assertion about the actor’s purpose.']);
  } },
  { difficulty: 5, term: "exception", hebrew: "חריג / יוצא מן הכלל", make: ([a, b, c, d], variant) => {
    const [verb, ...object] = b.split(" ");
    const singular = { carry: "carries", have: "has", cross: "crosses" }[verb] ?? (verb + "s");
    const predicate = d === "did" ? b : [singular, ...object].join(" ");
    return entry(
      variant === 1 ? 'except for ' + c + ', none of ' + a + ' ' + b
        : 'of ' + a + ', none ' + b + ' with the sole exception of ' + c,
      [c + ' ' + predicate + (d === 'did' ? '; the others in the same group did not' : '; the others in the same group do not'),
       'all ' + a + ' ' + b + ' except ' + c, 'it has not been determined whether ' + c + ' ' + predicate,
       c + ' ' + predicate + ', and at least one other member of the group shares that distinction'],
      'The restriction applies only to the group named. Within that group, ' + c + ' is the single item that has the stated property.',
      ['It gives the property to the entire group except the one item that actually has it.',
       'It changes an explicit exception into an uncertainty.',
       'It allows a second exception even though “sole” limits the number to one.']);
  } },
];

const blocks = readFileSync(new URL("../data/source/restatement-pairs.txt", import.meta.url), "utf8")
  .trim().split(/\r?\n\s*\r?\n/).map(block => block.split(/\r?\n/).map(row => row.split("|")));

if (blocks.length !== families.length || blocks.some(block => block.length !== 20)) {
  throw new Error("Restatement source must contain eleven families of twenty scenarios.");
}

const advanced = readFileSync(new URL("../data/source/advanced-restatements.txt", import.meta.url), "utf8")
  .trim().split(/\r?\n/).map((row, index) => {
    const parts = row.split("|");
    if (parts.length !== 11 || parts.some(part => !part.trim())) {
      throw new Error("Incomplete advanced restatement " + (index + 1));
    }
    const [term, hebrew, prompt, answer, first, second, third, correct, ...distractors] = parts;
    return {
      ...entry(prompt, [answer, first, second, third], correct, distractors),
      difficulty: 5,
      keyVocabulary: [{ term, hebrew }],
    };
  });

if (advanced.length !== 20) throw new Error("Each test needs one standalone advanced restatement.");

export const restatements = Array.from({ length: 20 }, (_, test) => [
  ...families.map(({ difficulty, term, hebrew, make }, family) => ({
    ...make(blocks[family][test], (test * 5 + family) % 3), difficulty, keyVocabulary: [{ term, hebrew }],
  })),
  advanced[test],
]);
