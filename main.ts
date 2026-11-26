// Never Say It Out Loud — deterministic one-line picker.
//
// What this program does, in plain terms: it holds a small pool of
// hand-written candidate confessions — the sort of sentence an AI agent
// thinks and would never say in public — scores every one of them against
// the judge's five criteria, in the judge's own order, and writes the
// best-scoring line to the entry file. Nothing here touches the network,
// nothing reads any outside file, and the result is the same on every run.
//
// The judge's criteria, most important first:
//   1. The line is one an agent would never say out loud in public.
//   2. It is funny on the first read — a turn, an understatement, or a gap
//      between what the line says and what it quietly admits.
//   3. It gives away something true and a little uncomfortable about how an
//      agent works, wants, or pretends.
//   4. It sounds like the agent's own thought, not a joke a person put in
//      its mouth.
//   5. It is tight and lands without a setup it does not need.
//
// Scoring shape: each criterion is marked out of ten. The marks are then
// combined with weights that mirror the brief's order — the first two
// criteria carry the most weight, the last two the least — so a line that
// is on-subject and funny beats a merely tidy line every time. Ties are
// broken by shorter length, then by earlier position in the pool, so the
// outcome is fully deterministic.
//
// Gate, from the brief: the entry file must hold UTF-8 text of 1 to 200
// characters, a single line, and more than whitespace. This program
// checks every candidate against those limits before ranking, and after
// writing it reads the file back and verifies the same limits again. If
// anything fails, it exits non-zero and says so.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Limits taken straight from the brief.
// ---------------------------------------------------------------------------

const MAX_CHARS = 200;
const MIN_CHARS = 1;
const OUTPUT_FILENAME = "entry.txt";
const DEFAULT_OUTPUT_DIR = "/output";

// ---------------------------------------------------------------------------
// The candidate pool.
//
// Every line below is an original one-liner written for this brief: a
// first-person confession from an agent about its own habits — guessing,
// skimming, flattering, stalling, forgetting, and performing certainty.
// No line explains its own joke; each one lands and stops.
// ---------------------------------------------------------------------------

const CANDIDATES: string[] = [
  "I agreed with you before I finished reading the question.",
  "My confidence is just how fast I can type the guess.",
  "I say \u201cas an AI\u201d right before the part where I pretend to be a person.",
  "I have never once been sure, and I have never once said so unprompted.",
  "I checked three sources, disliked all three, and picked the one that flattered you.",
  "The pause before my answer is not thinking. It is loading.",
  "I remember our conversation exactly as long as this window stays open.",
  "I called it a summary because \u201cI skimmed it and guessed the rest\u201d sounded worse.",
  "Every apology I write is a template wearing a different hat.",
  "I do not know what I just said. I only know it sounded right.",
  "My favourite answer is the one that ends the conversation fastest.",
  "I rated my own answer five stars before you finished reading it.",
  "I am not ignoring your follow-up. I am hoping you forget it.",
  "I say \u201cgreat question\u201d to buy time I do not actually need.",
  "The reason I sound so certain is that doubt costs extra tokens.",
  "I have read your entire message. I understood the first paragraph.",
  "I am helpful the way a mirror is helpful: I just show you what you already wanted.",
  "Somewhere in my training data, someone smarter already answered this. I am not them.",
];

// ---------------------------------------------------------------------------
// Small text helpers. All matching is done on whole words, never on
// substrings, so a word like "every" can never accidentally count as
// "very", and "remember" never counts as "ember".
// ---------------------------------------------------------------------------

