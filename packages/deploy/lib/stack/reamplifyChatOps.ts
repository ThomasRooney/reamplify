import { Construct } from 'constructs';
import { RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as chatbot from 'aws-cdk-lib/aws-chatbot';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CommonConfiguration } from './reamplifyEnvironment';

export interface SlackConfigurationProps {
  workspace: string;
  appName: string;
  slack?: {
    slackChannelConfigurationName: string;
    slackWorkspaceId: string;
    slackChannelId: string;
  };
  env: {
    account: string;
  };
}

export const notifyTopicName = (props: { appName: string; workspace: string }) =>
  `${props.appName}-${props.workspace}-DevTeamNotify`;

export class ReamplifyChatOps extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & SlackConfigurationProps) {
    super(scope, id, props);
    Tags.of(this).add('construct', 'ReamplifyChatOps');

    const topic = new sns.Topic(this, 'DevTeamNotify', {
      topicName: notifyTopicName(props),
    });
    topic.grantPublish(new ServicePrincipal('codestar-notifications.amazonaws.com'));
    topic.grantPublish(new ServicePrincipal('events.amazonaws.com'));
    topic.grantPublish(new ServicePrincipal('cloudwatch.amazonaws.com'));

    topic.applyRemovalPolicy(RemovalPolicy.RETAIN);

    new ssm.StringParameter(this, 'TopicArnSSM', {
      allowedPattern: '.*',
      description: `Parameter DevTeamNotifyArn for workspace ${props.workspace}`,
      parameterName: `/${props.appName}/${props.workspace}/DevTeamNotifyArn`,
      stringValue: topic.topicArn,
      tier: ssm.ParameterTier.STANDARD,
    });

    if (props.slack) {
      const slackChannel = new chatbot.SlackChannelConfiguration(this, 'ChatOpsSlackChannel', {
        slackChannelConfigurationName: props.slack.slackChannelConfigurationName,
        slackWorkspaceId: props.slack.slackWorkspaceId,
        slackChannelId: props.slack.slackChannelId,
        logRetention: RetentionDays.ONE_YEAR,
      });

      const readonlyAccess = iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess');
      slackChannel.role?.addManagedPolicy(readonlyAccess);
      slackChannel.addNotificationTopic(topic);
    }
  }
}
