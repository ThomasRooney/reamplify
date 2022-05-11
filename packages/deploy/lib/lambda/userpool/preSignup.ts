import type { PreSignUpTriggerEvent, PreSignUpTriggerHandler } from 'aws-lambda';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import logger from '../logger';

const providers = process.env.PROVIDERS?.split(',') || [];

type nextAction = 'CREATE' | 'CREATE_AUTO_VERIFY';

const handleSSOUsers = async (event: PreSignUpTriggerEvent): Promise<nextAction> => {
  const { userPoolId, userName } = event;
  const { email } = event.request.userAttributes;
  const [provider, providerValue] = userName.split('_');
  logger.log('tryMergeUserAccounts', userPoolId, providers, userName, email);

  const newUserProvider = providers.find((p) => p.toLowerCase() === provider.toLowerCase());
  const isFederated = newUserProvider && providerValue;

  const cognito = new CognitoIdentityServiceProvider();
  const { Users } = await cognito
    .listUsers({
      UserPoolId: userPoolId,
      AttributesToGet: ['email'],
      Filter: `email = "${email}"`,
    })
    .promise();

  // merge social provider with existing cognito user by email
  if (isFederated) {
    if (!Users || Users.length === 0) {
      return 'CREATE_AUTO_VERIFY';
    }

    for (const user of Users) {
      logger.log('merge user', user.Username, 'with', userName);
      await cognito
        .adminLinkProviderForUser({
          UserPoolId: userPoolId,
          DestinationUser: {
            ProviderName: 'Cognito',
            ProviderAttributeValue: user.Username,
          },
          SourceUser: {
            ProviderName: newUserProvider,
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: providerValue,
          },
        })
        .promise();
    }

    throw new Error(
      'User account already exists. Merging your new social sign in with the previous account. Please try again.'
    );
  } else if (Number(Users?.length) >= 1) {
    throw new Error('User account already exists. Please login using an associated social account');
  }

  return 'CREATE';
};

export const handler: PreSignUpTriggerHandler = async (event) => {
  logger.log('PreSignup event=', JSON.stringify(event));
  const result = await handleSSOUsers(event);
  logger.log('handleSSOUsers returned', result);

  if (result === 'CREATE_AUTO_VERIFY') {
    event.response.autoConfirmUser = true;
    // Set the email as verified if it is in the request
    if (event.request.userAttributes.hasOwnProperty('email')) {
      event.response.autoVerifyEmail = true;
    }

    // Set the phone number as verified if it is in the request
    if (event.request.userAttributes.hasOwnProperty('phone_number')) {
      event.response.autoVerifyPhone = true;
    }
  }

  return event;
};
