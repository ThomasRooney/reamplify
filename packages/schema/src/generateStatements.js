const path = require('path');
const fs = require('fs-extra');
const OriginalGetFields = require('amplify-graphql-docs-generator/lib/generator/getFields');
const graphql_1 = require('graphql');
const getFragment_1 = require('amplify-graphql-docs-generator/lib/generator/getFragment');
const getType_1 = require('amplify-graphql-docs-generator/lib/generator/utils/getType');
const isS3Object_1 = require('amplify-graphql-docs-generator/lib/generator/utils/isS3Object');
const { loadSchema } = require('amplify-graphql-docs-generator/lib/generator/utils/loading');
const {
  generateMutations,
  generateSubscriptions,
  generateQueries,
} = require('amplify-graphql-docs-generator/lib/generator');
const handlebars = require('handlebars');
const change_case_1 = require('change-case');
const prettier = require('prettier');
const { mkdirSync } = require('fs');
const { ESLint } = require('eslint');

const MAX_DEPTH = 15;

const TEMPLATE_DIR = path.resolve(path.dirname(require.resolve('amplify-graphql-docs-generator')), '..', 'templates');
// We drop 1 => Many connections from graphql responses -- we'll manage these separately to get around appsync limitations.

function isConnectionType(fieldType) {
  return fieldType.name.startsWith('Model') && fieldType.name.endsWith('Connection');
}

function getFields(field, schema, depth = 2, options) {
  const fieldType = getType_1.default(field.type);
  const renderS3FieldFragment = options.useExternalFragmentForS3Object && isS3Object_1.default(fieldType);
  const subFields =
    !renderS3FieldFragment && (graphql_1.isObjectType(fieldType) || graphql_1.isInterfaceType(fieldType))
      ? fieldType.getFields()
      : [];
  const subFragments =
    graphql_1.isInterfaceType(fieldType) || graphql_1.isUnionType(fieldType) ? schema.getPossibleTypes(fieldType) : {};
  if (
    (depth < MAX_DEPTH && options.shallow && isConnectionType(fieldType)) ||
    (depth < 1 && !(graphql_1.isScalarType(fieldType) || graphql_1.isEnumType(fieldType)))
  ) {
    return;
  }
  const fields = Object.keys(subFields)
    .map((fieldName) => {
      const subField = subFields[fieldName];
      return getFields(subField, schema, depth - 1, options);
    })
    .filter((f) => f);
  const fragments = Object.keys(subFragments)
    .map((fragment) => getFragment_1.default(subFragments[fragment], schema, depth, fields, null, false, options))
    .filter((f) => f);
  // Special treatment for S3 input
  // Swift SDK needs S3 Object to have fragment
  if (renderS3FieldFragment) {
    fragments.push(getFragment_1.default(fieldType, schema, depth, [], 'S3Object', true, options));
  }
  // if the current field is an object and none of the subfields are included, don't include the field itself
  if (
    !(graphql_1.isScalarType(fieldType) || graphql_1.isEnumType(fieldType)) &&
    fields.length === 0 &&
    fragments.length === 0 &&
    !renderS3FieldFragment
  ) {
    return;
  }

  const modelTypes = Object.values(schema.getQueryType().getFields())
    .map((f) => f.type)
    .filter((f) => !isConnectionType(f))
    .map((f) => f.name);

  // nice idea -- works but the handlebars template needs updating as well
  // irrelevant for now.
  // if (depth < MAX_DEPTH && isConnectionType(fieldType) && !options.shallow) {
  //   return {
  //     name: field.name,
  //     args: [
  //       {
  //         name: 'limit',
  //         value: 1000,
  //       },
  //     ],
  //     fields,
  //     fragments,
  //     hasBody: !!(fields.length || fragments.length),
  //   };
  // }
  return {
    name: field.name,
    fields,
    fragments,
    hasBody: !!(fields.length || fragments.length),
  };
}

OriginalGetFields.default = getFields;

generateStatements();

