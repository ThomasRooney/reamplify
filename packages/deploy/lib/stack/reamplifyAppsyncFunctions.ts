import { Construct } from 'constructs';
import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import { LambdaDataSource, MappingTemplate } from '@aws-cdk/aws-appsync-alpha';
import resolverConfig from '@reamplify/schema/appsync/resolvers.json';
import path from 'path';
import { AppsyncFunctions } from '../construct/appsyncFunctions';
import { ReamplifyTableConfigStack } from '../stackbuilder/tableConfigToTableStack';
import { ReamplifyCloudwatchMetricStack } from './reamplifyCloudwatch';
import { CommonConfiguration } from './reamplifyEnvironment';
import { ReamplifyAppsync } from './reamplifyAppsync';
import { ReamplifyLambdaDataSource } from '../construct/reamplifyDataSource';
import { CfnFunctionConfiguration } from 'aws-cdk-lib/aws-appsync';
import fs from 'fs';
import { table } from '@reamplify/schema/lib/models/tables';

export interface AppsyncConfiguration extends CommonConfiguration {
  metrics: ReamplifyCloudwatchMetricStack;
  tables: Record<keyof typeof table, ReamplifyTableConfigStack>;
  appsync: ReamplifyAppsync;
}

export class ReamplifyAppsyncFunctions extends Stack {
  public readonly functionDataSources: Record<string, LambdaDataSource> = {};

  public readonly pipelineFunctions: Record<string, CfnFunctionConfiguration>;

  public readonly appsyncFunctions: AppsyncFunctions;
  constructor(scope: Construct, id: string, props: AppsyncConfiguration & StackProps) {
    super(scope, id, props);

    Tags.of(this).add('workspace', props.workspace);
    Tags.of(this).add('stack', 'ReamplifyAppsyncFunctions');
    const schemaFolder = path.dirname(require.resolve('@reamplify/schema'));
    const schemaFileLocation = path.resolve(schemaFolder, 'appsync', 'schema.graphql');
    if (!fs.existsSync(schemaFileLocation)) {
      throw new Error(`could not find compiled schema at ${schemaFileLocation}`);
    }
    const appsyncPath = path.resolve(schemaFolder, 'appsync');
    if (Object.entries(resolverConfig.pipelineFunctions).length && !fs.existsSync(appsyncPath)) {
      throw new Error(`could not find appsyncPipelineFunctionsFolderPath at ${appsyncPath}`);
    }

    this.appsyncFunctions = new AppsyncFunctions(this, 'AppSyncFunction', {
      appsyncAPI: props.appsync.appsyncAPI,
      ...props,
    });

    const expectedFunctionNames: Set<string> = new Set(Object.keys(resolverConfig.functionNameToDataSourceName));

    for (const functionName of Object.keys(this.appsyncFunctions.functions)) {
      const fName = functionName as keyof typeof resolverConfig.functionNameToDataSourceName;
      expectedFunctionNames.delete(fName);
      if (!(fName in resolverConfig.functionNameToDataSourceName)) {
        throw new Error(`unexpected functionName ${fName} -- not in ${resolverConfig.functionNameToDataSourceName}`);
      }
      const dataSourceName = resolverConfig.functionNameToDataSourceName[fName];
      this.functionDataSources[dataSourceName] = new ReamplifyLambdaDataSource(this, dataSourceName, {
        api: props.appsync.appsyncAPI,
        lambdaFunction: this.appsyncFunctions.functions[fName],
      });
    }
    if (expectedFunctionNames.size > 0) {
      throw new Error(
        `expected ${expectedFunctionNames.size} more lambda definitions. Missing ${Array.of(
          expectedFunctionNames.values()
        )}`
      );
    }

    this.pipelineFunctions = Object.entries(resolverConfig.additionalPipelineFunctions)
      .filter(([, config]) => config.dataSourceKind === 'FUNCTION')
      .reduce((acc, [functionName, config]) => {
        let dataSourceName;
        if (config.dataSourceKind === 'NONE') {
          dataSourceName = props.appsync.noneDataSource.name;
        } else {
          dataSourceName = this.functionDataSources[config.dataSourceName]?.name;
        }

        const funcConfiguration = new CfnFunctionConfiguration(this, functionName, {
          apiId: props.appsync.appsyncAPI.apiId,
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
        funcConfiguration.node.addDependency(this.functionDataSources[config.dataSourceName]);
        acc[functionName] = funcConfiguration;

        return acc;
      }, {} as Record<string, CfnFunctionConfiguration>);
  }
}