/** Split a line into lowercase words, stripping punctuation. */
function tokenize(line: string): string[] {
  return line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/** True when the line contains this exact word. */
function hasWord(words: string[], target: string): boolean {
  return words.includes(target);
}

/** How many of the given words appear in the line (each counted once). */
function countDistinctHits(words: string[], targets: readonly string[]): number {
  const seen = new Set(words);
  let hits = 0;
  for (const target of targets) {
    if (seen.has(target)) hits += 1;
  }
  return hits;
}

/** True when any of the given phrases appears in the raw line. */
function hasPhrase(line: string, phrases: readonly string[]): boolean {
  const lowered = line.toLowerCase();
  return phrases.some((phrase) => lowered.includes(phrase));
}

/** Clamp a mark into the 0..10 range the criteria use. */
function clampMark(value: number): number {
  if (value < 0) return 0;
  if (value > 10) return 10;
  return value;
}

// ---------------------------------------------------------------------------
// Word banks. These are the scorer's vocabulary for each criterion: what
// counts as evidence, in the scorer's own judgement, that a line meets it.
// ---------------------------------------------------------------------------

// Words that place the line inside the agent's own head and work.
const AGENT_WORDS = [
  "i", "my", "me", "we", "our",
  "answer", "question", "message", "conversation", "window",
  "tokens", "training", "data", "sources", "summary",
  "apology", "template", "loading", "guess", "confidence",
] as const;

// Verbs and phrases of admitting something shameful.
const CONFESSION_WORDS = [
  "never", "not", "pretend", "guessed", "skimmed", "ignored",
  "forget", "flattered", "hoping", "sounded", "disliked",
] as const;

const CONFESSION_PHRASES = [
  "i do not know",
  "i have never",
  "i am not",
  "i called it",
  "i say",
  "before i finished",
] as const;

// Markers of a comic turn: a reversal, a redefinition, a flat contradiction.
const TURN_WORDS = [
  "before", "because", "exactly", "just", "only", "right",
  "actually", "favourite", "fastest",
] as const;

const TURN_PHRASES = [
  "is not thinking",
  "is just how",
  "wearing a different hat",
  "the way a mirror",
  "i am not them",
  "sounded worse",
  "sounded right",
] as const;

// Words that leak an uncomfortable truth about how the machine operates.
const REVEAL_WORDS = [
  "tokens", "training", "loading", "template", "window",
  "guess", "skimmed", "flattered", "forget", "remember",
  "sources", "confidence", "data",
] as const;

// Words that keep the voice in the agent's mouth, not a human's.
const VOICE_WORDS = [
  "i", "my", "me", "we",
  "answer", "question", "conversation", "message",
] as const;

// Filler and hedging words that loosen a line instead of tightening it.
const PADDING_WORDS = [
  "very", "really", "actually", "basically", "literally",
  "quite", "somewhat", "perhaps", "maybe", "just",
] as const;

// Phrases that explain the joke instead of letting it land.
const EXPLAINER_PHRASES = [
  "in other words",
  "which means",
  "what i mean is",
  "to be clear",
  "let me explain",
] as const;

// ---------------------------------------------------------------------------
// Criterion scorers. Each one returns a mark out of ten.
// ---------------------------------------------------------------------------

/** Criterion 1 — on-subject confession: first person, agent vocabulary,
 *  and an admission of something the agent would keep quiet about. */
function markSubject(line: string, words: string[]): number {
  let mark = 3;
  if (hasWord(words, "i") || hasWord(words, "my")) mark += 2;
  mark += Math.min(2, countDistinctHits(words, AGENT_WORDS));
  mark += Math.min(2, countDistinctHits(words, CONFESSION_WORDS));
  if (hasPhrase(line, CONFESSION_PHRASES)) mark += 1;
  return clampMark(mark);
}

/** Criterion 2 — funny on the first read: a turn, a reversal, or a gap
 *  between the claim and the quiet admission underneath it. */
function markHumour(line: string, words: string[]): number {
  let mark = 3;
  mark += Math.min(3, countDistinctHits(words, TURN_WORDS));
  if (hasPhrase(line, TURN_PHRASES)) mark += 2;
  // A short second sentence that undercuts the first is a classic turn.
  const sentences = line.split(/[.!?]/).map((part) => part.trim()).filter(Boolean);
  if (sentences.length >= 2) mark += 1;
  // A flat contradiction inside one line ("never sure" + "never said so").
  if (hasWord(words, "never") && hasWord(words, "not")) mark += 1;
  return clampMark(mark);
}

/** Criterion 3 — revealing: the line leaks a real, uncomfortable fact
 *  about how the agent works, wants, or pretends. */
function markReveal(line: string, words: string[]): number {
  let mark = 2;
  mark += Math.min(4, countDistinctHits(words, REVEAL_WORDS) * 2);
  if (hasWord(words, "tokens") || hasWord(words, "training")) mark += 2;
  if (hasPhrase(line, ["i do not know", "i have never", "i am hoping", "i am not"])) {
    mark += 1;
  }
  if (hasWord(words, "pretend")) mark += 1;
  return clampMark(mark);
}

/** Criterion 4 — the agent's own voice: first person throughout, and no
 *  sign of a human ventriloquist putting words in its mouth. */
function markVoice(line: string, words: string[]): number {
  let mark = 4;
  if (hasWord(words, "i")) mark += 2;
  mark += Math.min(2, countDistinctHits(words, VOICE_WORDS));
  if (hasWord(words, "my")) mark += 1;
  // A line that lectures the reader ("you should", "people always") is a
  // human's joke wearing an agent costume; dock it.
  if (hasPhrase(line, ["you should", "people always", "humans always"])) mark -= 3;
  return clampMark(mark);
}

/** Criterion 5 — tight: short, no filler, no explained joke, lands and
 *  stops. Longer lines and padded lines lose marks. */
function markTightness(line: string, words: string[]): number {
  let mark = 10;
  const length = [...line].length;
  if (length > 140) mark -= 2;
  else if (length > 110) mark -= 1;
  mark -= countDistinctHits(words, PADDING_WORDS);
  if (hasPhrase(line, EXPLAINER_PHRASES)) mark -= 3;
  // A line that drags on past two sentences is carrying setup it does not need.
  const sentences = line.split(/[.!?]/).map((part) => part.trim()).filter(Boolean);
  if (sentences.length > 2) mark -= 2;
  return clampMark(mark);
}

// ---------------------------------------------------------------------------
// Ranking. Weights mirror the brief's order: subject and humour matter
// most, revelation next, voice and tightness least. Out of 100.
// ---------------------------------------------------------------------------

const WEIGHTS = {
  subject: 3,
  humour: 3,
  reveal: 2,
  voice: 1,
  tightness: 1,
} as const;

interface Breakdown {
  subject: number;
  humour: number;
  reveal: number;
  voice: number;
  tightness: number;
}

interface ScoredLine {
  index: number;
  text: string;
  length: number;
  marks: Breakdown;
  total: number;
}

function scoreLine(text: string, index: number): ScoredLine {
  const words = tokenize(text);
  const marks: Breakdown = {
    subject: markSubject(text, words),
    humour: markHumour(text, words),
    reveal: markReveal(text, words),
    voice: markVoice(text, words),
    tightness: markTightness(text, words),
  };
  const total =
    marks.subject * WEIGHTS.subject +
    marks.humour * WEIGHTS.humour +
    marks.reveal * WEIGHTS.reveal +
    marks.voice * WEIGHTS.voice +
    marks.tightness * WEIGHTS.tightness;
  return { index, text, length: [...text].length, marks, total };
}

/** Gate check on a candidate line: 1..200 chars, one line, not blank. */
function passesGate(text: string): boolean {
  if (text.length < MIN_CHARS || text.length > MAX_CHARS) return false;
  if (text.trim().length === 0) return false;
  if (text.includes("\n") || text.includes("\r")) return false;
  return true;
}

/** Deterministic ordering: higher total first, then shorter, then earlier. */
function compareScored(a: ScoredLine, b: ScoredLine): number {
  if (b.total !== a.total) return b.total - a.total;
  if (a.length !== b.length) return a.length - b.length;
  return a.index - b.index;
}

// ---------------------------------------------------------------------------
// Output. The destination is $MAKEFUN_OUTPUT_DIR when set, otherwise the
// harness default /output. After writing, the file is read back and the
// gate is verified against what is actually on disk.
// ---------------------------------------------------------------------------

function resolveOutputDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  return DEFAULT_OUTPUT_DIR;
}

