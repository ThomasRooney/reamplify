import * as cdk from 'aws-cdk-lib';
import { Stack, Tags } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BlockPublicAccess, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { CommonConfiguration } from './reamplifyEnvironment';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class UserS3DataStack extends Stack {
  public readonly userBucket: s3.Bucket;
  public readonly userBucketName: string;
  props: cdk.StackProps & CommonConfiguration;

  constructor(scope: Construct, id: string, props: cdk.StackProps & CommonConfiguration) {
    super(scope, id, props);
    this.props = props;
    Tags.of(this).add('stack', 'UserS3DataStack');
    this.userBucketName = `user.${props.workspace}.${props.env.account}.${props.env.region}.${props.appName}`;

    this.userBucket = new s3.Bucket(this, 'user-storage', {
      bucketName: this.userBucketName,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });
    this.userBucket.applyRemovalPolicy(props.stateAssetRemovalPolicy);
    this.userBucket.addCorsRule({
      allowedHeaders: ['*'],
      allowedMethods: [HttpMethods.GET, HttpMethods.HEAD, HttpMethods.PUT, HttpMethods.POST, HttpMethods.DELETE],
      allowedOrigins: ['*'],
      exposedHeaders: ['x-amz-server-side-encryption', 'x-amz-request-id', 'x-amz-id-2', 'ETag'],
      id: 'S3CORSRuleId1',
      maxAge: 3000,
    });

    this.store('aws_user_files_s3_bucket', this.userBucket.bucketName);
    this.store('aws_user_files_s3_bucket_region', this.userBucket.env.region);
  }

  private store(id: string, value: string): void {
    new ssm.StringParameter(this, id, {
      parameterName: `/${this.props.appName}/${this.props.workspace}/${id}`,
      stringValue: value,
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
