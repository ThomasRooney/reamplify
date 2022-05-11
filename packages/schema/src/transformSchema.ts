import { NONE_DS_NAME, v2transformerProvider } from './transformer';
import { DeploymentResources } from 'graphql-transformer-core/lib/DeploymentResources';
import fs from 'fs';
import rimraf from 'rimraf';
import path from 'path';

const NodeEvaluator = require('cfn-resolver-lib');

const outputPath = path.resolve(__dirname, '..', 'appsync');

export type ResolverConfig = {
  fieldName: string;
  typeName: string;
  pipelineFunctions?: string[];
  requestMappingTemplateFilePath: string[];
  responseMappingTemplateFilePath: string[];
  dataSourceKind: 'TABLE' | 'NONE' | 'PIPELINE' | 'CONNECTION';
  connectionModel?: string;
};

const resolversFolderPath = 'resolvers';
const pipelineFunctionsFolderPath = 'pipelineFunctions';

export interface PipelineFunctionConfig {
  dataSourceName: string;
  dataSourceKind: undefined | 'CONNECTION' | 'NONE' | 'FUNCTION';
  requestMappingTemplateFilePath: string[];
  responseMappingTemplateFilePath: string[];
}

export interface ResolverClassifierOutput {
  resolvers: Record<string, ResolverConfig[]>;
  pipelineFunctions: Record<string, Record<string, PipelineFunctionConfig>>;
  functionNameToDataSourceName: Record<string, string>;
  additionalPipelineFunctions: Record<string, PipelineFunctionConfig>;
  tableDatasources: Record<string, string>;
  additionalResolvers: ResolverConfig[];
}

function lastElement(arg: any[]): any {
  return arg[arg.length - 1];
}

const transformAndWrite = (filepath: string, data: string) => {
  fs.writeFileSync(filepath, data);
};

class ResolverClassifier implements ResolverClassifierOutput {
  public resolvers: Record<string, ResolverConfig[]> = {};
  public functionNameToDataSourceName: Record<string, string> = {};
  public tableDatasources: Record<string, string> = {};
  public pipelineFunctions: Record<string, Record<string, PipelineFunctionConfig>> = {};
  public additionalResolvers: ResolverConfig[] = [];
  public additionalPipelineFunctions: Record<string, PipelineFunctionConfig> = {};