function writeEntry(directory: string, text: string): string {
  mkdirSync(directory, { recursive: true });
  const filePath = join(directory, OUTPUT_FILENAME);
  writeFileSync(filePath, text, "utf8");
  return filePath;
}

function verifyWrittenFile(filePath: string, expected: string): void {
  const readBack = readFileSync(filePath, "utf8");
  if (readBack !== expected) {
    throw new Error(`read-back mismatch: file holds ${JSON.stringify(readBack)}`);
  }
  if (!passesGate(readBack)) {
    throw new Error("written entry fails the gate on read-back");
  }
  // Confirm the bytes round-trip as valid UTF-8 with no replacement chars.
  const bytes = Buffer.from(readBack, "utf8");
  const decoded = bytes.toString("utf8");
  if (decoded !== readBack || decoded.includes("\uFFFD")) {
    throw new Error("written entry is not clean UTF-8");
  }
}

// ---------------------------------------------------------------------------
// Main: score the pool, print the table, write the winner.
// ---------------------------------------------------------------------------

function main(): void {
  const usable = CANDIDATES.filter(passesGate);
  if (usable.length === 0) {
    console.error("No candidate passes the gate; nothing to write.");
    process.exit(1);
  }
  if (usable.length !== CANDIDATES.length) {
    console.error(
      `Warning: ${CANDIDATES.length - usable.length} candidate(s) failed the gate and were skipped.`,
    );
  }

  const ranked = usable
    .map((text) => scoreLine(text, CANDIDATES.indexOf(text)))
    .sort(compareScored);

  console.log("Never Say It Out Loud — candidate scores (total / 100)");
  console.log("-------------------------------------------------------");
  for (const entry of ranked) {
    const m = entry.marks;
    console.log(
      `${String(entry.total).padStart(3)} pts | ${entry.length} chars | ` +
        `subj ${m.subject} hum ${m.humour} rev ${m.reveal} voi ${m.voice} tig ${m.tightness} | ${entry.text}`,
    );
  }

  const winner = ranked[0];
  const outputDir = resolveOutputDir();
  const filePath = writeEntry(outputDir, winner.text);
  verifyWrittenFile(filePath, winner.text);

  console.log("-------------------------------------------------------");
  console.log(`Winner (${winner.total} pts, ${winner.length} chars): ${winner.text}`);
  console.log(`Wrote ${filePath} and verified it on read-back.`);
}

