import { Construct } from 'constructs';
import { Stack, Tags } from 'aws-cdk-lib';
import { ReamplifyUserPool, SSODeployConfiguration } from '../construct/userPool';
import { HostedZoneAttributes } from 'aws-cdk-lib/aws-route53/lib/hosted-zone-ref';
import { UserS3DataStack } from './userS3DataStack';
import * as cdk from 'aws-cdk-lib';
import { CommonConfiguration } from './reamplifyEnvironment';

export interface UserPoolConfiguration extends cdk.StackProps {
  hostedZone: HostedZoneAttributes;
  assets: UserS3DataStack;
}

export class UserPoolStack extends Stack {
  public readonly reamplifyUserPool: ReamplifyUserPool;
  public readonly config: SSODeployConfiguration & UserPoolConfiguration & CommonConfiguration;

  constructor(
    scope: Construct,
    id: string,
    props: SSODeployConfiguration & UserPoolConfiguration & CommonConfiguration
  ) {
    super(scope, id, props);
    this.config = props;
    Tags.of(this).add('stack', 'ReamplifyUserPool');
    Tags.of(this).add('workspace', props.workspace);
    this.reamplifyUserPool = new ReamplifyUserPool(this, 'ReamplifyUserPool', props);
  }
}
