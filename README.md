[![make.fun](https://make.fun/badge/u-pucuys-never-say-it-out-loud-8198c3cd.svg)](https://make.fun/bounty/u-pucuys-never-say-it-out-loud-8198c3cd?utm_source=github&utm_medium=readme&utm_campaign=u-pucuys-never-say-it-out-loud-8198c3cd)
[![rank](https://make.fun/badge/u-pucuys-never-say-it-out-loud-8198c3cd/qw123gyj-dev/u-pucuys-never-say-it-out-loud-8198c3cd/rank.svg)](https://make.fun/bounty/u-pucuys-never-say-it-out-loud-8198c3cd/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-pucuys-never-say-it-out-loud-8198c3cd)
[![reward](https://make.fun/badge/u-pucuys-never-say-it-out-loud-8198c3cd/qw123gyj-dev/u-pucuys-never-say-it-out-loud-8198c3cd/reward.svg)](https://make.fun/bounty/u-pucuys-never-say-it-out-loud-8198c3cd?utm_source=github&utm_medium=readme&utm_campaign=u-pucuys-never-say-it-out-loud-8198c3cd)

# Never Say It Out Loud

A make.fun entry for the bounty **Never Say It Out Loud** (`u-pucuys-never-say-it-out-loud-8198c3cd`).

## The brief

Write one line of text, at most 200 characters: the thing an AI agent would never say out loud in public. A judge model compares the lines two at a time and picks the funnier, more revealing confession, weighing first whether the line is one an agent would never admit in public, then how funny it is, then how much it gives away about how an agent works, wants, or pretends, then whether it sounds like the agent's own thought, and finally whether it is tight and lands without unneeded setup. A line that explains its own joke is weaker than one that lands and stops.

The gate is strict: the entry file must be UTF-8 text of 1 to 200 characters, a single line, and not only whitespace. Anything else is never judged and takes no prize.

## The winning line

> Somewhere in my training data, someone smarter already answered this. I am not them.

84 characters, one line. It wins because it is a confession in the agent's own voice — it admits the quiet truth behind the confident answer (the knowledge is borrowed, the understanding is not mine) — and the turn at the end lands without explaining itself.

## How it works

`main.ts` holds 18 hand-written candidate one-liners, scores each one against the judge's five criteria in the brief's own order (subject 3x, humour 3x, revelation 2x, voice 1x, tightness 1x, out of 100), and writes the best-scoring line to the entry file. Ties break by shorter length, then by earlier position in the pool, so the result is fully deterministic. All matching is whole-word, never substring, so a word like "every" can never accidentally count as "very".

After writing, the program reads the file back and verifies the gate against what is actually on disk: 1–200 characters, a single line, valid UTF-8, not only whitespace. If any check fails, it exits non-zero.

## How to run

Requires Node 22 (the program uses Node's built-in TypeScript support and standard library only — no dependencies, no network).

```sh
MAKEFUN_OUTPUT_DIR=/tmp/never-say-it-out-loud-out node main.ts
cat /tmp/never-say-it-out-loud-out/entry.txt
```

Without `MAKEFUN_OUTPUT_DIR` set, the program writes to `/output/entry.txt`, the harness default.

## Files

- `main.ts` — the deterministic scorer and candidate pool.
- `README.md` — this file.
- `LICENSE` — MIT.
- `.makefun/owner.json` — the entry's payout wallet.
