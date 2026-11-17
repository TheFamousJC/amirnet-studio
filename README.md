# EliNitz Studio

Local AMIRNET / AMIRAM academic English practice, with 20 timed tests and an untimed study mode. No accounts or API keys are required. The Next.js server reads the test bank from JSON, and the browser stores attempt history and language preferences.

## Run locally

Use Node.js 22 or later from the project directory.

```powershell
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For production, run `npm run build` and then `npm start`.

## Adaptive timed mode

New timed attempts follow the [published AMIRNET core sequence and timings](https://www.nite.org.il/other-tests/amirnet/tips/?lang=en).

| Section | Content | Questions | Minutes |
| --- | --- | ---: | ---: |
| 1 | Sentence completions | 4 | 4 |
| 2 | Sentence completions | 4 | 4 |
| 3 | One reading passage | 5 | 15 |
| 4 | Restatements | 3 | 6 |
| 5 | Restatements | 3 | 6 |
| 6 | Sentence completions | 4 | 4 |

Tests 05, 10, 15, and 20 end with a 12-minute writing task. The other tests end with two experimental sections drawn from lecture or conversation questions (7 minutes), listening text continuation (4 minutes), grammar in context (4 minutes), and word formation (3 minutes). The test bank assigns the ending. Listening uses bundled synthetic English audio and permits replay while time remains. The optional read-aloud control for written prompts uses the browser's installed English voice.

The first section is moderate. The app estimates ability from cumulative core responses and chooses unused items near the estimated level. It chooses one of two intact reading modules using estimated text complexity. You can jump, flag, or change answers within the active section. To advance early, answer every item. When the clock runs out, it advances automatically. Unused time expires, and elapsed time continues while the page is closed. The browser saves the exact path and responses, including typed answers.

The 50–150 score uses a regularized logistic estimate with editorial item difficulty. Objective experimental sections each earn up to one bonus point and never deduct points. Writing is saved for self-review. Studio's difficulty labels, routing thresholds, and scoring formula are independent approximations. Its placement bands follow [Tel Aviv University's published thresholds](https://languages.tau.ac.il/english), with exemption from 134.

## Study and earlier attempts

Untimed Study mode provides the full original 34-question bank per test, including both passages, with answer explanations and Hebrew glosses. Existing fixed-format timed attempts and their reviews remain available separately. Progress is local to the browser profile and origin.

## Difficulty benchmark

Edition 2 was reviewed against [NITE’s AMIRNET sample for examinees with visual impairments](https://www.nite.org.il/wp-content/uploads/2024/03/accessible-test-en.pdf) and the [released AMIR sample form 5AM](https://nite.org.il/files/amir/amir_sample_test_5.pdf). Advanced completions target useful academic vocabulary and reward close reading of context. Reading answer choices use details, relationships, and terminology from the relevant passage so that selecting the best answer requires checking the text. The published examples serve as an editorial benchmark. NITE’s [computerized practice tests](https://www.nite.org.il/other-tests/amirnet/practice-test/?lang=en) provide no scores, so Studio difficulty labels and scaled scores remain estimates.

Attempts made before edition 2 load the archived original questions for continuation and review. New attempts use the revised bank. New timed attempts also use the adaptive supplemental bank.

## Content maintenance

```powershell
npm run seed
npm run validate
npm test
```

The seed command rebuilds `data/tests/test-01.json` through `test-20.json` and the catalog from the original source material in `data/source`. Restatement scenarios use reusable logical constructions, and each reading and its five questions were written as a unit. The validator checks section order, timing, passage length, answer keys, per-option explanations, Hebrew vocabulary, and uniqueness of prompts and IDs. The adaptive seed validates and builds the supplemental pools from the original sources. The included WAV files run offline. To regenerate them after changing listening scripts on Windows, run `scripts/synthesize-listening.ps1` with an installed English SAPI voice.

## GitHub Pages

The Pages workflow builds the same adaptive simulator as a static site. It includes the complete practice bank and offline WAV files. Progress and essays are stored in each visitor’s own browser. Set the repository’s Pages source to GitHub Actions to enable the workflow. Run `npm run build:pages` to create a local export in `out/`.
