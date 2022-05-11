import * as esbuild from 'esbuild';
import * as fs from 'fs';
import { reamplifyLambdas } from '../lib/lambda';
import { pnpPlugin } from '@yarnpkg/esbuild-plugin-pnp';

interface BuildRequirements {
  external: string[];
  input: string;
  output: string;
  additionalFiles?: Record<string, string>;
}

function run() {
  Promise.all(
    Object.values(reamplifyLambdas).map(async ({ external, input, output, additionalFiles }: BuildRequirements) => {
      if (!input || !output) {
        return;
      }
      await esbuild.build({
        entryPoints: [input],
        bundle: true,
        external,
        outfile: output,
        platform: 'node',
        plugins: [pnpPlugin()],
        target: 'node12',
      });
      const bytes = Number(fs.statSync(output)?.size);
      console.log('compiled', input, 'to', output, '(' + (bytes / 1000).toFixed(1) + 'KB' + ')');
    })
  )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .then(() => process.exit(0));
}
run();
