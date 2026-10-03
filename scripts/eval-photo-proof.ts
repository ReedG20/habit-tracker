/**
 * Runs real photos through the habit photo judge, against the real model, to
 * check a prompt or model change before it ships. Not part of `bun run test`:
 * it costs a little and needs a key.
 *
 *   OPENROUTER_API_KEY=… bun scripts/eval-photo-proof.ts <dir> [--runs 3]
 *
 * `<dir>` holds the photos and a `cases.json`. Keep it outside the repo, since
 * the photos are personal:
 *
 *   [{ "photo": "laptop-screen.jpg", "habit": "Go to the gym", "expect": "reject" },
 *    { "photo": "laptop-screen.jpg", "habit": "Work on my startup",
 *      "description": "My laptop with my code editor open", "expect": "approve" }]
 *
 * `origin` defaults to the in-app camera; pass a photo origin object to test
 * library picks. Exits non-zero when any run disagrees with `expect`.
 */
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import type { PhotoOrigin } from '../convex/lib/photoOrigin';
import { describePhotoOrigins } from '../convex/lib/photoOrigin';
import { askPhotoModel, settlePhotoVerdict } from '../convex/lib/vision';
import { SYSTEM_PROMPT } from '../convex/verifications';

type Case = {
  photo: string;
  habit: string;
  description?: string;
  origin?: PhotoOrigin;
  expect: 'approve' | 'reject';
};

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function main() {
  const dir = process.argv[2];
  if (dir === undefined) throw new Error('Usage: bun scripts/eval-photo-proof.ts <dir> [--runs N]');
  if (!process.env.OPENROUTER_API_KEY) throw new Error('Set OPENROUTER_API_KEY');
  const runsFlag = process.argv.indexOf('--runs');
  const runs = runsFlag === -1 ? 1 : Number(process.argv[runsFlag + 1]);

  const cases = JSON.parse(await readFile(join(dir, 'cases.json'), 'utf8')) as Case[];
  let misses = 0;

  for (const c of cases) {
    const bytes = await readFile(join(dir, c.photo));
    const mime = MIME[extname(c.photo).toLowerCase()] ?? 'image/jpeg';
    const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;

    for (let run = 1; run <= runs; run++) {
      const raw = await askPhotoModel({
        systemPrompt: SYSTEM_PROMPT,
        imageUrls: [dataUrl],
        text: [
          `Habit (untrusted): ${c.habit}`,
          `Description (untrusted): ${c.description ?? '(none)'}`,
          describePhotoOrigins([c.origin ?? { source: 'camera' }], Date.now()),
        ].join('\n'),
      });
      const settled = settlePhotoVerdict(raw);
      const ok = settled.verdict === c.expect;
      if (!ok) misses++;

      console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.photo} · "${c.habit}" · run ${run}`);
      console.log(`  seen:       ${raw.seen}`);
      console.log(
        `  related: ${raw.relatesToCommitment}  pictureOfAPicture: ${raw.pictureOfAPicture}  model: ${raw.verdict}  final: ${settled.verdict} (want ${c.expect})`,
      );
      console.log(`  reason:     ${settled.reason}\n`);
    }
  }

  console.log(misses === 0 ? 'All cases passed.' : `${misses} run(s) disagreed with expect.`);
  process.exit(misses === 0 ? 0 : 1);
}

void main();