  constructor(schema: DeploymentResources) {
    const notifications: Record<string, boolean> = {};

    const tableStackNames: string[] = Object.entries(schema.stacks)
      .filter(([, stack]) => Object.values(stack.Resources || {}).find((item) => item.Type === 'AWS::DynamoDB::Table'))
      .map(([k]) => k);
    Object.entries(schema.stacks).forEach(([k, stack]) => {
      if (!stack.Resources || typeof stack.Resources !== 'object') {
        return;
      }
      const handler = (name: string) => ({
        get(target: any, property: any) {
          if (!target[property]) {
            notifications[`${name}: Property ${property} requested`] = true;
          }
          return target[property];
        },
      });
      const hiddenWarnings = console.warn;
      console.warn = () => ({});
      const evaluatedStack = new NodeEvaluator(stack, {
        RefResolvers: new Proxy({}, handler('RefResolvers')),
        'Fn::ImportValueResolvers': new Proxy({}, handler('Fn::ImportValueResolvers')),
        ArnSchemas: new Proxy({}, handler('ArnSchemas')),
        'Fn::GetAttResolvers': new Proxy({}, handler('Fn::GetAttResolvers')),
      }).evaluateNodes();
      console.warn = hiddenWarnings;

      Object.values(evaluatedStack.Resources!).forEach((resource: any) => {
        if (resource.Type === 'AWS::AppSync::Resolver') {
          this.prepareResolver(k, resource, schema, tableStackNames);
        }
        if (resource.Type === 'AWS::AppSync::DataSource') {
          this.prepareDataSource(k, resource);
        }
        if (resource.Type === 'AWS::AppSync::FunctionConfiguration') {
          this.preparePipelineFunctionConfiguration(k, resource, schema, tableStackNames);
        }
      });
    });
  }
  private prepareResolver(stackName: string, resource: any, schema: any, tableStacks: string[]) {
    const FieldName: string = resource.Properties.FieldName;
    const TypeName: string = resource.Properties.TypeName;

    const RequestMappingTemplateFileName = `${TypeName}.${FieldName}.req.vtl`;
    const ResponseMappingTemplateFileName = `${TypeName}.${FieldName}.res.vtl`;
    if (resource.Properties.RequestMappingTemplate) {
      transformAndWrite(
        path.resolve(outputPath, resolversFolderPath, RequestMappingTemplateFileName),
        resource.Properties.RequestMappingTemplate
      );
    } else if (resource.Properties.RequestMappingTemplateS3Location) {
      const currentName = lastElement(resource.Properties.RequestMappingTemplateS3Location.split('/'));
      transformAndWrite(
        path.resolve(outputPath, resolversFolderPath, RequestMappingTemplateFileName),
        schema.resolvers[currentName]
      );
    }
    if (resource.Properties.ResponseMappingTemplate) {
      transformAndWrite(
        path.resolve(outputPath, resolversFolderPath, ResponseMappingTemplateFileName),
        resource.Properties.ResponseMappingTemplate
      );
    } else if (resource.Properties.ResponseMappingTemplateS3Location) {
      const currentName = lastElement(resource.Properties.ResponseMappingTemplateS3Location.split('/'));
      transformAndWrite(
        path.resolve(outputPath, resolversFolderPath, ResponseMappingTemplateFileName),
        schema.resolvers[currentName]
      );
    }

    const isTable: boolean = resource.Properties.DataSourceName === stackName + 'DataSource';
    const isNone: boolean = resource.Properties.DataSourceName === 'NONE';
    const isPipeline: boolean = resource.Properties.Kind === 'PIPELINE';
    if (!RequestMappingTemplateFileName || !ResponseMappingTemplateFileName || !FieldName || !TypeName) {
      return;
    }
    let pipelineFunctions = undefined;
    if (isPipeline) {
      pipelineFunctions = resource.Properties.PipelineConfig.map((f: any) => {
        const logicalId = f[0];
        const maybeName = schema.stacks[stackName]?.Resources?.[logicalId]?.Properties?.Name;
        return maybeName || f[0];
      });
    }

    const resolverConfig: ResolverConfig = {
      fieldName: FieldName,
      typeName: TypeName,
      pipelineFunctions: pipelineFunctions,
      requestMappingTemplateFilePath: [resolversFolderPath, RequestMappingTemplateFileName],
      responseMappingTemplateFilePath: [resolversFolderPath, ResponseMappingTemplateFileName],
      dataSourceKind: isTable ? 'TABLE' : isPipeline ? 'PIPELINE' : 'NONE',
    };

    if (!isTable && !isNone && !isPipeline) {
      const maybeDataSourceName = resource.Properties?.DataSourceName?.payload?.payload?.[1]?.[2];
      if (maybeDataSourceName && maybeDataSourceName.endsWith('DataSource')) {
        resolverConfig.dataSourceKind = 'CONNECTION';
        resolverConfig.connectionModel = maybeDataSourceName.replace(/DataSource$/, '');
      }
      this.additionalResolvers.push(resolverConfig);
    } else {
      if (tableStacks.includes(stackName)) {
        if (!(stackName in this.resolvers)) {
          this.resolvers[stackName] = [];
        }
        this.resolvers[stackName].push(resolverConfig);
      } else {
        this.additionalResolvers.push(resolverConfig);
      }
    }
  }

  private prepareDataSource(stackName: string, resource: any) {
    if (resource.Properties.Type === 'AWS_LAMBDA') {
      const functionArn = resource.Properties?.LambdaConfig?.LambdaFunctionArn;
      if (!functionArn) {
        throw new Error(`unexpected data source structure: ${JSON.stringify(resource)}`);
      }
      const functionName = functionArn.split(':function:')?.[1];
      if (!functionName) {
        throw new Error(`unexpected functionArn: ${functionArn}`);
      }
      if (!(functionName in this.functionNameToDataSourceName)) {
        this.functionNameToDataSourceName[functionName] = resource.Properties.Name;
      }
    }
    if (resource.Properties.Type === 'AMAZON_DYNAMODB') {
      if (resource.Properties.Name === stackName + 'Table') {
        this.tableDatasources[stackName] = resource.Properties.Name;
      } else {
        throw new Error(`unexpected property name`);
      }
    }
  }

