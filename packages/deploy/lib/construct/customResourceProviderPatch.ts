// From https://github.com/aws/aws-cdk/issues/17460
import { CustomResourceProvider, CustomResourceProviderProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';

const copyFilesSync = (srcDir: string, dstDir: string) => {
  fs.readdirSync(srcDir).forEach((file) => {
    const src = srcDir + '/' + file;
    const dst = dstDir + '/' + file;
    var stat = fs.statSync(src);
    if (stat && stat.isDirectory()) {
      fs.mkdirSync(dst);
      copyFilesSync(src, dst);
    } else {
      fs.writeFileSync(dst, fs.readFileSync(src));
    }
  });
};

const tmp = os.tmpdir();
const getOrCreateProvider = CustomResourceProvider.getOrCreateProvider;
CustomResourceProvider.getOrCreateProvider = (scope: Construct, id: string, props: CustomResourceProviderProps) => {
  const hash = crypto.createHash('sha1').update(props.codeDirectory).digest('hex');
  const codeDirectory = path.join(tmp, `cdk-crp-${hash}`);
  if (!fs.existsSync(codeDirectory)) {
    fs.mkdirSync(codeDirectory);
    copyFilesSync(props.codeDirectory, codeDirectory);
  }
  return getOrCreateProvider(scope, id, {
    ...props,
    codeDirectory,
  });
};
