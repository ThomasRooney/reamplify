import { Construct } from 'constructs';
import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as fs from 'fs';
const resolverConfig = require('@reamplify/schema/appsync/resolvers.json') as ResolverClassifierOutput;
import type { ResolverClassifierOutput, ResolverConfig } from '@reamplify/schema/src/transformSchema';
import path from 'path';
import { ReamplifyResolver } from '../construct/reamplifyResolver';
import { ReamplifyResolverStack } from '../stackbuilder/tableConfigToResolverStack';
import { ReamplifyAppsync } from './reamplifyAppsync';
import { ReamplifyAppsyncFunctions } from './reamplifyAppsyncFunctions';
import { CfnFunctionConfiguration } from 'aws-cdk-lib/aws-appsync';
import { MappingTemplate } from '@aws-cdk/aws-appsync-alpha';

export interface ReamplifyAppsyncAdditionalResolversConfiguration {
  workspace: string;
  resolverStacks: Record<string, ReamplifyResolverStack>;
  appsyncStack: ReamplifyAppsync;
  appsyncFunctionsStack: ReamplifyAppsyncFunctions;
  env: { region: string; account: string };
}

export class ReamplifyAppsyncAdditionalResolvers extends Stack {
  public readonly pipelineFunctions: {};
  constructor(scope: Construct, id: string, props: ReamplifyAppsyncAdditionalResolversConfiguration & StackProps) {
    super(scope, id, props);
    Tags.of(this).add('stack', 'ReamplifyAppsyncAdditionalResolvers');
    Tags.of(this).add('workspace', props.workspace);

    const schemaFolder = path.dirname(require.resolve('@reamplify/schema'));
    const schemaFileLocation = path.resolve(schemaFolder, 'appsync', 'schema.graphql');
    if (!fs.existsSync(schemaFileLocation)) {
      throw new Error(`could not find compiled schema at ${schemaFileLocation}`);
    }
    const appsyncPath = path.resolve(schemaFolder, 'appsync');
    if (Object.entries(resolverConfig.pipelineFunctions).length && !fs.existsSync(appsyncPath)) {
      throw new Error(`could not find appsyncPipelineFunctionsFolderPath at ${appsyncPath}`);
    }

    this.pipelineFunctions = Object.entries(resolverConfig.additionalPipelineFunctions)
      .filter(([k, config]) => config.dataSourceKind !== 'FUNCTION')
      .reduce((acc, [functionName, config]) => {
        let dataSourceName;

        if (config.dataSourceKind === 'NONE') {
          dataSourceName = props.appsyncStack.noneDataSource.name;
        } else {
          dataSourceName = props.resolverStacks[config.dataSourceName].tableDataSource.name;
        }

        const funcConfiguration = new CfnFunctionConfiguration(this, functionName, {
          apiId: props.appsyncStack.appsyncAPI.apiId,
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
        acc[functionName] = funcConfiguration;

        return acc;
      }, {} as any);

    const allPipelineFunctions = {
      ...props.appsyncFunctionsStack.pipelineFunctions,
      ...Object.values(props.resolverStacks).reduce(
        (acc, resolverStack) => ({ ...acc, ...resolverStack.pipelineFunctions }),
        {}
      ),
      ...this.pipelineFunctions,
    };
    for (const resolver of resolverConfig.additionalResolvers) {
      new ReamplifyResolver(this, `${resolver.typeName}-${resolver.fieldName}-resolver`, {
        api: props.appsyncStack.appsyncAPI,
        config: resolver as ResolverConfig,
        resolverStacks: props.resolverStacks,
        pipelineFunctions: allPipelineFunctions,
        requestMappingTemplateFilePath: path.resolve(appsyncPath, ...resolver.requestMappingTemplateFilePath),
        responseMappingTemplateFilePath: path.resolve(appsyncPath, ...resolver.responseMappingTemplateFilePath),
      });
    }
  }
}
