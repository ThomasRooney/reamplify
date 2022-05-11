import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as r53 from 'aws-cdk-lib/aws-route53';
import { HostedZoneAttributes } from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { CloudfrontS3WebsiteFunction } from '../construct/basicAuthEdgeLambda';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { SSMParameterWriter } from '../construct/SSMParameterWriter';

export interface StaticSiteProps {
  siteDomain: string;
  workspace: string;
  appName: string;
  hostedZone: HostedZoneAttributes;
  passwordProtect?: { pw: string; user: string };
  live: boolean;
  addWWW?: boolean;
  appRegion: string;
  env: {
    region: 'us-east-1';
  };
}

export const frontendBucketName = (props: { workspace: string }) => `web.${props.workspace}.us-east-1.reamplify.io`;

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class ReamplifyGlobalStaticFrontend extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & StaticSiteProps) {
    super(scope, id, {
      ...props,
    });
    Tags.of(this).add('stack', 'FrontendStaticSiteGlobal');
    Tags.of(this).add('workspace', props.workspace);

    const frontendBucket = new s3.Bucket(this, 'web', {
      bucketName: frontendBucketName(props),
      websiteIndexDocument: 'index.html',
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });
    // Can be regenerated, hence this bucket is destroyable
    frontendBucket.applyRemovalPolicy(RemovalPolicy.DESTROY);
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, `OriginAccessIdentity`, {
      comment: 'Allows cloudfront to reach ' + frontendBucket.bucketName,
    });

    frontendBucket.grantRead(originAccessIdentity, '*');

    const zone = r53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', props.hostedZone);

    // TLS certificates
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.siteDomain,
      subjectAlternativeNames: [`*.${props.siteDomain}`],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    new SSMParameterWriter(this, 'CertificateArnSSMWriter', {
      parameterName: `/${props.appName}/${props.workspace}/CertificateArn`,
      stringValue: certificate.certificateArn,
      region: props.appRegion,
    });

    new SSMParameterWriter(this, 'FrontendBucketNameSSMWriter', {
      parameterName: `/${props.appName}/${props.workspace}/FrontendBucketName`,
      stringValue: frontendBucket.bucketName,
      region: props.appRegion,
    });

    let cloudfrontFunctions: cloudfront.FunctionAssociation[] = [];
    cloudfrontFunctions.push({
      function: new CloudfrontS3WebsiteFunction(this, 'BasicAuthCloudfrontFunction', {
        workspace: props.workspace,
        appName: props.appName,
        AuthUsername: props.passwordProtect?.user || '',
        AuthPassword: props.passwordProtect?.pw || '',
      }),
      eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
    });

    const frontendBucketRef = s3.Bucket.fromBucketArn(this, 'FrontendBucket', frontendBucket.bucketArn);

    // Route53 alias record for the CloudFront distribution
    const distribution = new cloudfront.Distribution(this, props.siteDomain, {
      certificate: props.live ? certificate : undefined,
      domainNames: props.live ? [props.siteDomain, ...(props.addWWW ? ['www.' + props.siteDomain] : [])] : [],
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucketRef, {
          originAccessIdentity,
        }),
        functionAssociations: cloudfrontFunctions,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: [{ httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' }],
    });

    new SSMParameterWriter(this, 'CloudfrontDistributionIdSSMWriter', {
      parameterName: `/${props.appName}/${props.workspace}/CloudfrontDistributionId`,
      stringValue: distribution.distributionId,
      region: props.appRegion,
    });

    distribution.node.addDependency(certificate);
    if (props.live) {
      new r53.ARecord(this, `${props.workspace}-r53-raw-to-cloudfront`, {
        recordName: props.siteDomain,
        target: r53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        zone,
      });
      if (props.addWWW) {
        new r53.ARecord(this, `${props.workspace}-r53-www-to-cloudfront`, {
          recordName: 'www.' + props.siteDomain,
          target: r53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
          zone,
        });
      }
    }
  }
}
