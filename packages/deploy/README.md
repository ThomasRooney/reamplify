# Re-amplify CDK Design Decisions

1) No nested stacks

The "No nested stacks" decision comes from a desire for high maintainability, visibility, and debuggability of CDK applications.

**Maintainability**. By not using nested stacks, resources can be more easily refactored, as the number of stateful resources in each stack is lower. This also forcing the coupling between stacks to be looser. This looser coupling naturally reduces issues like circular dependencies -- if it's already created than it implicitly cannot be circular.

It also means resources deploy faster, as a change affecting only one stack will only cause 1 stack to update. Similarly during development iteration an explicit stack can be passed in for a given changeset.

**Visibility**

If the stacks are deployed via CLI, all stack changes are propagated to the console. If the stack is deployed via a pipeline, 1 stage will map to 1 stack, reducing the amount of resources to understand for any deployment issues.

**Debuggability**

When something goes wrong, using a layer cake approach  minimizes the amount of components to look at when analyzing a fix.

**Trade Off** If multiple stacks need to update for a software upgrade to complete, and a stack fails then the rollback isn't as obvious, as prior stacks are already in a completed state.

In practice, trade off is deemed to be low severity, as any infrastructure issues will almost always be found before the change hits production, assuming appropriate testing.

2) Prefer deploying via codepipeline, always enable manual deployment 

3) DynamoDB tables do not use a sort key, only a field-based partition key.

This is a decision that makes building a dynamic graphql client much easier.

By using a single partition key, and no sort key, each record can be uniquely identified by the partition key. This means that client queries can be updated whenever there is an update to a record with the same partition key (e.g. via a graphql subscription message).

Should the dynamodb table use a sort key, then each record is only uniquely identified by the combination of partition key and sort key. This complicates [client queries, migrations, caching]. The recommendation is that almost all queries (except lookup by ID) go through a GSI to query, to mitigate this restriction.
