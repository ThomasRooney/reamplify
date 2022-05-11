import { TYPESCRIPT_SCALAR_MAP } from '@aws-amplify/appsync-modelgen-plugin/lib/scalars';

const path = require('path');
const { readFileSync, writeFileSync, ensureFileSync, pathExistsSync } = require('fs-extra');
const { parse } = require('graphql'); // Requires version ^14.5.8
import { print } from 'graphql/language/printer';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { buildASTSchema, visit } from 'graphql';
import { AppSyncModelTypeScriptVisitor } from './modelgen/appsync-typescript-visitor';
import { CodeGenField, CodeGenModel } from './modelgen/appsync-visitor';
const { loadSchema } = require('amplify-graphql-docs-generator/lib/generator/utils/loading');
import { TableConfig } from '../lib/tableConfig';
import { ESLint } from 'eslint';
import LintResult = ESLint.LintResult;

generateModels().then(() => ({}), console.error);

function locateS3Keys(model: CodeGenModel, fullSchema: AppSyncModelTypeScriptVisitor): string[][] {
  const locate = (attribute: CodeGenModel | CodeGenField, path: string[] = []): string[][] => {
    if (attribute.name === 'S3Object') {
      return [path];
    }
    if ('fields' in attribute && attribute.fields) {
      return (attribute as CodeGenModel).fields.reduce((cur: string[][], field: CodeGenField) => {
        return cur.concat(locate(field, path.concat(field.name)));
      }, []);
    } else {
      const complexObject = fullSchema.nonModelMap[attribute.type];
      if (complexObject) {
        return locate(complexObject, path);
      }
    }
    return [];
  };

  return locate(model);
}

type Writeable<T> = { -readonly [P in keyof T]-?: T[P] };

