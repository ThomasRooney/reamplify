import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
export interface LambdaProps {
  workspace: string;
  appName: string;
  AuthUsername: string;
  AuthPassword: string;
}

export class CloudfrontS3WebsiteFunction extends cloudfront.Function {
  constructor(scope: Construct, id: string, props: LambdaProps) {
    super(scope, id, {
      code: cloudfront.FunctionCode.fromInline(`
      function b2a(a) {
          var c, d, e, f, g, h, i, j, o, b = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=", k = 0, l = 0, m = "", n = [];
          if (!a) return a;
          do c = a.charCodeAt(k++), d = a.charCodeAt(k++), e = a.charCodeAt(k++), j = c << 16 | d << 8 | e, 
          f = 63 & j >> 18, g = 63 & j >> 12, h = 63 & j >> 6, i = 63 & j, n[l++] = b.charAt(f) + b.charAt(g) + b.charAt(h) + b.charAt(i); while (k < a.length);
          return m = n.join(""), o = a.length % 3, (o ? m.slice(0, o - 3) :m) + "===".slice(o || 3);
      }
      function handler(event) {
          var request = event.request;
          var uri = request.uri;
          var headers = request.headers;
          var authUser = '${props.AuthUsername}';
          var authPass = '${props.AuthPassword}';

          if (authUser && authPass && (typeof headers.authorization == 'undefined' || headers.authorization.value != 'Basic ' + b2a(authUser + ':' + authPass))) {
            return {
              statusCode: 401,
              statusDescription: 'Unauthorized',
              headers: {
                  'www-authenticate': {value:'Basic'}
              },
            }
          }
          if (uri.endsWith('/')) {
            request.uri += 'index.html';
          } else if (!uri.includes('.')) {
            request.uri += '/index.html';
          }

          return request
      }`),
      functionName: `${props.appName}-${props.workspace}-BasicAuthLambda`,
      comment: `Username: ${props.AuthUsername} Password: ${props.AuthPassword}`,
    });
  }
}
