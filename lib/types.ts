export const categories = ["sentence", "restatement", "reading"] as const;
export type Category = typeof categories[number];
export type ListeningKind = "lecture" | "continuation";
export type SectionKind = Category | "grammar" | "wordFormation" | "writing" | ListeningKind;
export type Mode = "strict" | "study";
export interface Question {
  id: string;
  type: Category | "grammar" | ListeningKind;
  difficulty: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: { correct: string; distractors: Record<string, string> };
  keyVocabulary: { term: string; hebrew: string }[];
}
export interface WordFormationItem {
  id: string;
  prompt: string;
  base: string;
  answers: string[];
  explanation: string;
}
export interface ListeningClip {
  audio: string;
  context: string;
  transcript: string;
  questions: Question[];
}
export interface AdaptiveBank {
  sentences: Question[];
  grammar: Question[];
  wordFormation: WordFormationItem[];
  writing: string;
  listening?: { type: ListeningKind; clips: ListeningClip[] };
}
export interface Passage { title: string; paragraphs: string[] }
export interface Section {
  id: string;
  type: SectionKind;
  seconds: number;
  passage?: Passage;
  questions: Question[];
  wordItems?: WordFormationItem[];
  writingPrompt?: string;
  clips?: ListeningClip[];
}
export interface TestSummary { id: string; number: number; title: string }
export interface Test extends TestSummary { sections: Section[]; bankVersion?: number; adaptive?: AdaptiveBank }
export interface UserAttempt {
  id: string;
  testId: string;
  bankVersion?: number;
  mode: Mode;
  startedAt: number;
  finishedAt: number | null;
  deadline: number | null;
  section: number;
  question: number;
  answers: Record<string, number>;
  flagged: Record<string, boolean>;
  checked: Record<string, boolean>;
  route?: string[][];
  written?: Record<string, string>;
  score?: number;
}