export function classify(
  model: CodeGenModel,
  fullSchema: AppSyncModelTypeScriptVisitor,
  schemaDoc: any
): TableConfig<any> {
  const authAttributes = model.directives?.find((attribute) => attribute.name === 'auth');
  const { primitives, primitiveTypes, mandatory } = Object.values(model?.fields || []).reduce(
    (cur: any, field: any) => {
      if (field && typeof field === 'object' && typeof field['name'] === 'string' && !field.isNullable) {
        cur.mandatory[field['name']] = field['name'];
      }
      if (
        (field &&
          typeof field === 'object' &&
          typeof field['name'] === 'string' &&
          typeof field['type'] === 'string' &&
          TYPESCRIPT_SCALAR_MAP[field['type']]) ||
        field?.['baseType']?.astNode?.kind === 'EnumTypeDefinition'
      ) {
        cur.primitives[field['name']] = field['name'];
        cur.primitiveTypes[field['name']] = TYPESCRIPT_SCALAR_MAP[field['type']] || 'string';
      }
      return cur;
    },
    { primitives: {}, primitiveTypes: {}, mandatory: {} }
  );
  const ownerKey = model.fields.find((attr) => attr.name === 'owner');
  const primaryKey = model.fields.filter((attr) =>
    attr.directives.find((directive) => directive.name === 'primaryKey')
  );
  if (primaryKey.length !== 1) {
    throw new Error(`could not classify table ${model.name} -- found ${primaryKey.length} primary key candidates`);
  }
  if (primaryKey[0].directives.find((directive) => directive.name === 'primaryKey')?.arguments?.length) {
    throw new Error(`expected primary key for table ${model.name} to have a single partition key and no sort key`);
  }
  const partitionKey = primaryKey[0].name;
  const ownerIndexName = ownerKey?.directives?.find((attr) => attr.name === 'index')?.arguments?.name;
  const secondaryKeys = model.fields.reduce((cur: Writeable<TableConfig<any>['index']>, attr) => {
    attr.directives
      .filter((directive) => directive.name === 'index')
      .forEach((indexDirective) => {
        if (!indexDirective) {
          return;
        }
        const indexName = indexDirective.arguments.name;
        cur[indexName] = {
          name: indexName,
          fields: [attr.name, ...(indexDirective.arguments.sortKeyFields || [])],
          partitionKey: attr.name,
        };
        if (indexDirective.arguments.sortKeyFields?.length) {
          cur[indexName] = {
            ...cur[indexName],
            sortKey: indexDirective.arguments.sortKeyFields.join('#'),
          };
        }
        if (indexDirective.arguments.queryField) {
          cur[indexName] = {
            ...cur[indexName],
            query: {
              name: indexDirective.arguments.queryField,
              argument: cur[indexName].partitionKey,
            },
          };
        }
        return;
      });
    return cur;
  }, {});
  const authRules = authAttributes?.arguments?.rules || [];
  const ownerRules = authRules.filter(
    (authRule: any) => authRule.allow === 'owner' && authRule.identityClaim === 'cognito:username'
  );
  const ownerOperations = ownerRules
    .map((owner: any) => owner.operations || ['create', 'update', 'delete', 'read'])
    .reduce((a: any, b: any) => a.concat(b), []);
  const ownerRW = Boolean(
    ownerOperations.find((o: any) => o === 'update') && ownerOperations.find((o: any) => o === 'read')
  );
  const ownerRead = Boolean(ownerOperations.find((o: any) => o === 'read'));
  const s3Keys = locateS3Keys(model, fullSchema);
  const queriesOne: any = Object.values(schemaDoc.getQueryType().getFields()).filter(
    (query: any) => query.type.name === model.name
  );
  const getQuery: any = queriesOne.find((query: any) => query.name === `get${model.name}`);
  const queriesMany: any = Object.values(schemaDoc.getQueryType().getFields()).filter(
    (query: any) =>
      query.type.getFields &&
      Object.entries(query.type.getFields()).every(([k]) => ['items', 'nextToken'].includes(k)) &&
      query.type.getFields()['items']?.type?.ofType?.ofType?.name === model.name
  );
  const listQuery: any = queriesMany.find((query: any) => query.name.startsWith('list'));
  const mutations = Object.values(schemaDoc.getMutationType().getFields()).filter(
    (query: any) => query.type.name === model.name
  );
  const updateMutation: any = mutations.find((mutation: any) => mutation.name === `update${model.name}`);
  const createMutation: any = mutations.find((mutation: any) => mutation.name === `create${model.name}`);
  const deleteMutation: any = mutations.find((mutation: any) => mutation.name === `delete${model.name}`);
  const subscriptions = Object.values(schemaDoc.getSubscriptionType().getFields()).filter(
    (query: any) => query.type.name === model.name
  );
  const updateSubscription: any = subscriptions.find(
    (subscription: any) => subscription.name === `onUpdate${model.name}`
  );
  const createSubscription: any = subscriptions.find(
    (subscription: any) => subscription.name === `onCreate${model.name}`
  );
  const deleteSubscription: any = subscriptions.find(
    (subscription: any) => subscription.name === `onDelete${model.name}`
  );
  const GeneratedQueries = require('../lib/graphql/queries');

  const gqlForGetQuery = GeneratedQueries['shallow' + getQuery.name[0].toUpperCase() + getQuery.name.slice(1)];
  let fieldSet = '';
  if (gqlForGetQuery) {
    const taggedQuery = parse(gqlForGetQuery) as any;

    fieldSet = print(taggedQuery.definitions['0'].selectionSet.selections['0'].selectionSet)
      .replace(/[\s,]+/g, ' ')
      .trim()
      .replace(/}$/, ' ')
      .replace(/^{/, ' ')
      .trim();
  }

  const connections = model.fields
    .filter((field) =>
      field.directives.find((directive) => ['hasOne', 'hasMany', 'belongsTo', 'manyToMany'].includes(directive.name))
    )
    .reduce((acc: any, field) => {
      acc[field.name] = {
        list: field.isList,
        table: field.type,
      };
      return acc;
    }, {});

  return {
    name: model.name,
    primaryKey: partitionKey,
    partitionKey: { name: partitionKey, type: 'string' },
    ownerIndex: ownerIndexName,
    connections,
    ownerR: ownerRead,
    ownerRW: ownerRW,
    index: secondaryKeys,
    primitives: primitives,
    primitiveTypes: primitiveTypes,
    mandatory: mandatory,
    s3ObjectKeys: s3Keys,
    mutation: {
      create: createMutation?.name || '',
      delete: deleteMutation?.name || '',
      update: updateMutation?.name || '',
    },
    query: { get: getQuery?.name || '', list: listQuery?.name || '' },
    subscription: {
      onCreate: createSubscription?.name || '',
      onDelete: deleteSubscription?.name || '',
      onUpdate: updateSubscription?.name || '',
    },
    fieldSet,
    streamConfiguration: 'NEW_AND_OLD_IMAGES',
  };
}