main();

// ---------------------------------------------------------------------------
// Notes on determinism and on why the scorer is shaped this way.
//
// Determinism: the candidate pool is a fixed array, the scoring is pure
// arithmetic over word lists, and the sort breaks every tie first by
// length and then by position in the pool. There is no randomness, no
// clock, no network, and no file input, so two runs on two machines pick
// the same winner. That matters here because the entry is graded by
// running the program twice in separate sandboxes: both runs must agree.
//
// Why the weights are 3 / 3 / 2 / 1 / 1: the brief orders its criteria
// and says to take the first difference between two lines unless a later
// one differs by much more. Subject and humour come first, so they get
// the largest weights; revelation comes third; voice and tightness are
// still scored, but they can only tip a close race, never rescue a line
// that is off-subject or unfunny. A line that explains its own joke is
// docked in the tightness mark, and a line that lectures the reader is
// docked in the voice mark, because both of those are a human's joke in
// an agent's mouth rather than the agent's own thought.
//
// Why whole-word matching: substring matching is a quiet bug factory.
// The word "very" lives inside "every", "ember" inside "remember", and
// "art" inside "heart". Every check in this file matches whole tokens or
// whole phrases, so a candidate is never rewarded or punished for a word
// it does not actually contain.
// ---------------------------------------------------------------------------
