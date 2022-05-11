import { Construct } from 'constructs';
import { RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { FrontendPipeline } from '../construct/frontendPipeline';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import * as pipelineactions from 'aws-cdk-lib/aws-codepipeline-actions';
import { ManualApprovalAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { ReamplifyAppsync } from './reamplifyAppsync';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { ReamplifyCloudwatchMetricStack } from './reamplifyCloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import { DetailType, NotificationRule } from 'aws-cdk-lib/aws-codestarnotifications';
import { ReamplifyAppsyncFunctions } from './reamplifyAppsyncFunctions';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';

export interface PwProtect {
  passwordProtect?: { pw: string; user: string };
}

export interface HostedZoneConfiguration {
  hostedZone: { hostedZoneId: string; zoneName: string };
}

export interface CommonConfiguration {
  workspace: string;
  appName: string;
  env: { region: string; account: string };
  live: boolean;
  stateAssetRemovalPolicy: RemovalPolicy;
  includeEventLambdas: boolean;
  disableUserAccess: boolean;
}

export interface DeployConfiguration extends CommonConfiguration {
  deploy: {
    enable: boolean;
    requiresApproval: boolean;
    branch: string;
    connectionArn: string;
    owner: string;
    repo: string;
  };
}

export interface DependentStacks {
  appsync: ReamplifyAppsync;
  appsyncFunctionsStack: ReamplifyAppsyncFunctions;
  metrics: ReamplifyCloudwatchMetricStack;
}

export class ReamplifyApplicationEnvironment extends Stack {
  public readonly props: PwProtect &
    DeployConfiguration &
    DependentStacks &
    HostedZoneConfiguration &
    CommonConfiguration;
  public readonly deployConfig: Record<string, string> = {};
  constructor(
    scope: Construct,
    id: string,
    props: PwProtect &
      DeployConfiguration &
      DependentStacks &
      HostedZoneConfiguration &
      CommonConfiguration &
      StackProps
  ) {
    super(scope, id, props);
    const app = this;
    Tags.of(this).add('workspace', props.workspace);
    Tags.of(this).add('stack', 'ReamplifyApplicationEnvironment');
    this.props = props;
    const reamplifyApi = props.appsync;

    this.store('aws_project_region', props.env.region);
    this.store('aws_appsync_graphqlEndpoint');
    this.store('aws_appsync_region');
    this.store('aws_appsync_authenticationType', 'AMAZON_COGNITO_USER_POOLS');
    this.store('aws_cognito_identity_pool_id');
    this.store('aws_cognito_identity_pool_provider');
    this.store('aws_cognito_region');
    this.store('aws_cognito_domain');
    this.store('aws_cognito_scope');
    this.store('aws_user_pools_id');
    this.store('aws_user_pools_web_client_id');
    this.store('aws_user_files_s3_bucket');
    this.store('aws_user_files_s3_bucket_region');
    this.store('aws_mandatory_sign_in', 'enable');
    this.store('aws_webapp_url', props.hostedZone.zoneName);

    let pipeline: Pipeline | undefined = undefined;
    let src: Artifact | undefined = undefined;
    if (props.deploy.enable) {
      const artifactBucket = new Bucket(this, 'ArtifactBucket', {
        bucketName: `artifacts.fe.${props.workspace}.${props.env.region}.${props.env.account}.${props.appName}`,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        autoDeleteObjects: true,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
        pipelineName: `${props.appName}-${props.workspace}-application`,
        artifactBucket,
      });
      const chatopsTopicArn = ssm.StringParameter.fromStringParameterName(
        this,
        'ChatOpsTopicArn',
        `/${props.appName}/${props.workspace}/DevTeamNotifyArn`
      );

      const notifyTopic = sns.Topic.fromTopicArn(this, 'SlackNotify', chatopsTopicArn.stringValue);

      new NotificationRule(this, 'PipelineNotification', {
        notificationRuleName: `${props.appName}-${props.workspace}-application-pipeline-notifications`,
        detailType: DetailType.FULL,
        events: [
          'codepipeline-pipeline-pipeline-execution-started',
          'codepipeline-pipeline-manual-approval-needed',
          'codepipeline-pipeline-pipeline-execution-failed',
          'codepipeline-pipeline-pipeline-execution-succeeded',
        ],
        source: pipeline,
        targets: [notifyTopic],
      });

      src = new codepipeline.Artifact(`${props.workspace}-source`);
      pipeline.addStage({
        stageName: 'Source',
        actions: [
          new pipelineactions.CodeStarConnectionsSourceAction({
            actionName: 'GitHub',
            output: src,
            connectionArn: props.deploy.connectionArn,
            owner: props.deploy.owner,
            repo: props.deploy.repo,
            branch: props.deploy.branch,
          }),
        ],
      });
      if (props.deploy.requiresApproval) {
        const approvalStage = pipeline.addStage({
          stageName: props.workspace + '.Approval',
        });
        approvalStage.addAction(
          new ManualApprovalAction({
            actionName: 'ManualApproval',
            notifyEmails: ['thomas@resilientsoftware.co.uk'],
          })
        );
      }
      pipeline.addStage({ stageName: props.workspace + '.Build' });
      pipeline.addStage({ stageName: props.workspace + '.Deploy' });
      pipeline.addStage({ stageName: props.workspace + '.PostDeploy' });
    }

    const deployConfig = JSON.stringify(this.deployConfig);
    new ssm.StringParameter(this, 'DEPLOY_CONFIGSSM', {
      allowedPattern: '.*',
      description: `Parameter 'DEPLOY_CONFIG' for workspace ${this.props.workspace}`,
      parameterName: `/${props.appName}/${this.props.workspace}/DEPLOY_CONFIG`,
      stringValue: deployConfig,
      tier: ssm.ParameterTier.STANDARD,
    });

    const reamplifyFE = new FrontendPipeline(app, `FrontendPipeline`, {
      ...props,
      deployConfig: deployConfig,
      ci: pipeline && src ? { pipeline, src } : undefined,
    });

    reamplifyFE.node.addDependency(reamplifyApi);
  }
  private store(id: string, value?: string): void {
    if (value !== undefined) {
      this.deployConfig[id] = value;

      if (String(value).length) {
        new ssm.StringParameter(this, id, {
          parameterName: `/${this.props.appName}/${this.props.workspace}/${id}`,
          stringValue: value,
          tier: ssm.ParameterTier.STANDARD,
        });
      }
      return undefined;
    } else {
      const param = ssm.StringParameter.fromStringParameterName(
        this,
        id,
        `/${this.props.appName}/${this.props.workspace}/${id}`
      );
      this.deployConfig[id] = param.stringValue;
    }
  }
}
