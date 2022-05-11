import type { PreAuthenticationTriggerHandler } from 'aws-lambda';

export const handler: PreAuthenticationTriggerHandler = async (event) => {
  console.log('event', event);
  throw new Error('Down for maintainence');
};
