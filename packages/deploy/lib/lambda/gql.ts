import { assertEnvOrSSM } from './env';
import * as https from 'https';
import { URL } from 'url';
import { gqlResponseToModel } from '@reamplify/schema/lib/partialTypes';
import logger from './logger';

const AWS = require('aws-sdk');

const aws_appsync_graphqlEndpointP = assertEnvOrSSM('aws_appsync_graphqlEndpoint');
const aws_appsync_regionP = assertEnvOrSSM('aws_appsync_region');

const invoke = async (body: any): Promise<any> => {
  const [aws_appsync_graphqlEndpoint, aws_appsync_region] = await Promise.all([
    aws_appsync_graphqlEndpointP,
    aws_appsync_regionP,
  ]);

  const req = new AWS.HttpRequest(aws_appsync_graphqlEndpoint, aws_appsync_region);
  const endpoint = new URL(aws_appsync_graphqlEndpoint).hostname.toString();

  req.method = 'POST';
  req.path = '/graphql';
  req.headers.host = endpoint;
  req.headers['Content-Type'] = 'application/json';
  req.body = JSON.stringify(body);
  const signer = new AWS.Signers.V4(req, 'appsync', true);
  signer.addAuthorization(AWS.config.credentials, AWS.util.date.getDate());

  return new Promise((resolve, reject) => {
    const httpRequest = https.request({ ...req, host: endpoint }, (result) => {
      let data = '';

      result.on('data', (chunk) => {
        data += chunk;
      });
      result.on('error', (e) => {
        reject(e);
      });

      result.on('end', () => {
        try {
          if (result.statusCode < 200 || result.statusCode >= 400) {
            throw new Error(`unexpected response code ${result.statusCode}: ${data.toString()}`);
          }
          const respBody = JSON.parse(data.toString());
          resolve(respBody);
        } catch (e) {
          reject(e);
        }
      });
    });

    httpRequest.write(req.body);
    httpRequest.end();
  });
};

export async function apiAssert<T, J>(operation: {
  query?: string;
  mutation?: string;
  variables: J;
  key: string;
  verbose?: boolean;
}): Promise<T> {
  const result = await api<T, J>(operation);
  if (!result) {
    throw new Error(`expected response to ${operation.key}.`);
  }
  return result;
}
export async function api<T, J>(operation: {
  query?: string;
  mutation?: string;
  variables: J;
  key: string;
  verbose?: boolean;
}): Promise<T | null> {
  const key = operation.key;
  const results = await apiWithErrors<T, J>(operation);
  if (results.errors && results.errors.length) {
    throw new Error(`${key} failed with error: ${results.errors.map((e) => JSON.stringify(e)).join(' ')}`);
  }
  return results.data;
}

export async function apiWithErrors<T, J>(operation: {
  query?: string;
  mutation?: string;
  variables: J;
  key: string;
  verbose?: boolean;
}): Promise<{ data: T | null; errors?: any[] }> {
  let state: 'query' | 'mutation';
  if (operation.query) {
    state = 'query';
  } else if (operation.mutation) {
    state = 'mutation';
  } else {
    throw new Error(`Invalid api request ${JSON.stringify(operation)}`);
  }
  const key = operation.key;
  const t1 = new Date();
  try {
    let results;
    if (operation.verbose) {
      logger.log(
        state,
        key,
        `invoke operation=${JSON.stringify(
          state === 'query' ? operation.query : operation.mutation
        )} variables=${JSON.stringify(operation.variables)}`
      );
    }
    if (state === 'query') {
      results = await invoke({
        query: operation.query,
        variables: {
          ...operation.variables,
        },
      });
    } else {
      results = await invoke({
        query: operation.mutation,
        variables: {
          ...operation.variables,
        },
      });
    }
    const t2 = new Date();
    if (operation.verbose) {
      logger.log(state, key, 'responded in', t2.valueOf() - t1.valueOf(), 'ms with ', JSON.stringify(results));
    }
    if (!results.data[key]) {
      if (results.errors && results.errors.length === 1 && results.errors[0].data) {
        const flattened = gqlResponseToModel<T>(results.errors[0].data);

        return {
          data: flattened,
          errors: results.errors,
        };
      }
      return {
        data: null,
        errors: results.errors,
      };
    }
    let nextToken: string | undefined = results.data[key].nextToken;
    while (results.data[key] && nextToken && state === 'query') {
      logger.log('WARNING -- nextToken returned as a response to', key);
      const nextResults = await invoke({
        query: operation.query,
        variables: {
          ...operation.variables,
          nextToken,
        },
      });
      nextToken = nextResults.data[key].nextToken;
      results.data[key].items = results.data[key].items.concat(nextResults.data[key].items);
      results.errors.push(...nextResults.errors);
    }
    const flattened = gqlResponseToModel<T>(results.data[key]);

    return {
      data: flattened,
      errors: results.errors,
    };
  } catch (e) {
    const t2 = new Date();
    logger.error('query', key, 'failed in ', t2.valueOf() - t1.valueOf(), 'ms', e);
    throw e;
  }
}
