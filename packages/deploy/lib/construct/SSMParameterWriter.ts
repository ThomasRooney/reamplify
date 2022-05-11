import { AwsCustomResource, AwsCustomResourcePolicy, AwsSdkCall } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

interface SSMParameterWriterProps {
  parameterName: string;
  stringValue: string;
  region: string;
}

export class SSMParameterWriter extends AwsCustomResource {
  constructor(scope: Construct, name: string, props: SSMParameterWriterProps) {
    const { parameterName, stringValue, region } = props;

    const ssmAwsSdkCall: AwsSdkCall = {
      service: 'SSM',
      action: 'putParameter',
      parameters: {
        Name: parameterName,
        Value: stringValue,
        Overwrite: true,
        DataType: 'text',
        Tier: 'Standard',
        Type: 'String',
      },
      region,
      physicalResourceId: PhysicalResourceId.of(parameterName + ' ' + stringValue),
    };

    super(scope, name, {
      onCreate: ssmAwsSdkCall,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }
}
