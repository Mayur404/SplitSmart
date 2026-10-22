import { runSelfTests } from '../algorithm.js';

try {
  const result = runSelfTests();
  process.stdout.write(`${result}\n`);
} catch (error) {
  process.stderr.write(`Financial algorithm tests failed: ${error.message}\n`);
  process.exitCode = 1;
}
