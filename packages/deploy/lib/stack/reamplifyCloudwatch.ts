import { Construct } from 'constructs';
import { Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { reamplifyLambdas } from '../lambda';
import { FilterPattern, ILogGroup, LogGroup } from 'aws-cdk-lib/aws-logs';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { CommonConfiguration } from './reamplifyEnvironment';

export interface SlackConfigurationProps {
  slack?: {
    slackChannelConfigurationName: string;
    slackWorkspaceId: string;
    slackChannelId: string;
  };
}

interface CloudwatchMetricProps extends CommonConfiguration {}

type MetricAlarms = {
  alarms: cloudwatch.Alarm[];
  functionName: string;
  logGroup: ILogGroup;
  countMetrics: cloudwatch.Metric[];
  durationMetrics: cloudwatch.Metric[];
};

export class ReamplifyCloudwatchMetricStack extends Stack {
  public readonly namespace: string;
  public readonly reamplifyLambdas: Record<string, MetricAlarms>;
  constructor(scope: Construct, id: string, props: StackProps & CloudwatchMetricProps & SlackConfigurationProps) {
    super(scope, id, props);
    Tags.of(this).add('construct', 'CloudwatchMetric');

    const dashboard = new cloudwatch.Dashboard(this, 'LicenseDashboard', {
      dashboardName: `${props.appName}-${props.workspace}`,
    });

    const chatopsTopicArn = ssm.StringParameter.fromStringParameterName(
      this,
      'ChatOpsTopicArn',
      `/${props.appName}/${props.workspace}/DevTeamNotifyArn`
    );

    const notifyTopic = sns.Topic.fromTopicArn(this, 'SlackNotify', chatopsTopicArn.stringValue);

    this.namespace = `${props.appName}/${props.workspace}/License`;

    this.reamplifyLambdas = Object.entries(reamplifyLambdas)
      .filter(([, lambdaConfig]) => lambdaConfig.scope === 'app' || lambdaConfig.scope === 'userpool')
      .reduce((acc, [k, lambdaConfig]) => {
        const functionName = lambdaConfig.name(props);
        let logGroup: ILogGroup;
        if (lambdaConfig.scope === 'app') {
          logGroup = new LogGroup(this, functionName + 'LogGroup', {
            removalPolicy: props.stateAssetRemovalPolicy,
            logGroupName: `/aws/lambda/${functionName}`,
            retention: lambdaConfig.retention,
          });
        } else {
          logGroup = LogGroup.fromLogGroupName(this, functionName + 'LogGroup', `/aws/lambda/${functionName}`);
        }
        const metricFilter = logGroup.addMetricFilter(functionName + 'MetricFilter', {
          metricName: functionName + 'NotifyMessage',
          metricNamespace: `Reamplify/${props.workspace}/Errors`,
          metricValue: '1',
          filterPattern: FilterPattern.anyTerm('[WARN]', '[ERROR]', '[FATAL]'),
          defaultValue: 0,
        });
        const logMetric = metricFilter.metric({
          period: Duration.minutes(1),
        });
        const errorsMetric = new cloudwatch.Metric({
          metricName: 'Errors',
          namespace: `AWS/Lambda`,
          unit: cloudwatch.Unit.COUNT,
          period: Duration.minutes(1),
          dimensionsMap: {
            FunctionName: functionName,
          },
        });
        const durationMetrics = new cloudwatch.Metric({
          metricName: 'Duration',
          namespace: `AWS/Lambda`,
          unit: cloudwatch.Unit.MILLISECONDS,
          period: Duration.minutes(1),
          dimensionsMap: {
            FunctionName: functionName,
          },
        });
        const throttleMetric = new cloudwatch.Metric({
          metricName: 'Throttles',
          namespace: `AWS/Lambda`,
          unit: cloudwatch.Unit.COUNT,
          period: Duration.minutes(1),
          dimensionsMap: {
            FunctionName: functionName,
          },
        });
        const invocationsMetric = new cloudwatch.Metric({
          metricName: 'Invocations',
          namespace: `AWS/Lambda`,
          unit: cloudwatch.Unit.COUNT,
          period: Duration.minutes(1),
          dimensionsMap: {
            FunctionName: functionName,
          },
        });
        const iteratorAgeMetric = new cloudwatch.Metric({
          metricName: 'IteratorAge',
          namespace: `AWS/Lambda`,
          unit: cloudwatch.Unit.MILLISECONDS,
          period: Duration.minutes(1),
          dimensionsMap: {
            FunctionName: functionName,
          },
        });
        let alarms: cloudwatch.Alarm[] = [];
        if (lambdaConfig.enabled(props)) {
          const alarm = new cloudwatch.Alarm(this, functionName + 'LogAlarm', {
            metric: logMetric,
            threshold: 0,
            evaluationPeriods: 1,
            treatMissingData: TreatMissingData.NOT_BREACHING,
            comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
            actionsEnabled: true,
          });
          const errorsMetricAlarm = new cloudwatch.Alarm(this, functionName + '-Error-Alarm', {
            metric: errorsMetric,
            threshold: 0,
            evaluationPeriods: 1,
            treatMissingData: TreatMissingData.NOT_BREACHING,
            comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
            actionsEnabled: true,
          });
          let warningAlarm: cloudwatch.Alarm;
          if (lambdaConfig.eventBased) {
            warningAlarm = new cloudwatch.Alarm(this, functionName + '-IteratorAge-Alarm', {
              metric: iteratorAgeMetric,
              threshold: lambdaConfig.batchingWindow.toMilliseconds() * 10,
              evaluationPeriods: 1,
              treatMissingData: TreatMissingData.NOT_BREACHING,
              comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
              actionsEnabled: true,
            });
          } else {
            warningAlarm = new cloudwatch.Alarm(this, functionName + '-Throttle-Alarm', {
              metric: throttleMetric,
              threshold: 2,
              evaluationPeriods: 1,
              treatMissingData: TreatMissingData.NOT_BREACHING,
              comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
              actionsEnabled: true,
            });
          }

          alarm.applyRemovalPolicy(RemovalPolicy.DESTROY);
          alarm.addAlarmAction(new cw_actions.SnsAction(notifyTopic));
          alarm.addOkAction(new cw_actions.SnsAction(notifyTopic));
          errorsMetricAlarm.applyRemovalPolicy(RemovalPolicy.DESTROY);
          errorsMetricAlarm.addAlarmAction(new cw_actions.SnsAction(notifyTopic));
          errorsMetricAlarm.addOkAction(new cw_actions.SnsAction(notifyTopic));
          warningAlarm.applyRemovalPolicy(RemovalPolicy.DESTROY);
          warningAlarm.addAlarmAction(new cw_actions.SnsAction(notifyTopic));
          warningAlarm.addOkAction(new cw_actions.SnsAction(notifyTopic));
          alarms = [alarm, errorsMetricAlarm, warningAlarm];
        }
        acc[k] = {
          alarms,
          functionName,
          logGroup,
          countMetrics: [invocationsMetric, logMetric, errorsMetric, throttleMetric],
          durationMetrics: [durationMetrics].concat(lambdaConfig.eventBased ? iteratorAgeMetric : []),
        };
        return acc;
      }, {} as Record<string, MetricAlarms>);
    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        width: 24,
        height: 12,
        alarms: Object.values(this.reamplifyLambdas).reduce(
          (acc, lambda) => acc.concat(lambda.alarms),
          <cloudwatch.Alarm[]>[]
        ),
      })
    );

    dashboard.addWidgets(
      ...Object.values(this.reamplifyLambdas).map(
        ({ functionName, countMetrics, durationMetrics }) =>
          new cloudwatch.GraphWidget({
            width: 12,
            title: functionName,
            left: countMetrics,
            right: durationMetrics,
          })
      )
    );
  }
}
