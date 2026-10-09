// Measures generated JavaScript and its static dependency graph, not network latency.
// pnpm exec node scripts/measure-bundle.mjs .tmp/bundle-before.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

let report;
await build({
  logLevel: 'error',
  build: { reportCompressedSize: false },
  plugins: [{
    name: 'measure-bundle',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((entry) => entry.type === 'chunk');
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const reachable = new Set();
      const visit = (name) => {
        if (reachable.has(name)) return;
        const chunk = byName.get(name);
        if (!chunk) return;
        reachable.add(name);
        chunk.imports.forEach(visit);
      };
      chunks.filter((chunk) => chunk.isEntry).forEach((chunk) => visit(chunk.fileName));
      const initial = chunks.filter((chunk) => reachable.has(chunk.fileName));
      report = {
        initial: {
          bytes: initial.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0),
          gzipBytes: initial.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0),
          chunkCount: initial.length,
          includesExcel: initial.some((chunk) => Object.keys(chunk.modules).some((id) => /\/node_modules\/.*xlsx/.test(id))),
        },
        chunks: chunks.map((chunk) => ({
          name: chunk.fileName, entry: chunk.isEntry, dynamicEntry: chunk.isDynamicEntry,
          bytes: Buffer.byteLength(chunk.code), gzipBytes: gzipSync(chunk.code).length,
          imports: chunk.imports, dynamicImports: chunk.dynamicImports,
          modules: Object.entries(chunk.modules).map(([id, value]) => ({
            id: id.replaceAll('\\', '/').replace(`${process.cwd().replaceAll('\\', '/')}/`, ''),
            bytes: value.renderedLength,
          })).sort((a, b) => b.bytes - a.bytes),
        })).sort((a, b) => b.bytes - a.bytes),
      };
    },
  }],
});
const output = resolve(process.argv[2] || '.tmp/bundle-report.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.initial));
