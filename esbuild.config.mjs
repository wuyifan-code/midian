import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const prod = process.argv[2] === 'production';

const vault = process.env.OBSIDIAN_VAULT;
const outdir = vault ? join(vault, '.obsidian', 'plugins', 'midian') : root;
mkdirSync(outdir, { recursive: true });

function copyAssets() {
  for (const file of ['manifest.json', 'versions.json', 'styles.css']) {
    copyFileSync(join(root, file), join(outdir, file));
  }
}

const context = await esbuild.context({
  entryPoints: [join(root, 'src', 'main.ts')],
  bundle: true,
  external: ['obsidian', 'electron'],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  treeShaking: true,
  minify: prod,
  sourcemap: prod ? false : 'inline',
  outfile: join(outdir, 'main.js'),
});

if (prod) {
  await context.rebuild();
  copyAssets();
  await context.dispose();
  process.exit(0);
}

copyAssets();
await context.watch();
