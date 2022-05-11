/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { generateSesPolicyForCustomResource } from './helper';

export type NotificationType = 'Bounce' | 'Complaint' | 'Delivery';

export interface IVerifySesDomainProps {
  /**
   * A domain name to be used for the SES domain identity, e.g. 'sub-domain.example.org'
   */
  readonly domainName: string;
  /**
   * A hostedZone name to be matched with Route 53 record. e.g. 'example.org'
   * @default same as domainName
   */
  readonly hostedZoneName?: string;
  /**
   * Whether to automatically add a TXT record to the hosed zone of your domain. This only works if your domain is managed by Route53. Otherwise disable it.
   * @default true
   */
  readonly addTxtRecord?: boolean;
  /**
   * Whether to automatically add a MX record to the hosted zone of your domain. This only works if your domain is managed by Route53. Otherwise disable it.
   * @default true
   */
  readonly addMxRecord?: boolean;
  /**
   * Whether to automatically add DKIM records to the hosted zone of your domain. This only works if your domain is managed by Route53. Otherwise disable it.
   * @default true
   */
  readonly addDkimRecords?: boolean;
  /**
   * An SNS topic where bounces, complaints or delivery notifications can be sent to. If none is provided, a new topic will be created and used for all different notification types.
   * @default new topic will be created
   */
  readonly notificationTopic?: cdk.aws_sns.Topic;
  /**
   * Select for which notification types you want to configure a topic.
   * @default [Bounce, Complaint]
   */
  readonly notificationTypes?: NotificationType[];
  readonly region?: string;
}

/**
 * A construct to verify a SES domain identity. It initiates a domain verification and can automatically create appropriate records in Route53 to verify the domain. Also, it's possible to attach a notification topic for bounces, complaints or delivery notifications.
 *
 * @example
 *
 * new VerifySesDomain(this, 'SesDomainVerification', {
 *   domainName: 'example.org'
 * });
 *
 */
export class VerifySesDomain extends Construct {
  private region?: string;
  public readonly domainName: string;
  // public readonly topic: cdk.aws_sns.Topic;
  constructor(parent: Construct, name: string, props: IVerifySesDomainProps) {
    super(parent, name);

    this.region = props.region;
    const domainName = props.domainName;
    this.domainName = domainName;
    const verifyDomainIdentity = this.verifyDomainIdentity(domainName);
    // we currently dont use sns topic for these notifications, and rely on email for complaints/bounces. This is adequate for now.

    // const topic = this.createTopicOrUseExisting(domainName, verifyDomainIdentity, props.notificationTopic);
    // this.topic = topic;
    // this.addTopicToDomainIdentity(domainName, topic, props.notificationTypes);

    const hostedZoneName = props.hostedZoneName ? props.hostedZoneName : domainName;
    const zone = this.getHostedZone(hostedZoneName);

    if (isTrueOrUndefined(props.addTxtRecord)) {
      const txtRecord = this.createTxtRecordLinkingToSes(zone, domainName, verifyDomainIdentity);
      txtRecord.node.addDependency(verifyDomainIdentity);
    }

    if (isTrueOrUndefined(props.addMxRecord)) {
      const mxRecord = this.createMxRecord(zone, domainName);
      mxRecord.node.addDependency(verifyDomainIdentity);
    }

    if (isTrueOrUndefined(props.addDkimRecords)) {
      const verifyDomainDkim = this.initDkimVerification(domainName);
      verifyDomainDkim.node.addDependency(verifyDomainIdentity);
      this.addDkimRecords(verifyDomainDkim, zone, domainName);
    }
  }

  private verifyDomainIdentity(domainName: string): cdk.custom_resources.AwsCustomResource {
    return new cdk.custom_resources.AwsCustomResource(this, `VerifyDomainIdentity`, {
      onCreate: {
        service: `SES`,
        action: `verifyDomainIdentity`,
        parameters: {
          Domain: domainName,
        },
        region: this.region,
        physicalResourceId: cdk.custom_resources.PhysicalResourceId.fromResponse(`VerificationToken`),
      },
      onUpdate: {
        service: `SES`,
        action: `verifyDomainIdentity`,
        parameters: {
          Domain: domainName,
        },
        region: this.region,
        physicalResourceId: cdk.custom_resources.PhysicalResourceId.fromResponse(`VerificationToken`),
      },
      onDelete: {
        service: `SES`,
        action: `deleteIdentity`,
        parameters: {
          Identity: domainName,
        },
        region: this.region,
      },
      policy: generateSesPolicyForCustomResource(`VerifyDomainIdentity`, `DeleteIdentity`),
    });
  }

  getHostedZone(domainName: string): cdk.aws_route53.IHostedZone {
    return cdk.aws_route53.HostedZone.fromLookup(this, `Zone`, {
      domainName: domainName,
    });
  }

  private createTxtRecordLinkingToSes(
    zone: cdk.aws_route53.IHostedZone,
    domainName: string,
    verifyDomainIdentity: cdk.custom_resources.AwsCustomResource
  ) {
    return new cdk.aws_route53.TxtRecord(this, `SesVerificationRecord`, {
      zone,
      recordName: `_amazonses.${domainName}`,
      values: [verifyDomainIdentity.getResponseField(`VerificationToken`)],
    });
  }

  private createMxRecord(zone: cdk.aws_route53.IHostedZone, domainName: string) {
    return new cdk.aws_route53.MxRecord(this, `SesMxRecord`, {
      zone,
      recordName: domainName,
      values: [
        {
          hostName: cdk.Fn.sub(`inbound-smtp.${cdk.cx_api.EnvironmentPlaceholders.CURRENT_REGION}.amazonaws.com`),
          priority: 10,
        },
      ],
    });
  }

  private initDkimVerification(domainName: string) {
    return new cdk.custom_resources.AwsCustomResource(this, `VerifyDomainDkim`, {
      onCreate: {
        service: `SES`,
        action: `verifyDomainDkim`,
        parameters: {
          Domain: domainName,
        },
        region: this.region,
        physicalResourceId: cdk.custom_resources.PhysicalResourceId.of(domainName + `-verify-domain-dkim`),
      },
      policy: generateSesPolicyForCustomResource(`VerifyDomainDkim`),
    });
  }

  private addDkimRecords(
    verifyDomainDkim: cdk.custom_resources.AwsCustomResource,
    zone: cdk.aws_route53.IHostedZone,
    domainName: string
  ) {
    [0, 1, 2].forEach((val) => {
      const dkimToken = verifyDomainDkim.getResponseField(`DkimTokens.${val}`);
      const cnameRecord = new cdk.aws_route53.CnameRecord(this, `SesDkimVerificationRecord` + val, {
        zone,
        recordName: `${dkimToken}._domainkey.${domainName}`,
        domainName: `${dkimToken}.dkim.amazonses.com`,
      });
      cnameRecord.node.addDependency(verifyDomainDkim);
    });
  }
}

function isTrueOrUndefined(prop?: boolean): boolean {
  return prop === undefined || prop;
}