async function generateModels() {
  const schemaExtensions = readSchema(path.resolve(__dirname, '..', 'amplify-schema-extensions.graphql'));
  const schemaContent = [schemaExtensions, readSchema(path.resolve(__dirname, '..', 'schema.graphql'))].join('\n');
  const generatedSchema = path.resolve(__dirname, '..', 'appsync', 'schema.graphql');
  const outputPath = path.resolve(__dirname, '..', 'lib');
  const modelsFolder = path.resolve(outputPath, 'models');

  process.stdout.write(`Generating models from ${generatedSchema} into ${modelsFolder} .. `);

  try {
    const schema = parse(schemaContent);
    const schemaDoc = loadSchema(generatedSchema);
    const schemaPreTransformDoc = buildASTSchema(schema);
    const eslint = new ESLint({
      cwd: path.resolve(__dirname, '..'),
      fix: true,
    });

    const visitor = new AppSyncModelTypeScriptVisitor(
      schemaPreTransformDoc,
      {
        transformerVersion: 2,
        target: 'typescript',
        scalars: { ...TYPESCRIPT_SCALAR_MAP },
        metadata: false,
      },
      {}
    );
    const schemaStr = printSchemaWithDirectives(schemaPreTransformDoc);
    const node = parse(schemaStr);
    visit(node, {
      leave: visitor,
    });
    const modelOutput = visitor.generate();
    const tables = Object.values(visitor.modelMap).map((model) => classify(model, visitor, schemaDoc));
    const tableConfigPath = path.resolve(modelsFolder, 'tables.ts');
    ensureFileSync(tableConfigPath);

    const modelOutputResults: LintResult[] = await eslint.lintText(modelOutput, {
      filePath: path.resolve(modelsFolder, 'index.ts'),
    });

    writeFileSync(path.resolve(modelsFolder, 'index.ts'), modelOutputResults[0].output);

    const tablesString = `import type { ${tables
      .map((t) => {
        return `${t.name}Model`;
      })
      .join(',\n')} } from './index';\n
        import type { TableConfig } from '../tableConfig';\n
        \nexport type AnyModel = ${tables
          .map((t) => {
            return `${t.name}Model`;
          })
          .join('|')}\n${tables
      .map((t) => {
        return `export const ${t.name}TableConfig  = ${JSON.stringify(t, null, 2)} as const;\n`;
      })
      .join('\n')}\nexport type AnyTable = ${tables
      .map((t) => {
        return `TableConfig<${t.name}Model>`;
      })
      .join('|')}\nexport const tables: AnyTable[] = [${tables
      .map((t) => `<TableConfig<${t.name}Model>>${t.name}TableConfig`)
      .join(',')}];\n
      \nexport const table = {${tables.map((t) => `${t.name}: ${t.name}TableConfig`).join(',')}} as const;\n`;

    const tablesStringResult: LintResult[] = await eslint.lintText(tablesString, {
      filePath: path.resolve(modelsFolder, 'tables.ts'),
    });
    const tablesStringFormatted = tablesStringResult[0].output;

    writeFileSync(tableConfigPath, tablesStringFormatted);

    process.stdout.write(`Done\n`);
  } catch (e) {
    console.error('\n', e);
    process.exit(1);
  }
}

function readSchema(schemaFilePath: string): string {
  if (pathExistsSync(schemaFilePath)) {
    return readFileSync(schemaFilePath, 'utf8');
  }

  throw new Error('Could not load the schema');
}
