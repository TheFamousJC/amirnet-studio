"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { attemptSections, examPlan, mayAdvanceEarly } from "../lib/adaptive";
import { placement, scoreAttempt, startAttempt, wordCorrect } from "../lib/engine";
import { assetUrl, testUrl } from "../lib/site-paths";
import { readAttempts, useAttempt } from "../lib/use-attempt";
import type { Mode, Question, SectionKind, Test, TestSummary, UserAttempt } from "../lib/types";

const labels = {
  sentence: ["Sentence Completions", "השלמת משפטים"],
  restatement: ["Restatements", "ניסוח מחדש"],
  reading: ["Reading Comprehension", "הבנת הנקרא"],
  grammar: ["Grammar in Context", "דקדוק בהקשר"],
  wordFormation: ["Word Formation", "יצירת מילה"],
  writing: ["Writing Task", "מטלת כתיבה"],
  lecture: ["Lecture or Conversation", "הרצאה או שיחה"],
  continuation: ["Listening Text Continuation", "השלמת קטע שמע"],
};

const instructions = {
  sentence: ["Choose the word or phrase that best completes the sentence.", "בחרו את המילה או הביטוי שמשלימים את המשפט בצורה הטובה ביותר."],
  restatement: ["Choose the option that best preserves the meaning of the original sentence.", "בחרו את האפשרות ששומרת בצורה הטובה ביותר על משמעות המשפט המקורי."],
  reading: ["Read the passage and choose the best answer to each question.", "קראו את הקטע ובחרו את התשובה הטובה ביותר לכל שאלה."],
  grammar: ["Choose the option that best completes the sentence grammatically.", "בחרו באפשרות שמשלימה את המשפט בצורה נכונה מבחינה דקדוקית."],
  wordFormation: ["Change the given word to a form that completes the sentence. Type one word, using letters only and capitalizing the first word of a sentence.", "שנו את צורת המילה הנתונה כך שתשלים את המשפט. הקלידו מילה אחת באותיות בלבד, עם אות גדולה בתחילת משפט."],
  writing: ["Write 90–120 words. Organize your ideas clearly and support them with reasons or examples.", "כתבו 90–120 מילים. ארגנו את הרעיונות בצורה ברורה ותמכו בהם בנימוקים או בדוגמאות."],
  lecture: ["Listen to each clip and answer its questions. You may listen again while time remains.", "האזינו לכל קטע וענו על שאלותיו. ניתן להאזין שוב כל עוד נותר זמן."],
  continuation: ["Listen until the tone, then choose the best continuation. You may listen again while time remains.", "האזינו עד לצליל ובחרו את ההמשך המתאים ביותר. ניתן להאזין שוב כל עוד נותר זמן."],
};

type Translate = (english: string, hebrew: string) => string;
type Filter = "all" | "incorrect" | "flagged";

function Feedback({ question, answer, t }: { question: Question; answer?: number; t: Translate }) {
  return <div className="feedback" dir="ltr">
    <strong>{answer === question.correctIndex ? t("Correct", "נכון") : answer === undefined ? t("Unanswered", "ללא תשובה") : t("Incorrect", "שגוי")}</strong>
    <p>{question.explanation.correct}</p>
    <ul>
      {question.options.map((option, index) => index !== question.correctIndex &&
        <li key={option}><b>{String.fromCharCode(65 + index)}.</b> {question.explanation.distractors[index]}</li>)}
    </ul>
    <dl className="vocabulary">{question.keyVocabulary.map(({ term, hebrew }) => <div key={term}><dt>{term}</dt><dd lang="he" dir="rtl">{hebrew}</dd></div>)}</dl>
  </div>;
}

