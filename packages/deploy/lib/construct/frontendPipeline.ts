import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy, Tags } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import * as pipelineactions from 'aws-cdk-lib/aws-codepipeline-actions';
import { frontendBucketName } from '../stack/reamplifyGlobalStaticFrontend';
import { DeployConfiguration, PwProtect } from '../stack/reamplifyEnvironment';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { reamplifyLambdas } from '../lambda';
import * as path from 'path';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';

interface FrontendPipelineProps extends DeployConfiguration {
  workspace: string;
  deployConfig: string;
  ci?: { pipeline: Pipeline; src: Artifact };
  env: { account: string; region: string };
}

export class FrontendPipeline extends Construct {
  constructor(scope: Construct, id: string, props: cdk.StackProps & FrontendPipelineProps & PwProtect) {
    super(scope, id);

    Tags.of(this).add('construct', 'FrontendPipeline');
    const { ci } = props;
    if (!ci) {
      return;
    }
    const { pipeline, src } = ci;

    const frontendBucketRef = Bucket.fromBucketName(this, 'FrontendCodeBucket', frontendBucketName(props));

    const pipelineName = `${props.appName}-${props.workspace}-Frontend-Pipeline`;
    const builder = new codebuild.PipelineProject(this, 'FrontendBuilder', {
      projectName: `${props.appName}-${props.workspace}-Frontend-Build`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        computeType: ComputeType.MEDIUM,
      },
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
        DEPLOY_CONFIG: {
          value: props.deployConfig,
        },
        GENERATE_SOURCEMAP: {
          value: props.passwordProtect ? 'true' : 'false',
        },
        NODE_OPTIONS: {
          value: `--max_old_space_size=4096`,
        },
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('packages/webapp/buildspec.yml'),
    });

    builder.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds')
    );
    if (builder.role) {
      frontendBucketRef.grantReadWrite(builder.role);
    }
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
    // pipeline.role.iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role'))
    // pipeline.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeDeployFullAccess'))
    // pipeline.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeBuildAdminAccess'))
    // pipeline.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodePipelineFullAccess'))
    pipeline.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds')
    );

    const outputBuild = new codepipeline.Artifact('OutputBuild');
    pipeline.stage(props.workspace + '.Build').addAction(
      new pipelineactions.CodeBuildAction({
        actionName: 'Build',
        project: builder,
        input: src,
        outputs: [outputBuild],
        runOrder: 1,
      })
    );
    pipeline.stage(props.workspace + '.Deploy').addAction(
      new pipelineactions.CodeBuildAction({
        actionName: 'DeployToS3',
        project: s3SyncCodebuild,
        input: outputBuild,
        runOrder: 1,
      })
    );

    const distributionId = ssm.StringParameter.fromStringParameterName(
      this,
      'DistributionIdSSM',
      `/${props.appName}/${props.workspace}/CloudfrontDistributionId`
    ).stringValue;

    let postDeployFunc = new Function(this, 'CDNInvalidationFunc', {
      handler: 'index.handler',
      functionName: reamplifyLambdas['deploy/frontendPostDeploy.ts'].name(props),
      runtime: Runtime.NODEJS_12_X,
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
    pipeline.stage(props.workspace + '.PostDeploy').addAction(
      new pipelineactions.LambdaInvokeAction({
        actionName: 'InvalidateCloudfront',
        inputs: [outputBuild],
        lambda: postDeployFunc,
        runOrder: 1,
      })
    );
  }
}
