// Port Solace: Neon Tide — the program that hands the game in (Node 22, standard library only).
//
// The game itself is the static site in game/ (open game/index.html in a desktop browser and it
// plays offline). This program copies game/ and screenshots/ into the output directory and
// writes dossier.json there with the kit's vendored buildDossier, exactly the bytes the scorer
// rebuilds and compares. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The caps passed to buildDossier are the gate's own (reference/gate.json): the dossier text is
// capped at 163,840 bytes, screenshots at 4 files of 256 KiB, game/ at 993 entries and 48 MiB.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Port Solace: Neon Tide handed in: game/ + screenshots/ + dossier.json (${dossier.length} bytes) in ${outputDir}`);
