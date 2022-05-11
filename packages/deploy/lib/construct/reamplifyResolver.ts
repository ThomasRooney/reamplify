import { BaseDataSource, IGraphqlApi, MappingTemplate } from '@aws-cdk/aws-appsync-alpha';
import { CfnFunctionConfiguration, CfnResolver } from 'aws-cdk-lib/aws-appsync';
import type { ResolverConfig } from '@reamplify/schema/src/transformSchema';
import type { ReamplifyResolverStack } from '../stackbuilder/tableConfigToResolverStack';
import { Construct } from 'constructs';

export class ReamplifyResolver extends CfnResolver {
  constructor(
    scope: Construct,
    id: string,
    props: {
      api: IGraphqlApi;
      pipelineFunctions: Record<string, CfnFunctionConfiguration>;
      resolverStacks?: Record<string, ReamplifyResolverStack>;
      tableDataSource?: BaseDataSource;
      noneDataSource?: BaseDataSource;
      requestMappingTemplateFilePath: string;
      responseMappingTemplateFilePath: string;
      config: ResolverConfig;
    }
  ) {
    switch (props.config.dataSourceKind) {
      case 'TABLE': {
        if (!props.tableDataSource) {
          throw new Error(`missing expected attribute 'tableDataSource' on ${id}`);
        }

        super(scope, id, {
          apiId: props.api.apiId,
          typeName: props.config.typeName,
          fieldName: props.config.fieldName,
          kind: 'UNIT',
          dataSourceName: props.tableDataSource.name,
          requestMappingTemplate: MappingTemplate.fromFile(props.requestMappingTemplateFilePath).renderTemplate(),
          responseMappingTemplate: MappingTemplate.fromFile(props.responseMappingTemplateFilePath).renderTemplate(),
        });
        this.addDependsOn(props.tableDataSource.ds);
        break;
      }
      case 'PIPELINE': {
        if (!props.config.pipelineFunctions) {
          throw new Error(`missing expected attribute 'pipelineFunctions' on ${id}`);
        }
        const unexpectedAttribute = props.config.pipelineFunctions.find((fName) => !(fName in props.pipelineFunctions));
        if (unexpectedAttribute) {
          throw new Error(`unexpected attribute ${unexpectedAttribute} in 'pipelineFunctions' on ${id}`);
        }
        const dependsOn: any[] = [];
        const functions = props.config.pipelineFunctions.map((fName) => {
          dependsOn.push(props.pipelineFunctions[fName]);
          return props.pipelineFunctions[fName].attrFunctionId;
        });
        super(scope, id, {
          apiId: props.api.apiId,
          kind: 'PIPELINE',
          typeName: props.config.typeName,
          fieldName: props.config.fieldName,
          pipelineConfig: {
            functions,
          },
          requestMappingTemplate: MappingTemplate.fromFile(props.requestMappingTemplateFilePath).renderTemplate(),
          responseMappingTemplate: MappingTemplate.fromFile(props.responseMappingTemplateFilePath).renderTemplate(),
        });
        dependsOn.forEach((item) => this.addDependsOn(item));
        break;
      }
      case 'CONNECTION': {
        if (!props.config.connectionModel) {
          throw new Error(`missing expected attribute 'connectionModel' on ${id}`);
        }
        if (!props.resolverStacks) {
          throw new Error(`missing expected attribute 'resolverStacks' on ${id}`);
        }
        if (!(props.config.connectionModel in props.resolverStacks)) {
          throw new Error(
            `missing expected attribute ${props.config.connectionModel} in ${props.resolverStacks} on ${id}`
          );
        }
        super(scope, id, {
          apiId: props.api.apiId,
          kind: 'UNIT',
          typeName: props.config.typeName,
          fieldName: props.config.fieldName,
          dataSourceName: props.resolverStacks[props.config.connectionModel].tableDataSource.name,
          requestMappingTemplate: MappingTemplate.fromFile(props.requestMappingTemplateFilePath).renderTemplate(),
          responseMappingTemplate: MappingTemplate.fromFile(props.responseMappingTemplateFilePath).renderTemplate(),
        });
        this.addDependsOn(props.resolverStacks[props.config.connectionModel].tableDataSource.ds);
        break;
      }
      case 'NONE': {
        if (!props.noneDataSource) {
          throw new Error(`missing expected attribute 'resolverStacks' on ${id}`);
        }

        super(scope, id, {
          apiId: props.api.apiId,
          kind: 'UNIT',
          typeName: props.config.typeName,
          fieldName: props.config.fieldName,
          dataSourceName: props.noneDataSource.name,
          requestMappingTemplate: MappingTemplate.fromFile(props.requestMappingTemplateFilePath).renderTemplate(),
          responseMappingTemplate: MappingTemplate.fromFile(props.responseMappingTemplateFilePath).renderTemplate(),
        });
        this.addDependsOn(props.noneDataSource.ds);
        break;
      }
    }
  }
}
