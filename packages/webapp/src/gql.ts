import { API, GraphQLResult } from '@aws-amplify/api';
import tag from 'graphql-tag';
import { FieldNode, OperationDefinitionNode } from 'graphql/language/ast';
import { gqlResponseToModel } from '@reamplify/schema/lib/partialTypes';

export async function gql<T extends object, J>(
  query: string,
  variables?: Omit<J, 'owner'>,
  additionalHeaders?: {
    [key: string]: string;
  }
): Promise<T | T[]> {
  const taggedQuery = tag(query);
  const operation = taggedQuery.definitions?.[0] as OperationDefinitionNode;
  const isInput = operation?.variableDefinitions?.[0]?.variable?.name?.value === 'input';
  const key: string | undefined = (operation.selectionSet?.selections?.[0] as FieldNode | undefined)?.name?.value;
  if (!key) {
    throw new Error('cannot find response key');
  }

  const q: Promise<GraphQLResult<any>> = API.graphql(
    {
      query,
      variables: variables && isInput && !(variables as any).input ? { input: variables } : variables,
    },
    additionalHeaders
  );
  const results = await q;
  if (!results.data || !results.data[key]) {
    throw new Error('missing graphql response');
  }
  let nextToken: string | undefined = results.data[key].nextToken;
  while (results.data[key] && results.data[key].nextToken) {
    const nextResults = await API.graphql(
      {
        query,
        variables: {
          ...variables,
          nextToken,
        },
      },
      additionalHeaders
    );
    if (!nextResults || !nextResults.data || !nextResults.data[key]) {
      break;
    }
    results.data[key].nextToken = nextResults.data[key].nextToken;
    results.data[key].items = results.data[key].items.concat(nextResults.data[key].items);
  }
  return gqlResponseToModel<T>(results.data[key]);
}

export function gqlErrToString(err: any): string {
  return err?.message || err?.errors?.[0]?.message || JSON.stringify(err);
}
