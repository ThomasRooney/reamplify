import * as cdk from 'aws-cdk-lib';

export function generateSesPolicyForCustomResource(...methods: string[]): cdk.custom_resources.AwsCustomResourcePolicy {
  // for some reason the default policy is generated as `email:<method>` which does not work -> hence we need to provide our own
  return cdk.custom_resources.AwsCustomResourcePolicy.fromStatements([
    new cdk.aws_iam.PolicyStatement({
      actions: methods.map((method) => `ses:` + method),
      effect: cdk.aws_iam.Effect.ALLOW,
      // PolicySim says ses:SetActiveReceiptRuleSet does not allow specifying a resource, hence use '*'
      resources: [`*`],
    }),
  ]);
}
