import { ReamplifyAppsync } from '../stack/reamplifyAppsync';
import { ReamplifyTableConfigStack, tableConfigToTableStack } from '../stackbuilder/tableConfigToTableStack';
import { table, tables } from '@reamplify/schema/lib/models/tables';
import { tableConfigToResolverStack } from '../stackbuilder/tableConfigToResolverStack';
import { ReamplifyApplicationEnvironment } from '../stack/reamplifyEnvironment';
import { ReamplifyAppsyncAdditionalResolvers } from '../stack/reamplifyAppsyncAdditionalResolvers';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CDKPipelineStackProps } from '../stack/cdkPipelineStack';
import { ReamplifyCloudwatchMetricStack } from '../stack/reamplifyCloudwatch';
import { ReamplifyAppsyncFunctions } from '../stack/reamplifyAppsyncFunctions';

export const createReamplifyEnvironment = (scope: Construct, props: CDKPipelineStackProps, wrapWithId?: string) => {
  let app = scope;
  if (wrapWithId) {
    app = new Construct(app, wrapWithId);
    app = new Construct(app, 'BackendStage');
  }
  cdk.Tags.of(app).add('user:Application', props.appName);

  const { workspace } = props;

  const metrics = new ReamplifyCloudwatchMetricStack(app, props.appName + '-' + workspace + '-CloudwatchMetrics', {
    ...props,
    stackName: props.appName + '-' + workspace + '-CloudwatchMetrics',
  });

  const dynamodbTables: Record<keyof typeof table, ReamplifyTableConfigStack> = tables.reduce((acc, cur) => {
    acc[cur.name] = tableConfigToTableStack({
      ...props,
      scope: app,
      tableData: cur,
      stackName: `${props.appName}-${workspace}-${cur.name}-Table`,
    });
    return acc;
  }, {} as Record<keyof typeof table, ReamplifyTableConfigStack>);

  const appsyncStack = new ReamplifyAppsync(app, props.appName + '-' + workspace + '-AppSync', {
    ...props,
    stackName: props.appName + '-' + workspace + '-AppSync',
  });
  const appsyncFunctionsStack = new ReamplifyAppsyncFunctions(
    app,
    props.appName + '-' + workspace + '-AppSyncFunctions',
    {
      ...props,
      metrics,
      appsync: appsyncStack,
      tables: dynamodbTables,
      stackName: props.appName + '-' + workspace + '-AppSyncFunctions',
    }
  );

  const resolverStacks = tables.reduce((acc, cur) => {
    acc[cur.name] = tableConfigToResolverStack({
      ...props,
      scope: app,
      appsyncFunctionsStack,
      resolverStack: appsyncStack,
      stackName: `${props.appName}-${workspace}-Resolver-${cur.name}`,
      tableStack: dynamodbTables[cur.name],
    });
    return acc;
  }, {});

  new ReamplifyAppsyncAdditionalResolvers(app, props.appName + '-' + workspace + '-AdditionalResolvers', {
    ...props,
    resolverStacks,
    stackName: `${props.appName}-${workspace}-AdditionalResolvers`,
    appsyncStack: appsyncStack,
    appsyncFunctionsStack,
  });

  new ReamplifyApplicationEnvironment(app, props.appName + '-' + workspace + '-Environment', {
    ...props,
    stackName: `${props.appName}-${workspace}-Environment`,
    appsyncFunctionsStack,
    appsync: appsyncStack,
    metrics: metrics,
  });
};

export class ReamplifyAppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: cdk.StageProps & CDKPipelineStackProps) {
    super(scope, id, props);

    createReamplifyEnvironment(this, props);
  }
}