  private preparePipelineFunctionConfiguration(stackName: string, resource: any, schema: any, tableStacks: string[]) {
    const pipelineFunctionName = resource.Properties.Name;
    let dataSourceName = resource.Properties.DataSourceName;
    const isNoneDS = dataSourceName.includes('NONEDS');
    const tableConnection = tableStacks
      .filter((stack) => dataSourceName.includes(`${stack}DataSource`))
      .reduce((acc, cur) => (cur.length > acc.length ? cur : acc), '');
    let dataSourceKind: undefined | 'NONE' | 'CONNECTION' | 'FUNCTION';
    if (isNoneDS) {
      dataSourceName = NONE_DS_NAME;
      dataSourceKind = 'NONE';
    } else if (tableConnection) {
      dataSourceName = tableConnection;
      dataSourceKind = 'CONNECTION';
    } else if (stackName === 'FunctionDirectiveStack') {
      dataSourceKind = 'FUNCTION';
    }
    if (!pipelineFunctionName || !dataSourceName) {
      throw new Error(`unexpected resource ${resource}`);
    }
    const RequestMappingTemplateFileName: string = lastElement(
      resource.Properties.RequestMappingTemplateS3Location.split('/')
    );
    const ResponseMappingTemplateFileName = RequestMappingTemplateFileName.replace('.req.', '.res.');

    transformAndWrite(
      path.resolve(outputPath, pipelineFunctionsFolderPath, RequestMappingTemplateFileName),
      schema.resolvers[RequestMappingTemplateFileName]
    );
    if (resource.Properties.ResponseMappingTemplate) {
      transformAndWrite(
        path.resolve(outputPath, pipelineFunctionsFolderPath, ResponseMappingTemplateFileName),
        resource.Properties.ResponseMappingTemplate
      );
    } else if (resource.Properties.ResponseMappingTemplateS3Location) {
      const currentName = lastElement(resource.Properties.ResponseMappingTemplateS3Location.split('/'));
      transformAndWrite(
        path.resolve(outputPath, pipelineFunctionsFolderPath, ResponseMappingTemplateFileName),
        schema.resolvers[currentName]
      );
    }
    if (tableStacks.includes(stackName)) {
      if (!(stackName in this.pipelineFunctions)) {
        this.pipelineFunctions[stackName] = {};
      }
      this.pipelineFunctions[stackName][pipelineFunctionName] = {
        dataSourceName,
        dataSourceKind,
        requestMappingTemplateFilePath: [pipelineFunctionsFolderPath, RequestMappingTemplateFileName],
        responseMappingTemplateFilePath: [pipelineFunctionsFolderPath, ResponseMappingTemplateFileName],
      };
    } else {
      this.additionalPipelineFunctions[pipelineFunctionName] = {
        dataSourceName,
        dataSourceKind,
        requestMappingTemplateFilePath: [pipelineFunctionsFolderPath, RequestMappingTemplateFileName],
        responseMappingTemplateFilePath: [pipelineFunctionsFolderPath, ResponseMappingTemplateFileName],
      };
    }
  }
}

async function transform() {
  rimraf.sync(outputPath);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath);
  }
  if (!fs.existsSync(path.resolve(outputPath, resolversFolderPath))) {
    fs.mkdirSync(path.resolve(outputPath, resolversFolderPath));
  }
  if (!fs.existsSync(path.resolve(outputPath, pipelineFunctionsFolderPath))) {
    fs.mkdirSync(path.resolve(outputPath, pipelineFunctionsFolderPath));
  }
  const transformer = v2transformerProvider();
  const schemaPath = path.resolve(__dirname, '..', 'schema.graphql');
  process.stdout.write(`\nTransforming schema from ${schemaPath} into ${outputPath} .. `);
  const schema = fs.readFileSync(schemaPath);
  const schemaDoc: DeploymentResources = transformer.transform(schema.toString());
  fs.writeFileSync(`${outputPath}/schema.graphql`, schemaDoc.schema);
  const classifier = new ResolverClassifier(schemaDoc);

  fs.writeFileSync(`${outputPath}/resolvers.json`, JSON.stringify(classifier, null, 2));

  process.stdout.write('Done\n');
  return schemaDoc;
}

transform();
