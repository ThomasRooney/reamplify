import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import { ReamplifyTableConfigStack } from './tableConfigToTableStack';
import { Construct } from 'constructs';
import { ReamplifyAppsync } from '../stack/reamplifyAppsync';
import type { ResolverClassifierOutput, ResolverConfig } from '@reamplify/schema/src/transformSchema';
const resolverConfig = require('@reamplify/schema/appsync/resolvers.json') as ResolverClassifierOutput;
import { ReamplifyDynamoDbDataSource } from '../construct/reamplifyDataSource';
import * as path from 'path';
import * as fs from 'fs';
import { ReamplifyResolver } from '../construct/reamplifyResolver';
import { ReamplifyAppsyncFunctions } from '../stack/reamplifyAppsyncFunctions';
import { CfnFunctionConfiguration } from 'aws-cdk-lib/aws-appsync';
import { MappingTemplate } from '@aws-cdk/aws-appsync-alpha';
import { NONE_DS_NAME } from '@reamplify/schema/src/transformer';
export interface ReamplifyResolverStack extends Stack {
  tableDataSource: ReamplifyDynamoDbDataSource;
  pipelineFunctions: Record<string, CfnFunctionConfiguration>;
}

export interface ResolverStackProps extends StackProps {
  scope: Construct;
  workspace: string;
  tableStack: ReamplifyTableConfigStack;
  resolverStack: ReamplifyAppsync;
  appsyncFunctionsStack: ReamplifyAppsyncFunctions;
  stackName: string;
}

export const tableConfigToResolverStack = (props: ResolverStackProps): ReamplifyResolverStack => {
  const { scope, tableStack } = props;

  const tableResolvers: ResolverConfig[] = resolverConfig.resolvers[tableStack.config.name];
  if (!tableResolvers) {
    throw new Error(`${tableStack.config.name} not found in @factor/schema/appsync/resolvers.json resolvers`);
  }
  const schemaFolder = path.dirname(require.resolve('@reamplify/schema'));
  const appsyncPath = path.resolve(schemaFolder, 'appsync');
  if (!fs.existsSync(appsyncPath)) {
    throw new Error(`could not find appsyncPath at ${appsyncPath}`);
  }

  const tableResolverClass = class ReamplifyTableConfigStack extends Stack {
    public readonly tableDataSource: ReamplifyDynamoDbDataSource;
    public readonly pipelineFunctions: Record<string, CfnFunctionConfiguration> = {};
    constructor(scope: Construct, id: string, props: ResolverStackProps) {
      super(scope, id, props);
      Tags.of(this).add('stack', 'ReamplifyResolverStack');
      Tags.of(this).add('workspace', tableStack.workspace);
      Tags.of(this).add('table', tableStack.config.name);

      this.tableDataSource = new ReamplifyDynamoDbDataSource(this, props.tableStack.config.name + 'DataSource', {
        api: props.resolverStack.appsyncAPI,
        table: props.tableStack.table,
      });

      for (const [functionName, config] of Object.entries(resolverConfig.pipelineFunctions[tableStack.config.name])) {
        let dataSourceName;
        let ds;
        if (config.dataSourceName === NONE_DS_NAME) {
          dataSourceName = props.resolverStack.noneDataSource.name;
          ds = props.resolverStack.noneDataSource.ds;
        } else if (config.dataSourceName === props.tableStack.config.name + 'Table') {
          dataSourceName = this.tableDataSource.name;
          ds = this.tableDataSource.ds;
        } else {
          dataSourceName = props.appsyncFunctionsStack.functionDataSources[config.dataSourceName]?.name;
          ds = props.appsyncFunctionsStack.functionDataSources[config.dataSourceName]?.ds;
        }

        const funcConfiguration = new CfnFunctionConfiguration(this, functionName, {
          apiId: props.resolverStack.appsyncAPI.apiId,
          name: functionName,
          functionVersion: '2018-05-29',
          dataSourceName,
          requestMappingTemplate: MappingTemplate.fromFile(
            path.resolve(appsyncPath, ...config.requestMappingTemplateFilePath)
          ).renderTemplate(),
          responseMappingTemplate: MappingTemplate.fromFile(
            path.resolve(appsyncPath, ...config.responseMappingTemplateFilePath)
          ).renderTemplate(),
        });
        if (ds) {
          funcConfiguration.addDependsOn(ds);
        }
        this.pipelineFunctions[functionName] = funcConfiguration;
      }
      for (const resolver of tableResolvers) {
        new ReamplifyResolver(this, `${resolver.typeName}-${resolver.fieldName}-resolver`, {
          api: props.resolverStack.appsyncAPI,
          config: resolver,
          pipelineFunctions: { ...props.appsyncFunctionsStack.pipelineFunctions, ...this.pipelineFunctions },
          tableDataSource: this.tableDataSource,
          noneDataSource: props.resolverStack.noneDataSource,
          requestMappingTemplateFilePath: path.resolve(appsyncPath, ...resolver.requestMappingTemplateFilePath),
          responseMappingTemplateFilePath: path.resolve(appsyncPath, ...resolver.responseMappingTemplateFilePath),
        });
      }
    }
  };

  return new tableResolverClass(scope, props.stackName, props);
};
