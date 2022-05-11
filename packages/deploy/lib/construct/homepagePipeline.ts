import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as pipelineactions from 'aws-cdk-lib/aws-codepipeline-actions';
import { Duration, RemovalPolicy, Tags } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ManualApprovalAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { frontendBucketName } from '../stack/reamplifyGlobalStaticFrontend';
import { Construct } from 'constructs';
import { reamplifyLambdas } from '../lambda';
import * as path from 'path';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sns from 'aws-cdk-lib/aws-sns';
import { DetailType, NotificationRule } from 'aws-cdk-lib/aws-codestarnotifications';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { HomepageDeployConfiguration } from '../stack/reamplifyHomepage';
import { CommonConfiguration } from '../stack/reamplifyEnvironment';
import { Cache, LocalCacheMode } from 'aws-cdk-lib/aws-codebuild';

interface HomepagePipelineProps extends HomepageDeployConfiguration {
  workspace: string;
  env: {
    region: string;
    account: string;
  };
}

export class HomepagePipeline extends Construct {
  constructor(scope: Construct, id: string, props: cdk.StackProps & CommonConfiguration & HomepagePipelineProps) {
    super(scope, id);

    Tags.of(this).add('construct', 'HomepagePipeline');
    if (!props.deploy.enable) {
      return;
    }
    const artifactBucket = new Bucket(this, 'ArtifactBucket', {
      bucketName: `artifacts.${props.workspace}.${props.env.region}.${props.env.account}.${props.appName}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `${props.appName}.${props.workspace}.Homepage.Deploy`,
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

    const src = new codepipeline.Artifact(`${props.appName}-${props.workspace}-source`);
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
      const approvalStage = pipeline.addStage({ stageName: 'Approval' });
      approvalStage.addAction(
        new ManualApprovalAction({ actionName: 'ManualApproval', notifyEmails: ['thomas@resilientsoftware.co.uk'] })
      );
    }
    pipeline.addStage({ stageName: 'Build' });
    pipeline.addStage({ stageName: 'Deploy' });
    pipeline.addStage({ stageName: 'PostDeploy' });
    const frontendBucketRef = s3.Bucket.fromBucketName(this, 'homepageBucket', frontendBucketName(props));

    const distributionId = ssm.StringParameter.fromStringParameterName(
      this,
      'DistributionIdSSM',
      `/${props.appName}/${props.workspace}/CloudfrontDistributionId`
    ).stringValue;

    const pipelineName = `${props.appName}-${props.workspace}-Homepage-Pipeline`;
    const builder = new codebuild.PipelineProject(this, 'HomepageBuilder', {
      projectName: `${props.appName}-${props.workspace}-Homepage-Build`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      cache: Cache.local(LocalCacheMode.SOURCE),
      environmentVariables: {
        AWS_ACCOUNT_ID: {
          value: props.env!.account!,
        },
        BUCKET_NAME: {
          value: frontendBucketRef.bucketName,
        },
        PIPELINE_NAME: {
          value: pipelineName,
        },
        CLOUDFRONT_DISTRIBUTION_ID: {
          value: distributionId,
        },
        GENERATE_SOURCEMAP: {
          value: 'false',
        },
        NODE_OPTIONS: {
          value: '--max-old-space-size=1536',
        },
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('packages/homepage/buildspec.yml'),
    });
    builder.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds')
    );
    if (builder.role) {
      frontendBucketRef.grantReadWrite(builder.role);
    }
    builder.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudfront:CreateInvalidation',
          'cloudfront:GetDistribution',
          'cloudfront:GetStreamingDistribution',
          'cloudfront:GetDistributionConfig',
          'cloudfront:GetInvalidation',
          'cloudfront:ListInvalidations',
          'cloudfront:ListStreamingDistributions',
          'cloudfront:ListDistributions',
        ],
        resources: ['*'],
      })
    );

    pipeline.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds')
    );

    const outputBuild = new codepipeline.Artifact('OutputBuild');
    pipeline.stage('Build').addAction(
      new pipelineactions.CodeBuildAction({
        actionName: 'Build',
        project: builder,
        input: src,
        outputs: [outputBuild],
        runOrder: 1,
      })
    );

    const s3SyncCodebuild = new codebuild.PipelineProject(this, 'S3Sync', {
      projectName: `${props.appName}-${props.workspace}-S3Sync`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          post_build: {
            commands: [
              // Better solution to this: do deploy in the same stage as build, in an actiongroup to ensure we go in order
              // This solution instead this minimizes the time where s3 is invalid (i.e. out of sync index.html / static files)
              // It's necessary because of the frontend build cache..
              // by 1) Pushing only items with different sizes (based on file-size diff). Unlikely to ever be invalid.
              `aws s3 sync . s3://${frontendBucketRef.bucketName} --size-only`,
              // by 2) Push all other items (based on file timestamp diff). Very short time invalid
              `aws s3 sync . s3://${frontendBucketRef.bucketName}`,
              // by 3) Delete old items. Never invalid
              `aws s3 sync --delete . s3://${frontendBucketRef.bucketName}`,
            ],
          },
        },
      }),
    });
    s3SyncCodebuild.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds')
    );
    if (s3SyncCodebuild.role) {
      frontendBucketRef.grantReadWrite(s3SyncCodebuild.role);
    }

    pipeline.stage('Deploy').addAction(
      new pipelineactions.CodeBuildAction({
        actionName: 'DeployToS3',
        project: s3SyncCodebuild,
        input: outputBuild,
        runOrder: 1,
      })
    );

    let postDeployFunc = new Function(this, 'CDNInvalidationFunc', {
      handler: 'index.handler',
      runtime: Runtime.NODEJS_12_X,
      functionName: reamplifyLambdas['deploy/frontendPostDeploy.ts'].name(props),
      code: Code.fromAsset(path.dirname(reamplifyLambdas['deploy/frontendPostDeploy.ts'].output)),
      timeout: Duration.seconds(120),
      memorySize: 1024,
      environment: {
        CLOUDFRONT_DISTRIBUTION_ID: distributionId,
        FRONTEND_BUCKET: frontendBucketRef.bucketName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    postDeployFunc.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:aws:cloudfront::${props.env?.account}:distribution/${distributionId}`],
      })
    );
    postDeployFunc.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['codepipeline:PutJobSuccessResult', 'codepipeline:PutJobFailureResult'],
        resources: ['*'],
      })
    );

    postDeployFunc.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:List*', 's3:Get*', 's3:Put*', 's3:Delete*'],
        resources: [frontendBucketRef.bucketArn, frontendBucketRef.bucketArn + '/*'],
      })
    );
    postDeployFunc.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:List*', 's3:Get*', 's3:Put*'],
        resources: [pipeline.artifactBucket.bucketArn, pipeline.artifactBucket.bucketArn + '/*'],
      })
    );
    if (pipeline.artifactBucket.encryptionKey) {
      postDeployFunc.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
          resources: [pipeline.artifactBucket.encryptionKey?.keyArn],
        })
      );
    }

    pipeline.stage('PostDeploy').addAction(
      new pipelineactions.LambdaInvokeAction({
        actionName: 'InvalidateCloudfront',
        inputs: [outputBuild],
        lambda: postDeployFunc,
        runOrder: 1,
      })
    );
  }
}
