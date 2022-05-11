import * as cdk from 'aws-cdk-lib';
import { pipelines, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodeBuildStep, CodePipeline, ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import { ReamplifyAppStage } from '../app/reamplify';
import { BuildEnvironmentVariableType, BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { CommonConfiguration, DeployConfiguration, HostedZoneConfiguration, PwProtect } from './reamplifyEnvironment';
import { SSODeployConfiguration } from '../construct/userPool';
import { SlackConfigurationProps } from './reamplifyCloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { DetailType, NotificationRule } from 'aws-cdk-lib/aws-codestarnotifications';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';

export type CDKPipelineStackProps = cdk.StackProps &
  PwProtect &
  HostedZoneConfiguration &
  CommonConfiguration &
  DeployConfiguration &
  SSODeployConfiguration &
  SlackConfigurationProps;

export function buildCacheBucketName(props: {
  appName: string;
  workspace: string;
  env: { account: string; region: string };
}): string {
  return `build-cache.${props.workspace}.${props.appName}.${props.env.region}.${props.env.account}`;
}

export class CDKPipelineStack extends cdk.Stack {
  public readonly pipeline: CodePipeline;
  constructor(scope: Construct, id: string, props: CDKPipelineStackProps) {
    super(scope, id, props);

    const artifactBucket = new Bucket(this, 'ArtifactBucket', {
      bucketName: `artifacts.cdk.${props.workspace}.${props.env.region}.${props.env.account}.${props.appName}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const pipelineName = `${props.appName}-${props.workspace}-infrastructure`;

    const codePipeline = new codepipeline.Pipeline(this, 'CodePipeline', {
      pipelineName: pipelineName,
      artifactBucket,
    });

    const repoConnection = pipelines.CodePipelineSource.connection(
      `${props.deploy.owner}/${props.deploy.repo}`,
      props.deploy.branch,
      {
        connectionArn: props.deploy.connectionArn,
        codeBuildCloneOutput: true,
      }
    );

    const synthStep = new CodeBuildStep('Synth', {
      input: repoConnection,
      commands: [],
      primaryOutputDirectory: 'packages/deploy/cdk.out',
      buildEnvironment: {
        environmentVariables: {
          WORKSPACE: {
            type: BuildEnvironmentVariableType.PLAINTEXT,
            value: props.workspace,
          },
        },
      },
      partialBuildSpec: BuildSpec.fromObject({
        env: {
          shell: 'bash',
        },
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 14,
            },
            commands: ['n 16', 'cd packages/deploy/'],
          },
          pre_build: {
            commands: ['npm install -g corepack'],
          },
          build: {
            commands: [
              `set -eox pipefail
               yarn install --immutable
               yarn run "synth:$WORKSPACE"`,
            ],
          },
        },
      }),
    });
    this.pipeline = new CodePipeline(this, 'Pipeline', {
      codePipeline: codePipeline,
      selfMutation: true,
      publishAssetsInParallel: false,
      synth: synthStep,
    });
    if (props.deploy.requiresApproval) {
      synthStep.addStepDependency(new ManualApprovalStep('ReamplifyStageApproval'));
    }
    const chatopsTopicArn = ssm.StringParameter.fromStringParameterName(
      this,
      'ChatOpsTopicArn',
      `/${props.appName}/${props.workspace}/DevTeamNotifyArn`
    );

    const chatopsCDKNotify = sns.Topic.fromTopicArn(this, 'SlackNotify', chatopsTopicArn.stringValue);

    const stage = new ReamplifyAppStage(this, 'ReamplifyStage', props);
    this.pipeline.addStage(stage);
    this.pipeline.buildPipeline();

    new NotificationRule(this, 'PipelineNotification', {
      notificationRuleName: `${props.appName}-${props.workspace}-infrastructure-pipeline-notifications`,
      detailType: DetailType.FULL,
      events: [
        'codepipeline-pipeline-stage-execution-succeeded',
        'codepipeline-pipeline-stage-execution-failed',
        'codepipeline-pipeline-pipeline-execution-started',
        'codepipeline-pipeline-pipeline-execution-canceled',
        'codepipeline-pipeline-manual-approval-needed',
        'codepipeline-pipeline-pipeline-execution-failed',
        'codepipeline-pipeline-pipeline-execution-succeeded',
      ],
      source: this.pipeline.pipeline,
      targets: [chatopsCDKNotify],
    });
  }
}
