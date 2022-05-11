import { GraphQLTransform } from '@aws-amplify/graphql-transformer-core';
import { ModelTransformer } from '@aws-amplify/graphql-model-transformer';
import { AuthTransformer } from '@aws-amplify/graphql-auth-transformer';
import { FunctionTransformer } from '@aws-amplify/graphql-function-transformer';
import { HttpTransformer } from '@aws-amplify/graphql-http-transformer';
import { IndexTransformer, PrimaryKeyTransformer } from '@aws-amplify/graphql-index-transformer';
import {
  BelongsToTransformer,
  HasManyTransformer,
  HasOneTransformer,
  ManyToManyTransformer,
} from '@aws-amplify/graphql-relational-transformer';
import { DefaultValueTransformer } from '@aws-amplify/graphql-default-value-transformer';
import { TransformerPluginProvider } from '@aws-amplify/graphql-transformer-interfaces';
import { GraphQLTransformOptions } from '@aws-amplify/graphql-transformer-core/lib/transformation/transform';

export const featureFlagProviderStub = {
  getBoolean: () => true,
  getString: () => '',
  getNumber: () => 0,
  getObject: () => ({}),
};

export const v2transformerProvider = (): GraphQLTransform => {
  return new GraphQLTransform(getTransformerConfig());
};

export default function getTransformerConfig(): GraphQLTransformOptions {
  const modelTransformer = new ModelTransformer();
  const indexTransformer = new IndexTransformer();
  const hasOneTransformer = new HasOneTransformer();
  const authTransformer = new AuthTransformer({
    adminRoles: [''],
    authConfig: {
      defaultAuthentication: {
        authenticationType: 'AMAZON_COGNITO_USER_POOLS',
      },
      additionalAuthenticationProviders: [
        {
          authenticationType: 'AWS_IAM',
        },
      ],
    },
  });
  const transformerList: TransformerPluginProvider[] = [
    modelTransformer,
    new FunctionTransformer(),
    new HttpTransformer(),
    new PrimaryKeyTransformer(),
    indexTransformer,
    new BelongsToTransformer(),
    new HasManyTransformer(),
    hasOneTransformer,
    new ManyToManyTransformer(modelTransformer, indexTransformer, hasOneTransformer, authTransformer),
    new DefaultValueTransformer(),
    authTransformer,
  ];

  return {
    transformers: transformerList,
    authConfig: {
      defaultAuthentication: {
        authenticationType: 'AMAZON_COGNITO_USER_POOLS',
      } as const,
      additionalAuthenticationProviders: [
        {
          authenticationType: 'AWS_IAM',
        } as const,
      ],
    },
    sandboxModeEnabled: false,
    featureFlags: featureFlagProviderStub,
  };
}
export const NONE_DS_NAME = '__NONE_DS__';