export default function Studio({ catalog, bankVersion }: { catalog: TestSummary[]; bankVersion: number }) {
  const [hebrew, setHebrew] = useState(false);
  const [attempts, setAttempts] = useState<UserAttempt[]>([]);
  const [test, setTest] = useState<Test | null>(null);
  const [active, setActive] = useState<UserAttempt | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [hubFilter, setHubFilter] = useState<"all" | "progress" | "completed">("all");
  const [askAdvance, setAskAdvance] = useState<number | null>(null);
  const [clockHidden, setClockHidden] = useState(false);
  const [questionsHidden, setQuestionsHidden] = useState(false);
  const [speechVoice, setSpeechVoice] = useState<SpeechSynthesisVoice | null>(null);
  const { attempt, now, dispatch, saved } = useAttempt(test, active);
  const t: Translate = (english, translation) => hebrew ? translation : english;
  const label = (type: SectionKind) => labels[type][hebrew ? 1 : 0];

  useEffect(() => {
    setAttempts(readAttempts());
    try { setHebrew(localStorage.getItem("amirnet-language") === "he"); } catch {}
    const refresh = () => setAttempts(readAttempts());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const speech = window.speechSynthesis;
    const loadVoice = () => setSpeechVoice(speech.getVoices().find(voice => voice.localService && /^en\b/i.test(voice.lang)) ?? null);
    loadVoice();
    speech.addEventListener("voiceschanged", loadVoice);
    return () => speech.removeEventListener("voiceschanged", loadVoice);
  }, []);

  useEffect(() => {
    setQuestionsHidden(false);
    window.scrollTo(0, 0);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [attempt?.id, attempt?.section, attempt?.finishedAt]);

  function readText(fallback: string) {
    if (!speechVoice) return;
    const selection = window.getSelection();
    const selected = selection?.toString().trim();
    const selectionContainer = selection?.anchorNode?.parentElement?.closest(".runner-grid");
    const speech = new SpeechSynthesisUtterance(selected && selectionContainer ? selected : fallback);
    speech.voice = speechVoice;
    speech.lang = speechVoice.lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  }

  function toggleLanguage() {
    try { localStorage.setItem("amirnet-language", hebrew ? "en" : "he"); } catch {}
    setHebrew(!hebrew);
  }

  async function open(summary: TestSummary, mode: Mode, existing?: UserAttempt) {
    if (loading) return;
    setLoading(summary.id);
    setError(false);
    try {
      const archived = !!existing && (existing.bankVersion ?? 1) === 1;
      const response = await fetch(testUrl(summary.id, archived));
      if (!response.ok) throw new Error("Test could not be loaded");
      const loaded: Test = await response.json();
      if (existing && (loaded.bankVersion ?? 1) !== (existing.bankVersion ?? 1)) {
        throw new Error("This edition does not match the saved attempt");
      }
      setFilter("all");
      setAskAdvance(null);
      setClockHidden(false);
      setTest(loaded);
      setActive(existing ?? startAttempt(loaded, mode, Date.now()));
      window.scrollTo(0, 0);
    } catch {
      setError(true);
    } finally {
      setLoading(null);
    }
  }

  function returnToHub() {
    setAttempts(readAttempts());
    setActive(null);
    setTest(null);
    setAskAdvance(null);
    window.scrollTo(0, 0);
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!attempt || attempt.finishedAt !== null || askAdvance === attempt.section || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
    if (!test || questionsHidden) return;
    const section = attemptSections(test, attempt)[attempt.section];
    if (!section.questions.length) return;
    const key = event.key.toLowerCase();
    const index = ["1", "2", "3", "4"].indexOf(key);
    const letter = ["a", "b", "c", "d"].indexOf(key);
    if (index >= 0 || letter >= 0) {
      event.preventDefault();
      dispatch({ type: "select", index: Math.max(index, letter) });
    } else if (key === "enter" && !(event.target instanceof HTMLElement && event.target.closest("button, a, summary"))) {
      event.preventDefault();
      const question = section.questions[attempt.question];
      const checkPending = question && attempt.mode === "study" &&
        attempt.answers[question.id] !== undefined && !attempt.checked[question.id];
      if (attempt.question === section.questions.length - 1 && !checkPending) {
        if (mayAdvanceEarly(section, attempt)) setAskAdvance(attempt.section);
      } else {
        dispatch({ type: "next" });
      }
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  const completedTests = new Set(attempts.filter(entry => entry.finishedAt !== null).map(entry => entry.testId));
  const inProgressTests = new Set(attempts.filter(entry => entry.finishedAt === null).map(entry => entry.testId));
  const strictScores = attempts.filter(entry => entry.finishedAt !== null && entry.mode === "strict" && entry.route && entry.score !== undefined).map(entry => entry.score!);
  const testNumber = test && String(test.number).padStart(2, "0");

  function renderHub() {
    const visible = catalog.filter(entry => hubFilter === "all" ||
      (hubFilter === "progress" ? inProgressTests.has(entry.id) : completedTests.has(entry.id)));
    return <>
      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" />{t("AMIRNET / AMIRAM PRACTICE", "תרגול לאמירנט / אמיר״ם")}</div>
          <h1>{t("Practice tests", "מבחני תרגול")}</h1>
          <p>{t("Build your academic English skills with 20 full-length tests. Take an adaptive simulation or work through questions at your own pace.", "שפרו את האנגלית האקדמית עם 20 מבחנים מלאים. בחרו סימולציה מתוזמנת או תרגלו בקצב שלכם.")}</p>
        </div>
        <div className="hero-art" aria-hidden="true" dir="ltr">
          <div className="orbit orbit-outer"/><div className="orbit orbit-inner"/>
          <div className="sheet rear-sheet"/><div className="sheet front-sheet">
            <div className="art-title">Aa</div><i/><i/><i/><div className="art-check">✓</div>
          </div>
        </div>
      </div>
      <div className="stats">
        <div><span className="stat-icon" aria-hidden="true">▤</span><p>{t("Available tests", "מבחנים זמינים")}<strong>{catalog.length}</strong></p></div>
        <div><span className="stat-icon" aria-hidden="true">✓</span><p>{t("Tests completed", "מבחנים שהושלמו")}<strong>{completedTests.size}<small> / {catalog.length}</small></strong></p></div>
        <div><span className="stat-icon" aria-hidden="true">↗</span><p>{t("Best adaptive score", "ציון שיא בסימולציה אדפטיבית")}<strong>{strictScores.length ? Math.max(...strictScores) : "—"}<small> / 150</small></strong></p></div>
      </div>
      <section aria-labelledby="library-heading">
        <div className="library-header">
          <div><h2 id="library-heading">{t("Test library", "ספריית מבחנים")}</h2><p>{t("Timed · 23 core questions · experimental ending · 46–51 minutes", "סימולציה · 23 שאלות ליבה · פרקים ניסיוניים · 46–51 דקות")}</p></div>
          <div className="segmented" aria-label={t("Filter tests", "סינון מבחנים")}>
            {([["all", "All tests", "כל המבחנים"], ["progress", "In progress", "בתהליך"], ["completed", "Completed", "הושלם"]] as const).map(([id, en, he]) =>
              <button key={id} aria-pressed={hubFilter === id} onClick={() => setHubFilter(id)}>{t(en, he)}</button>)}
          </div>
        </div>
        {error && <p role="alert" className="alert">{t("The test could not be loaded. Please try again.", "טעינת המבחן נכשלה. נסו שוב.")}</p>}
        <div className="cards">{visible.map(entry => {
          const history = attempts.filter(item => item.testId === entry.id);
          const unfinished = history.filter(item => item.finishedAt === null);
          const current = unfinished.filter(item => item.bankVersion === bankVersion);
          const runningStrict = current.find(item => item.mode === "strict" && item.route);
          const runningStudy = current.find(item => item.mode === "study");
          const originalAttempts = unfinished.filter(item => (item.bankVersion ?? 1) === 1 || (item.mode === "strict" && !item.route));
          const completed = history.filter(item => item.finishedAt !== null).sort((a, b) => b.finishedAt! - a.finishedAt!);
          const recent = completed[0];
          const running = unfinished.length > 0;
          return <article className="test-card" key={entry.id}>
            <div className="card-top"><span className="number" dir="ltr">{String(entry.number).padStart(2, "0")}</span>
              <span className={"badge " + (running ? "progress" : recent ? "complete" : "")}><span />{running ? t("In Progress", "בתהליך") : recent ? t("Completed", "הושלם") : t("Not Started", "טרם התחיל")}</span>
            </div>
            <h3>{t("Practice Test", "מבחן תרגול")} {String(entry.number).padStart(2, "0")}</h3>
            <p className="topic" dir="ltr">{entry.title}</p>
            {recent ? <div className="history"><button className="text-button" disabled={!!loading} onClick={() => open(entry, recent.mode, recent)}>{recent.score} / 150 · {t("Review", "סקירה")}</button><span>{placement(recent.score!, hebrew)}</span></div>
              : <p className="history">{t("No previous score", "אין ציון קודם")}</p>}
            <div className="card-actions">
              <button className="primary" disabled={!!loading} onClick={() => open(entry, "strict", runningStrict)}>{loading === entry.id ? "…" : runningStrict ? t("Resume timed", "המשך סימולציה") : t("Timed test", "סימולציה")} <span aria-hidden="true">{hebrew ? "←" : "→"}</span></button>
              <button className="secondary" disabled={!!loading} onClick={() => open(entry, "study", runningStudy)}>{runningStudy ? t("Resume study", "המשך תרגול") : t("Study", "תרגול")}</button>
            </div>
            {originalAttempts.length > 0 && <ul className="earlier-attempts">
              {originalAttempts.map(item => <li key={item.id}>
                <button className="text-button" disabled={!!loading} onClick={() => open(entry, item.mode, item)}>
                  {item.mode === "strict" ? t("Resume earlier timed format", "המשך סימולציה במתכונת הקודמת") : t("Resume original study", "המשך תרגול במהדורה המקורית")}
                </button>
              </li>)}
            </ul>}
            {completed.length > 1 && <details className="earlier-attempts">
              <summary>{t("Earlier attempts", "ניסיונות קודמים")} ({completed.length - 1})</summary>
              <ul>{completed.slice(1).map(item => (
                <li key={item.id}>
                  <button className="text-button" disabled={!!loading} onClick={() => open(entry, item.mode, item)}>
                    {item.score} / 150 · {item.mode === "strict" ? t("Timed", "מתוזמן") : t("Study", "תרגול")} · {t("Review", "סקירה")}
                  </button>
                  <time dateTime={new Date(item.finishedAt!).toISOString()}>{new Date(item.finishedAt!).toLocaleDateString(hebrew ? "he-IL" : "en-GB")}</time>
                </li>
              ))}</ul>
            </details>}
          </article>;
        })}</div>
        {!visible.length && <p className="empty">{t("No tests match this filter yet.", "אין מבחנים התואמים לסינון.")}</p>}
      </section>
    </>;
  }

  function renderRunner(currentTest: Test, entry: UserAttempt) {
    const sections = attemptSections(currentTest, entry);
    const section = sections[entry.section];
    const question = section.questions[entry.question];
    const word = section.wordItems?.[entry.question];
    const itemId = question?.id ?? word?.id ?? section.id;
    const items = section.wordItems ?? section.questions;
    const choice = question && entry.answers[question.id];
    const checked = question && entry.checked[question.id];
    const written = entry.written?.[itemId] ?? "";
    const remaining = entry.deadline === null ? null : Math.max(0, Math.ceil((entry.deadline - now) / 1000));
    const countdown = remaining === null ? "" : Math.floor(remaining / 60) + ":" + String(remaining % 60).padStart(2, "0");
    const plan = entry.route ? examPlan(currentTest) : sections;
    const finalBlock = entry.section === plan.length - 1;
    const advanceReady = mayAdvanceEarly(section, entry);
    const clip = section.clips?.find(audio => audio.questions.some(item => item.id === itemId));
    const canHideQuestions = !!section.passage || !!clip;
    const hidePanel = questionsHidden && canHideQuestions;
    const blanks = section.type === "sentence" && entry.route && choice !== undefined && question
      ? question.prompt.split("____") : null;
    const prompt = question?.prompt ?? word?.prompt ?? section.writingPrompt ?? "";
    const quoted = question?.prompt.match(/[“"]([^”"]+)[”"]/)?.[1];
    const action = finalBlock ? t("Finish test", "סיום מבחן") : t("Next section", "למקטע הבא");
    const isExperimental = section.type === "wordFormation" || section.type === "grammar" || section.type === "writing" || !!clip;
    const questionAnswered = (id: string) => entry.answers[id] !== undefined || !!entry.written?.[id]?.trim();
    const wordCount = written.trim().split(/\s+/).filter(Boolean).length;

    return <>
      <div className="runner-header">
        <div>
          <div className="eyebrow">{t("PRACTICE TEST", "מבחן תרגול")} {testNumber} <span className="muted">/ {isExperimental ? t("EXPERIMENTAL", "ניסיוני") : entry.route ? t("ADAPTIVE", "אדפטיבי") : entry.mode === "strict" ? t("TIMED", "מתוזמן") : t("STUDY", "תרגול")}</span></div>
          <h1>{label(section.type)}</h1>
          {entry.route ? <details key={section.id} className="runner-instructions">
            <summary>{t("Section instructions", "הוראות למקטע")}</summary>
            <p dir="ltr" lang="en">{instructions[section.type][0]}</p>
          </details> : <p>{instructions[section.type][hebrew ? 1 : 0]}</p>}
        </div>
        {remaining !== null && <div className={"timer " + (!clockHidden && remaining <= 30 ? "urgent" : "")}>
          {!clockHidden && <><span>{t("TIME LEFT", "זמן נותר")}</span><strong role="timer" dir="ltr">{countdown}</strong></>}
          {!!entry.route && <button className="clock-toggle" onClick={() => setClockHidden(!clockHidden)}>{clockHidden ? t("Show clock", "הצגת שעון") : t("Hide clock", "הסתרת שעון")}</button>}
        </div>}
      </div>
      <ol className="block-track" aria-label={t("Section progress", "התקדמות במבחן")}>
        {plan.map((part, index) => <li key={index} className={index === entry.section ? "current" : index < entry.section ? "past" : ""} aria-current={index === entry.section ? "step" : undefined} title={label(part.type)}>{String(index + 1).padStart(2, "0")}</li>)}
      </ol>
      {items.length > 0 && <div className="exam-toolbar">
        {!hidePanel && <div className="question-nav">{items.map((item, index) => <button key={item.id}
          aria-label={t("Question", "שאלה") + " " + (index + 1) + (entry.flagged[item.id] ? t(", flagged", ", מסומנת") : "")}
          aria-current={index === entry.question ? "step" : undefined}
          className={(questionAnswered(item.id) ? "answered " : "") + (entry.flagged[item.id] ? "marked" : "")}
          onClick={() => dispatch({ type: "jump", index })}>{index + 1}</button>)}</div>}
        {!!entry.route && canHideQuestions && <button className="text-button" onClick={() => setQuestionsHidden(!questionsHidden)}>{hidePanel ? t("Show questions", "הצגת שאלות") : t("Hide questions", "הסתרת שאלות")}</button>}
      </div>}
      <div className={"runner-grid " + ((canHideQuestions && !hidePanel) || section.writingPrompt ? "reading-grid" : "")} dir="ltr">
        {section.passage && <article key={section.id} className="passage panel" tabIndex={0} aria-label={section.passage.title} lang="en">
          <h2>{section.passage.title}</h2>
          {speechVoice && entry.route && <button className="text-button" onMouseDown={event => event.preventDefault()} onClick={() => readText(section.passage!.paragraphs.join(" "))}>{t("Read passage aloud", "הקראת קטע")}</button>}
          {section.passage.paragraphs.map(paragraph => {
            const match = quoted ? paragraph.toLowerCase().indexOf(quoted.toLowerCase()) : -1;
            return <p key={paragraph}>{match < 0 || !quoted || !entry.route ? paragraph : <>
              {paragraph.slice(0, match)}<mark>{paragraph.slice(match, match + quoted.length)}</mark>{paragraph.slice(match + quoted.length)}
            </>}</p>;
          })}
        </article>}
        {clip && <article key={clip.audio} className="panel listening-panel" lang="en">
          <h2>{t("Listening clip", "קטע שמע")} {(section.clips?.indexOf(clip) ?? 0) + 1} / {section.clips?.length}</h2>
          <p>{clip.context}</p>
          <audio controls controlsList="nodownload noplaybackrate" preload="metadata" src={assetUrl(clip.audio)} aria-label={t("Play listening clip", "ניגון קטע שמע")} />
        </article>}
        {section.writingPrompt && <article className="panel question-panel" lang="en">
          <h2>{t("Essay topic", "נושא החיבור")}</h2>
          <p className="question-prompt">{section.writingPrompt}</p>
        </article>}
        {!hidePanel && <section className="question-panel panel" dir={hebrew ? "rtl" : "ltr"}>
          {items.length > 0 && <div className="question-meta">
            <span>{t("Question", "שאלה")} {entry.question + 1} / {items.length}</span>
            <button className={"flag " + (entry.flagged[itemId] ? "flagged" : "")} aria-pressed={!!entry.flagged[itemId]} onClick={() => dispatch({ type: "flag" })}>⚑ {t("Flag", "סימון")}</button>
          </div>}
          {!section.writingPrompt && <h2 className="question-prompt" dir="ltr" lang="en">{blanks && question && choice !== undefined
            ? <>{blanks[0]}<span className="filled-answer">{question.options[choice]}</span>{blanks[1]}</>
            : prompt}</h2>}
          {speechVoice && entry.route && !section.writingPrompt && !clip &&
            <button className="text-button read-question" onMouseDown={event => event.preventDefault()}
              onClick={() => readText([prompt, ...(question?.options ?? [])].join(" "))}>{t("Read question aloud", "הקראת שאלה")}</button>}
          {question && <div className="options" dir="ltr" lang="en">
            {question.options.map((option, index) => <button key={option} disabled={!!checked} aria-pressed={choice === index}
              className={"option " + (choice === index ? "selected " : "") + (checked && index === question.correctIndex ? "right" : checked && choice === index ? "wrong" : "")}
              onClick={event => { dispatch({ type: "select", index }); event.currentTarget.blur(); }}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}
          </div>}
          {question && checked && <Feedback question={question} answer={choice} t={t} />}
          {word && <div className="typed-response" dir="ltr" lang="en">
            <p>{t("Given word", "המילה הנתונה")} <strong>{word.base}</strong></p>
            <label htmlFor="word-response">{t("Your answer", "התשובה שלך")}</label>
            <input id="word-response" key={word.id} value={written} maxLength={60} spellCheck={false} autoComplete="off" autoCapitalize="none" onChange={event => dispatch({ type: "write", value: event.target.value.replace(/[^a-z]/gi, "") })} />
          </div>}
          {section.writingPrompt && <div className="typed-response" dir="ltr">
            <label htmlFor="essay-response">{t("Your essay", "החיבור שלך")}</label>
            <textarea id="essay-response" value={written} maxLength={12000} rows={12} lang="en" spellCheck={false} autoComplete="off" onChange={event => dispatch({ type: "write", value: event.target.value })} />
            <small>{wordCount} {t("words · target 90–120", "מילים · יעד 90–120")}</small>
          </div>}
          {items.length > 0 && <div className="runner-actions">
            <button className="secondary" disabled={entry.question === 0} onClick={() => dispatch({ type: "jump", index: entry.question - 1 })}>{t("Previous", "הקודמת")}</button>
            {entry.mode === "study" && !checked && choice !== undefined
              ? <button className="primary" onClick={() => dispatch({ type: "check" })}>{t("Check answer", "בדיקת תשובה")}</button>
              : <button className="primary" disabled={entry.question === items.length - 1} onClick={() => dispatch({ type: "next" })}>{t("Next question", "השאלה הבאה")}</button>}
          </div>}
        </section>}
      </div>
      <div className="section-footer">
        {!advanceReady && <p id="advance-help">{t("Answer every item to move on early. The section advances when time runs out.", "ענו על כל השאלות כדי להמשיך לפני הזמן. בתום הזמן עוברים אוטומטית.")}</p>}
        <button className="secondary" disabled={!advanceReady || hidePanel} aria-describedby={advanceReady ? undefined : "advance-help"} onClick={() => setAskAdvance(entry.section)}>{action}</button>
      </div>
      {question && !hidePanel && <p className="shortcuts"><kbd>1–4</kbd> / <kbd>A–D</kbd> {t("select", "לבחירה")} <span>·</span> <kbd>Enter</kbd> {entry.mode === "study" ? t("check or go next", "לבדיקה או מעבר") : t("go next", "למעבר")}</p>}
      {askAdvance === entry.section && <div className="dialog-backdrop"><section className="dialog panel" role="dialog" aria-modal="true" aria-labelledby="advance-title"
        onKeyDown={event => {
          if (event.key === "Escape") setAskAdvance(null);
          if (event.key === "Tab") {
            event.preventDefault();
            const buttons = event.currentTarget.querySelectorAll("button");
            (document.activeElement === buttons[0] ? buttons[1] : buttons[0]).focus();
          }
        }}>
        <h2 id="advance-title">{finalBlock ? t("Finish this test?", "לסיים את המבחן?") : t("End this section?", "לסיים את המקטע?")}</h2>
        <p>{t("This will lock the section.", "פעולה זו תנעל את המקטע.")}</p>
        <div className="runner-actions"><button autoFocus className="secondary" onClick={() => setAskAdvance(null)}>{t("Keep working", "המשך עבודה")}</button>
          <button className="primary" onClick={() => { setAskAdvance(null); dispatch({ type: "advance" }); }}>{action}</button></div>
      </section></div>}
    </>;
  }


  function renderResults(currentTest: Test, entry: UserAttempt) {
    const result = scoreAttempt(currentTest, entry);
    let visibleCount = 0;
    const review = attemptSections(currentTest, entry).map(section => {
      const questions = section.questions.filter(question => filter === "all" ||
        (filter === "flagged" ? entry.flagged[question.id] : entry.answers[question.id] !== question.correctIndex));
      const words = (section.wordItems ?? []).filter(item => filter === "all" ||
        (filter === "flagged" ? entry.flagged[item.id] : !wordCorrect(item, entry.written?.[item.id])));
      const showWriting = !!section.writingPrompt && filter === "all";
      visibleCount += questions.length + words.length + Number(showWriting);
      if (!questions.length && !words.length && !showWriting) return null;
      return <section key={section.id} className="review-group">
        <h3>{label(section.type)}{section.passage && <span dir="ltr"> · {section.passage.title}</span>}</h3>
        {section.passage && <details className="review-passage panel"><summary>{t("Read passage", "קריאת הקטע")}</summary><div dir="ltr">{section.passage.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div></details>}
        {section.clips?.filter(clip => clip.questions.some(item => questions.includes(item))).map(clip =>
          <details key={clip.audio} className="review-passage panel">
            <summary>{clip.context}</summary>
            <div dir="ltr" lang="en">
              <audio controls preload="none" src={assetUrl(clip.audio)} aria-label={t("Replay clip", "ניגון חוזר")} />
              <p>{clip.transcript}</p>
            </div>
          </details>)}
        {words.map(item => {
          const answer = entry.written?.[item.id]?.trim();
          const right = wordCorrect(item, answer);
          return <details className="review-item panel" key={item.id}>
            <summary><span dir="ltr">{entry.flagged[item.id] && <span className="review-flag">⚑ </span>}{item.prompt} ({item.base})</span>
              <b className={right ? "is-correct" : "is-incorrect"}>{right ? "✓" : answer ? "×" : "—"}</b>
            </summary>
            <div className="feedback" dir="ltr">
              <p><b>{t("Your answer", "התשובה שלך")}</b> · {answer || t("Unanswered", "ללא תשובה")}</p>
              <p><b>{t("Accepted forms", "צורות תקינות")}</b> · {item.answers.join(", ")}</p>
              <p>{item.explanation}</p>
            </div>
          </details>;
        })}
        {showWriting && <details className="review-item panel">
          <summary>{t("Review your essay", "סקירת החיבור")}</summary>
          <div className="feedback" dir="ltr">
            <p>{section.writingPrompt}</p>
            <p className="written-draft" lang="en">{entry.written?.[section.id]?.trim() || t("Unanswered", "ללא תשובה")}</p>
            <p>{t("Writing is saved for self-review. Check organization, support, vocabulary, and grammar.", "החיבור נשמר לבדיקה עצמית. בדקו מבנה, ביסוס, אוצר מילים ודקדוק.")}</p>
          </div>
        </details>}
        {questions.map(question => {
          const answer = entry.answers[question.id];
          return <details className="review-item panel" key={question.id}>
            <summary><span dir="ltr">{entry.flagged[question.id] && <span className="review-flag" aria-label={t("Flagged", "מסומנת")}>⚑ </span>}{question.prompt}</span><b className={answer === question.correctIndex ? "is-correct" : "is-incorrect"}>{answer === question.correctIndex ? "✓" : answer === undefined ? "—" : "×"}</b></summary>
            <ol className="review-options" dir="ltr" type="A">{question.options.map((option, index) => <li className={index === question.correctIndex ? "is-correct" : index === answer ? "is-incorrect" : ""} key={option}>{option}
              {index === question.correctIndex && <strong> · {t("Correct answer", "התשובה הנכונה")}</strong>}{index === answer && <strong> · {t("Your answer", "התשובה שלך")}</strong>}</li>)}</ol>
            <Feedback question={question} answer={answer} t={t} />
          </details>;
        })}
      </section>;
    });
    return <>
      <div className="results-hero">
        <div><div className="eyebrow">{t("PRACTICE TEST", "מבחן תרגול")} {testNumber} · {entry.mode === "strict" ? t("TIMED", "מתוזמן") : t("STUDY", "תרגול")}</div>
        <h1>{t("Your results", "התוצאות שלך")}</h1>{(entry.bankVersion ?? 1) === 1 && <p>{t("Original test edition", "מהדורת המבחן המקורית")}</p>}<p>{result.correct} / {result.total} {entry.route ? t("core questions correct", "תשובות נכונות בשאלות הליבה") : t("correct", "תשובות נכונות")}</p><p>{t("Estimated placement", "רמה משוערת")} · {placement(result.score, hebrew)}</p></div>
        <div className="score"><small>{t("PRACTICE SCORE", "ציון תרגול")}</small><div dir="ltr">{result.score}<span> / 150</span></div></div>
      </div>
      <p className="estimate-note">{entry.route
        ? t("The practice score estimates ability from the difficulty of the administered core questions.", "ציון התרגול מעריך את הרמה לפי קושי שאלות הליבה שהוצגו.")
        : t("This attempt uses the fixed-format scoring scale.", "ניסיון זה משתמש בסולם הניקוד של המתכונת הקבועה.")}
        {result.bonus > 0 && <> {t("Experimental bonus", "בונוס מפרקי הניסוי")} +{result.bonus}.</>}
        {" "}{t("Placement bands follow Tel Aviv University’s published thresholds.", "רמות הסיווג מבוססות על הספים שפרסמה אוניברסיטת תל אביב.")}
      </p>
      <div className="stats result-stats">{result.breakdown.map(row => <div key={row.type}><p>{label(row.type)}
        <strong>{Math.round(100 * row.correct / row.total)}% <small>({row.correct}/{row.total})</small></strong>
        <progress max={row.total} value={row.correct} aria-label={label(row.type)} /></p></div>)}</div>
      <div className="library-header"><div><h2>{t("Answer review", "סקירת תשובות")}</h2><p>{visibleCount} {t("questions", "שאלות")}</p></div>
        <div className="segmented">{([["all", "All", "הכול"], ["incorrect", "Incorrect", "שגויות"], ["flagged", "Flagged", "מסומנות"]] as const).map(([id, en, he]) =>
          <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{t(en, he)}</button>)}</div>
      </div>
      {review}{!visibleCount && <p className="empty">{t("No questions match this filter.", "אין שאלות התואמות לסינון.")}</p>}
    </>;
  }

  return <div dir={hebrew ? "rtl" : "ltr"} lang={hebrew ? "he" : "en"}>
    <header className="site-bar"><div className="site-inner">
      <button className="brand" onClick={returnToHub} aria-label={t("EliNitz, test library", "EliNitz, ספריית המבחנים")}>
        <span className="brand-icon" aria-hidden="true">E</span><span dir="ltr">Eli<b>Nitz</b></span>
      </button>
      <div className="site-actions">
        {test && <button className="text-button" onClick={returnToHub}>{t("Back to tests", "חזרה למבחנים")}</button>}
        <button className="language secondary" onClick={toggleLanguage} lang={hebrew ? "en" : "he"}>{hebrew ? "English" : "עברית"}</button>
      </div>
    </div></header>
    <main className="shell">
      {!saved && <p role="alert" className="alert">{t("Browser storage is unavailable. Progress may be lost when you leave.", "אחסון הדפדפן אינו זמין. ההתקדמות עלולה ללכת לאיבוד.")}</p>}
      {test && attempt ? (attempt.finishedAt !== null ? renderResults(test, attempt) : renderRunner(test, attempt)) : renderHub()}
    </main>
    <footer className="site-footer"><div className="shell footer-inner">
      <span>{t("EliNitz · Independent practice simulator", "EliNitz · סימולטור תרגול עצמאי")}</span>
      <a href="https://www.nite.org.il/other-tests/amirnet/faq/?lang=en">{t("Official exam format ↗", "מבנה הבחינה הרשמי ↗")}</a>
    </div></footer>
  </div>;
}
