# The cost of making the context small, by arithmetic (no model call)

Per drawn cut, priced request by request with the product's `costForUsage`; the median over the cuts of each band. Total = make + turn 1's first request + the next 20 real turns (fewer where the session had fewer). Session model as drawn (claude-fable-5-1: 3 cuts, claude-opus-5-5: 17 cuts, claude-opus-5-5[1m]: 4 cuts). USD.

Measured inputs:

- native `/compact`: input 5,176.0 and output 7,515.0 tokens (medians of 114 measured manual compactions on Opus); carried after it S_n = 100-300k 49,610 (n=54), 300-600k 51,659 (n=53), 600k+ 59,006 (n=48) tokens (first request after a real boundary);
- Sonnet summary: input = 0.083 × P, output 5,068 tokens (12 finished A2 summaries); the opening turn $0.5314 (12 measured); carried after it S_s = 68,651 tokens;
- turn-1 writes at the 1-hour rate: in the finished A0 runs the 1-hour share of the first request's write was 1.00 (n=7).

| situation | band | cuts | P (median) | whole | native /compact | Sonnet summary | cheapest |
|---|---|---|---|---|---|---|---|
| warm same-org | 100-300k | 8 | 216,155 | $9.96 (make 0.00, t1 0.06, next 9.90) | $8.10 (make 0.22, t1 0.41, next 7.47) | $8.39 (make 0.62, t1 0.03, next 7.74) | native |
| warm same-org | 300-600k | 8 | 481,252 | $17.42 (make 0.00, t1 0.12, next 17.32) | $12.98 (make 0.27, t1 0.46, next 11.86) | $12.77 (make 0.66, t1 0.04, next 12.09) | sonnet |
| warm same-org | 600k+ | 8 | 941,946 | $22.91 (make 0.00, t1 0.20, next 22.67) | $9.95 (make 0.36, t1 0.50, next 9.09) | $9.99 (make 0.74, t1 0.04, next 9.21) | native |
| cold or cross-org | 100-300k | 8 | 216,155 | $11.86 (make 0.00, t1 1.93, next 9.90) | $9.37 (make 1.37, t1 0.41, next 7.47) | $8.39 (make 0.62, t1 0.03, next 7.74) | sonnet |
| cold or cross-org | 300-600k | 8 | 481,252 | $23.15 (make 0.00, t1 4.18, next 17.32) | $16.01 (make 2.77, t1 0.46, next 11.86) | $12.77 (make 0.66, t1 0.04, next 12.09) | sonnet |
| cold or cross-org | 600k+ | 8 | 941,946 | $30.24 (make 0.00, t1 7.56, next 22.67) | $14.47 (make 4.88, t1 0.50, next 9.09) | $9.99 (make 0.74, t1 0.04, next 9.21) | sonnet |
| limit gone early | 100-300k | 8 | 216,155 | $11.86 (make 0.00, t1 1.93, next 9.90) | $9.37 (make 1.37, t1 0.41, next 7.47) | $8.39 (make 0.62, t1 0.03, next 7.74) | sonnet |
| limit gone early | 300-600k | 8 | 481,252 | $23.15 (make 0.00, t1 4.18, next 17.32) | $16.01 (make 2.77, t1 0.46, next 11.86) | $12.77 (make 0.66, t1 0.04, next 12.09) | sonnet |
| limit gone early | 600k+ | 8 | 941,946 | $30.24 (make 0.00, t1 7.56, next 22.67) | $14.47 (make 4.88, t1 0.50, next 9.09) | $9.99 (make 0.74, t1 0.04, next 9.21) | sonnet |

Per cut (situation · method → total): see out/arith.json.
