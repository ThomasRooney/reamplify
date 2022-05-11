const path = require('path');
const { readFileSync, writeFileSync, ensureFileSync, pathExistsSync } = require('fs-extra');
const { parse } = require('graphql');
const gqlCodeGen = require('@graphql-codegen/core');
const typescriptPlugin = require('@graphql-codegen/typescript');
const rimraf = require('rimraf');
const { ESLint } = require('eslint');

const customScalars = {
  ID: 'string',
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  AWSDate: 'string',
  AWSDateTime: 'string',
  AWSTime: 'string',
  AWSTimestamp: 'number',
  AWSEmail: 'string',
  AWSJSON: 'string',
  AWSURL: 'string',
  AWSPhone: 'string',
  AWSIPAddress: 'string',
};

const customDirectives = {
  aws_subscribe: '@aws_subscribe(mutations: [String!]!) on FIELD_DEFINITION',
  aws_cognito_user_pools: '@aws_cognito_user_pools on FIELD_DEFINITION | OBJECT',
  aws_iam: '@aws_iam on FIELD_DEFINITION | OBJECT',
};

generateTypes();

async function generateTypes() {
  const outputDir = path.resolve(__dirname, '..', 'lib');

  const schemaPath = path.resolve(__dirname, '..', 'appsync', 'schema.graphql');
  const schemaExtensions = loadSchema(path.resolve(__dirname, '..', 'amplify-schema-extensions.graphql'));
  const schemaContent = [schemaExtensions, loadSchema(schemaPath)].join('\n');
  const typesFolder = path.resolve(outputDir, 'types');
  const outputPath = path.resolve(typesFolder, 'index.ts');
  process.stdout.write(`Extracting types from ${schemaPath} into ${outputPath} .. `);
  const schema = parse(schemaContent);

  const config = {
    baseOutputDir: outputDir,
    filename: outputPath,
    schema: schema,
    config: {
      enumsAsTypes: true,
      scalars: customScalars,
      directives: customDirectives,
      maybeValue: 'T | null | undefined',
    },
    metadata: false,
    plugins: [{ typescript: {} }],
    pluginMap: {
      typescript: typescriptPlugin,
    },
  };
  const eslint = new ESLint({ cwd: path.resolve(__dirname, '..'), fix: true });

  try {
    let generatedCode = await gqlCodeGen.codegen(config);
    ensureFileSync(config.filename);
    const modelOutputResults = await eslint.lintText(generatedCode, {
      filePath: config.filename,
    });

    writeFileSync(config.filename, modelOutputResults[0].output);

    process.stdout.write(`Done\n`);
  } catch (e) {
    console.error('\n', e);
    process.exit(1);
  }
}

function loadSchema(schemaFilePath) {
  if (pathExistsSync(schemaFilePath)) {
    return readFileSync(schemaFilePath, 'utf8');
  }

  throw new Error('Could not load the schema');
}
