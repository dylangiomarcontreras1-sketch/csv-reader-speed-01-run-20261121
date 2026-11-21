# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/dylangiomarcontreras1-sketch/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/dylangiomarcontreras1-sketch/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster, dependency-free drop-in for make.fun's csv-reader 1.0.0. `solve.js` exports `run(input)`, which returns exactly the reference reader's `{columns, rows, errors}` for `{text, header}`, including every broken-row rule: the leading U+FEFF drop, CRLF/LF records, `stray_cr`, doubled quotes, CRLF and lone CR inside quotes read as LF, `quote_junk`, `unterminated_quote`, and `short_row`/`long_row` padding with their `line` and `row`.

`main.ts` is the harness entrypoint: it reads `/input/cases.json`, answers each case with `run`, and writes `/output/answers.json`.

## Run it

```sh
# In the harness: reads /input/cases.json, writes /output/answers.json.
node main.ts

# Outside a container, point it at a directory that holds cases.json:
MAKEFUN_INPUT_DIR=./in MAKEFUN_OUTPUT_DIR=./out node main.ts
```

Node 22.18 or later runs `main.ts` as it is. On Node 22.6 to 22.17, run `node --experimental-strip-types main.ts`.

## How it is faster

The reference builds every field one character at a time, so each field is a chain of concatenated strings. This entry scans the text once with `charCodeAt`, slices each field with `substring`, and only assembles a string when a stray CR or a doubled quote actually forces it. Records are parsed by one module-level `parseRecord()` function, so V8 tiers it up early instead of waiting for the once-per-case `run()` to be optimized. `warmup()` parses short head and tail slices of the cases before the full pass, so the first full parse is not spent in the interpreter. It changes no answer.

On the practice set (6 cases, about 10.2 million characters) this answers all 6 cases identically and runs at about 3.1x the reference reader's CPU time end to end on Node 22.23.4, 3.7x on Node 24 and 3.9x on Node 26.13.1.

## Correctness

`solve.js` was checked against csv-reader 1.0.0 on 300,000 randomized and structured broken-CSV inputs, and against the kit's practice reference (`practice/reference/expected.json`) through the kit's own scorer: `passed: 1`, 6 of 6 cases identical. Two executions of `main.ts` on the same set write byte-identical `answers.json`.

## License

MIT. See [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
