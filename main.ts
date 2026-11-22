// Fast CSV reader entry - driver program
// Reads cases from /input/cases.json and writes answers to /output/answers.json

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8 optimization: disable incremental marking for faster execution
setFlagsFromString('--no-incremental-marking');

// Import our optimized solver
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Read all cases
const casesText = readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8');
const cases = JSON.parse(casesText) as { id: string; input: unknown }[];

// Process each case with our optimized parser
const answers: unknown[] = [];
for (const c of cases) {
  answers.push(run(c.input));
}

// Write results
writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