async function generateStatements() {
  const schemaPath = path.resolve(__dirname, '..', 'appsync', 'schema.graphql');
  const outputPath = path.resolve(__dirname, '..', 'lib', 'graphql');
  process.stdout.write(`Generating statements from ${schemaPath} into ${outputPath} .. `);

  if (!fs.existsSync(outputPath)) {
    mkdirSync(outputPath);
  }
  const language = 'typescript';
  const eslint = new ESLint({ cwd: path.resolve(__dirname, '..'), fix: true });

  try {
    fs.ensureDirSync(outputPath);
    const schemaDoc = loadSchema(schemaPath);
    registerPartials();
    registerHelpers();

    const queryTypes = schemaDoc.getQueryType();
    const mutationType = schemaDoc.getMutationType();
    const subscriptionType = schemaDoc.getSubscriptionType();
    const queries = generateQueries(queryTypes, schemaDoc, MAX_DEPTH, { shallow: false }) || [];
    const mutations =
      generateMutations(mutationType, schemaDoc, MAX_DEPTH, {
        shallow: false,
      }) || [];
    const subscriptions =
      generateSubscriptions(subscriptionType, schemaDoc, MAX_DEPTH, {
        shallow: false,
      }) || [];
    const shallowQueries = generateQueries(queryTypes, schemaDoc, MAX_DEPTH, { shallow: true }) || [];
    const shallowMutations =
      generateMutations(mutationType, schemaDoc, MAX_DEPTH, {
        shallow: true,
      }) || [];
    const shallowSubscriptions =
      generateSubscriptions(subscriptionType, schemaDoc, MAX_DEPTH, {
        shallow: true,
      }) || [];

    await Promise.all(
      [
        ['queries', queries, shallowQueries],
        ['mutations', mutations, shallowMutations],
        ['subscriptions', subscriptions, shallowSubscriptions],
      ].map(async ([op, deep, shallow]) => {
        if (deep.length && shallow.length) {
          const gql = render(
            {
              operations: [...deep, ...shallow.map((s) => ({ ...s, name: 'Shallow' + s.name }))],
              fragments: [],
            },
            'typescript'
          );
          const targetPath = path.resolve(outputPath, `${op}.ts`);
          const modelOutputResults = await eslint.lintText(gql, {
            filePath: targetPath,
          });
          modelOutputResults[0].messages.forEach(console.log);
          if (modelOutputResults[0].output) {
            await fs.writeFileSync(targetPath, modelOutputResults[0].output);
          } else {
            await fs.writeFileSync(targetPath, gql);
          }
        }
      })
    );

    process.stdout.write(`Done\n`);
  } catch (err) {
    console.error('\n', err);
    process.exit(1);
  }
}

function render(doc, language = 'graphql') {
  const templateFiles = {
    javascript: 'javascript.hbs',
    graphql: 'graphql.hbs',
    typescript: 'typescript.hbs',
    flow: 'flow.hbs',
    angular: 'graphql.hbs',
  };
  const templatePath = path.join(TEMPLATE_DIR, templateFiles[language]);
  const templateStr = fs.readFileSync(templatePath, 'utf8');
  const template = handlebars.compile(templateStr, {
    noEscape: true,
    preventIndent: true,
  });
  const gql = template(doc);
  return format(gql, language);
}

function registerPartials() {
  const partials = fs.readdirSync(TEMPLATE_DIR);
  partials.forEach((partial) => {
    if (!partial.startsWith('_') || !partial.endsWith('.hbs')) {
      return;
    }
    const partialPath = path.join(TEMPLATE_DIR, partial);
    const partialName = path.basename(partial).split('.')[0];
    const partialContent = fs.readFileSync(partialPath, 'utf8');
    handlebars.registerPartial(partialName.substring(1), partialContent);
  });
}
function registerHelpers() {
  handlebars.registerHelper('format', function (options) {
    const result = options.fn(this);
    return format(result);
  });
  handlebars.registerHelper('camelCase', change_case_1.camelCase);
}
function format(str, language = 'graphql') {
  const parserMap = {
    javascript: 'babel',
    graphql: 'graphql',
    typescript: 'typescript',
    flow: 'flow',
    angular: 'graphql',
  };
  return prettier.format(str, { parser: parserMap[language] });
}
