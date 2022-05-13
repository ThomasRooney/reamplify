# Reamplify

Re-implementation of the AWS Amplify CLI with pure CDK.

 * [Migrate an AWS Amplify Application](#migrate)
 * [Start a new ReAmplify Application](#quickstart)

## Motivation

 * The AWS Amplify GraphQL Specification transformation to DynamoDB Table Configuration / AppSync GraphQL Resolvers is fantastic.
 * Amplify's Auth/UI library is fantastic.
 * Amplify works great for prototyping applications.

However:

* The developer experience of deploying, managing and configuring moderately-complex AWS Applications via AWS Amplify can be sub-par.
  * Using AWS Amplify will hide key infrastructure resources (CloudFront, CodeBuild) from you. When there are issues, you often have
    no way to debug/diagnose/fix these issues without going through support, which can be frustrating.
  * We found deployment of Amplify CLI-managed infrastructure to be very slow: we'd often wait 10-20 minutes for a 
    deployment to complete, even when making very small changes.
  * AWS Amplify undergoes a high pace of development and is often unstable. Whilst it's a fantastic technology for rapid
    prototyping, we found building stable production-ready applications on top of it frustrating. We ran into bugs regularly.
  * Because of the hidden complexity within AWS Amplify, when you run into an AWS Amplify bug it is very easy to become blocked. Its
    internals are not well documented, and we found ourselves spending a lot of time digging through the code to find workarounds.
  * We found integrating our Amplify-managed components with non-Amplify components (an AWS Fargate Node.JS server) to be 
    complex.

In contrast:

* The Developer experience with AWS CDK of deploying, managing and configuring AWS Applications is fantastic. We've never
  run into a library bug, and the documentation is fantastic.
* The AWS CDK CLI supports hotswap deployments, enabling very fast (<1 minute) deployment of components like AWS Lambda.

**Any code that runs is code that can fail**. After a frustrating week fighting a library bug we decided that the cost of 
re-implementing the Amplify CLI components with pure CDK was less than the cost of continuing to battle with the AWS Amplify
CLI.

This project is an extraction of the work we did to eject [https://reflow.io](https://reflow.io) from the AWS Amplify CLI.
The core design motivation is reducing the code-paths that run to deploy a given application to a minimum: just the AWS CDK
CLI.

### Who is this for?

This project is for teams who:
  * Want to make their Amplify Application ready for Production: stabilizing it with patterns for Error Monitoring, Backup/Restore, 
    and multi-environment deployment. 
  * Are considering leaving AWS Amplify, but want to do this gradually, avoid the need to rewrite their application code.
  * Are looking to use AWS Amplify's GraphQL Schema to AppSync Resolver / DynamoDB component standalone in another 
    application.

## What are the benefits?

  * Zero-Install development / deployment process, via Yarn v3 / PnP
  * AWS Amplify Schema compatibility, via direct invocation of Amplify's Schema Transformer toolchain
  * ESBuild-compiled Node.JS Lambdas
  * React Hooks for querying/live-update/caching of authorized DynamoDB data via Apollo
  * Continuous deployment via CDK Pipelines

On top of this, a few utility features are provided:

 * Backup/Restore capability for all components: including Cognito Userpools
 * Pre-configured AWS Lambda functions for highly-parallel data migration between Environments
 * Slack ChatOps integration for release notifications and Lambda Error Monitoring
 * Iterative DynamoDB table update script to handle multiple GSI (Global Secondary Index) updates in a single deployment 
 
This architecture has been battle-tested and is in production use at several companies.

## What is the tradeoff?

 * To use this, your team will need to take ownership of a significant amount of complexity. This complexity
   may mean learning AWS CDK, and using it to manage your infrastructure, instead of learning how Amplify configures 
   infrastructure. For small applications, this will _add_ complexity, not remove it. 
 * We haven't implemented any of the following amplify directives. Additional work would be needed before automatically
   creating these resources in a Reamplify application from parsed graphql directives.
   * `@searchable`
   * `@predictions`
   * `@http`
 * This repository doesn't work with Amplify DataStore. We do have a fork of this library which 
   re-enables the DataStore APIs ([https://reflow.io](Reflow) uses DataStore), but because enabling DataStore modifies
   **both** GraphQL DynamoDB attributes and adds a lot of complexity we prefer to keep the library as simple as possible.
 
## What can be configured

 * This repository contains everything needed to deploy a Reamplify app. All AWS Components are 100% configurable. We
   recommend that you maintain a private fork of this repository to tweak to your needs.

 * The deployment configuration does not use any AWS Amplify resources, instead:
   * Amplify Hosting is replaced by a S3 Static Site w/ Cloudfront
   * Amplify Automated Deployment is replaced by CodePipeline / CodeBuild
   * DNS is provided by Route53
 * AWS Amplify's transformer libraries are used in the `packages/schema` folder to compile AppSync resolvers. This 
   transformation process happens once per `schema.graphql` change, and the resolvers are checked into the codebase. This 
   ensures that the application can be stably deployed by CI servers.
 * Patches to amplify's generated VTL can be made via several patterns, depending on the scope of the patch:
   * Introducing an `overrides` folder, and hooking into it in `transformSchema.ts`
   * By overriding the transformer in `transformers.ts`.
   * By adding find/replace rules before these are written to disk in `transformSchema.ts`

## Folder Structure

The repository is configured as a yarn workspaces monorepo.

In [reflow](https://reflow.io), additional subfolders exist for each independently developed artifacts, for instance our
browser Session-recording application. By building this way we can share components (such as GraphQL API snippets)
between all of these projects with type-safety via typescript. 

In reamplify, we've provided the minimal set of components to build a basic CRUD web-application, and a homepage.

```
packages/schema   - Home for the GraphQL Schema, Resolvers, and additional common artifacts
packages/webapp   - Home for the frontend web application
packages/homepage - Home for the reamplify.io homepage
packages/deploy   - Home for the CDK deployment
```

## Design Decisions

1. Safe, stable, reproducible applications. Powered By:
   1. Corepack: a binary shipped with Node.JS >= 16.10. 
      1. This exposes binary proxies to solidify the node.js engine version
   2. Yarn v3 w/ PnP
      1. This removes the need for `npm install` after cloning the repository.
   3. Pre-generated appsync resolvers
      1. This allows for a reproducible Amplify Resolver deployment. Any changes that modify Resolvers can have their VTL 
         code-reviewed directly in a PR / Diff.
2. All components automatically deploy from a repository, but can be manually deployed when needed. Powered By:
   1. Two CDK application targets: one for CDK Pipelines, one for the CDK CLI. These reference a single application file which
      configures the application stacks in the same way.
   2. CodeBuild Buildspec files checked into the repository 
3. Fast, pleasant development experience. Powered By:
   1. Create-React-App for frontend, pointing at an arbitrary backend
   2. Fast (~20 seconds) hotswap deployment of AWS Lambda Functions via CDK Hotswap
   3. Typescript-powered CDK allows for rapid reconfiguration of application infrastructure. Specific design decisions (no nested stacks) made
      to allow for significant infrastructure changes without manual deployment effort.
4. Production-Ready application architecture. Powered By:
   1. All Backend components being serverless: your development environments can be exact duplicates of your production
      environments without incurring significant cost.
   2. All Backend Lambdas get automatic monitoring via CloudWatch / Slack error alerting
   3. Cognito Trigger Lambdas allows for cognito `sub` changes for backup/restore of a Cognito Userpool.
   4. Serverless DynamoDB w/ Copy-Environment Lambdas available for rapid disaster recovery and environment migration scenarios

## Quickstart

This codebase assumes you have [corepack enabled (for yarn)](https://yarnpkg.com/getting-started/install), or are operating on Node >= v16.10.

### Frontend

1. Clone this repository: `git clone git@github.com:ThomasRooney/reamplify.git`
2. Install dependencies (optional with [yarn zero-install](#zero-install)): `yarn install`
3. Navigate into webapp folder: `cd packages/webapp`
4. Run the webapp: `yarn start`

Subsequent code changes will be hot-reloaded.

### Backend

This codebase assumes you have [corepack enabled (for yarn)](https://yarnpkg.com/getting-started/install), or are operating on Node >= v16.10.

This codebase assumes you have an AWS Account configured, Node.js >= v16.10 installed, and [corepack enabled (for yarn)](https://yarnpkg.com/getting-started/install)

1. Clone this repository: `git clone git@github.com:ThomasRooney/reamplify.git`
2. Install dependencies (optional with [yarn zero-install](#zero-install)): `yarn install`
3. Navigate into deploy folder: `cd packages/deploy`
4. Make any changes you want.
5. Deploy the changes. 
   1. If your changes are just lambda function changes, just deploy lambda with `yarn run apply:dev:functions`.
   2. If you made changes to more than just lambda function content, you can deploy everything with `yarn run apply:dev:all`
6. Repeat [4,5] until your application works. Approximate time for a set of lambda changes to be live is ~30s.

## Configure a new backend environment

On top of the frontend requirements, to deploy a backend assumes you have an available AWS Accounts configured:

This codebase assumes you already have DNS configured for a domain of your choice. We will create an `NS` record to route 
a subdomain to the created example application. In this sequence we assume you own `myapp.myurl.com`, but given you do not please
replace that text with something appropriate that you own.

1. Fork this repository.
2. Navigate to packages/cdk/bin. Adjust `environments.ts` `dev` to match your environment:
   1. Open the AWS Console in the target account/region where you want to deploy your application
   3. Create a hosted zone named `myapp.myurl.com` in your AWS account
   4. Create an NS record from `myurl.com` to `myapp.myurl.com`
   5. Validate the DNS record routes via `dig`.
   2. Update the AWS Account and Region under the `env` variables to yours.
   6. Update the `HostedZoneId` in `environments.ts` with that hosted zone's ID
3. Open `packages/deploy/package.json`. Update the `cdk:bootstrap` commands to match the accounts/regions where you want to deploy.
4. Search for all hardcoded account-ids, validate they are no longer referenced. If referenced, replace with your account IDs
   1. 515651378965 (Root Organization AWS Account): this is assumed to be the default AWS account configured.
   2. 805615297525 (Development AWS Account): this is assumed to be the deployment account, and initially accessed via an AWS profile named 805615297525
   3. Note: if you want to just use a single-account setup, you can use the same account id for both and remove references to the development account. 
5. Execute `yarn run cdk:bootstrap`. Execute `yarn run cdk:bootstrap:dev`
6. Execute `yarn run cdk:deploy:manual:dev`. Wait for deployment to complete. This will create a new environment from scratch.
7. Execute `yarn run sync-environments`
8. Open `packages/webapp/`. Execute `yarn run build:dev`
9. Execute `yarn run frontend:deploy:manual:dev`. This will push the build live to `myapp.myurl.com`.
10. Validate `myapp.myurl.com` works.

Once you've completed this process, setup continuous deployment on your repository.

1. Open the AWS console at the target environment
2. Navigate to CodePipeline
3. Navigate to Settings => Connections.
4. If a connection already exists, take note of the connectionArn. Otherwise, follow [https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html](https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html) to configure a new connection for the account.
5. Add `deploy` property to the `environments/backend` with properties:
   1. `owner` = `'MyGithubUsername'` (this is the GitHub repository owner)
   2. `connectionArn` = the connectionArn from step [4]
   3. `repo` = `'reamplify'` (the GitHub repository name you forked this into)
   4. `branch` = whichever branch you want to trigger the deploy on. Whenever this branch is pushed to the deploy will run. E.g. `dev.branch = 'master'`
   5. `requiresApproval` (set to true if you want a manual approval stage before deployment, false for no approval)
   6. `approvalEmail: [...emails]` (add any email addresses that should get a notification email when a deploy comes in for approval).
6. Create a `cdk/bin/<env>/ci.ts` file that creates a single cloudformation stack under `new CDKPipelineStack` with the backend and userpool configuration that should be deployed.
7. Create a `synth:<env>` script target in `cdk/package.json` to synthesise the cloudformation templates for that environment. E.g. `npm run build && cdk synth --app "ts-node --prefer-ts-exts bin/thomas/ci.ts"`
8. Create a `ci:deploy:<env>` script target in `cdk/package.json` to prepare to actually deploy the CI configuration. E.g. `"ci:deploy:thomas": "npm run build && cdk deploy --all --app \"ts-node --prefer-ts-exts bin/thomas/ci.ts\""`
9. Commit/Push to your target branch before proceeding with everything done thus far. The pipeline will self mutate, so it's important that in its first run it will use the latest configuration.
10. Execute `ci:deploy:<env>` to deploy the pipeline.
11. After the deployment is done, watch one full deployment of each of the created pipelines and fix any issues. The 
    first pipeline will be the pipeline created in [10]. This will self-update itself based on the CDK synth. Subsequent
    updates will automatically deploy (including, optionally, the frontend pipeline). If `live: true` is set, a second pipeline 
    will be created to automatically deploy the frontend on pushes to the triggering branch as well. Both of these pipelines 
    adhere to the `requiresApproval` configuration; i.e. there will be 2 approval stages.

## DynamoDB Disaster Recovery / Moving data between environments

1. Disable dynamodb streams via setting `includeLambdaStreams: false`. Deploy. This will create the `CopyTable` lambdas.
2. Ensure that databases exist with a common suffix and appropriate data. I.e.
    1. If just moving environments, take note of the table suffix of the source / destination tables
    2. If restoring from a deleted environment, recreate all tables from DynamoDB backups with a common suffix (e.g. User-05052022-backup)
    3. If restoring to a specific time from an active environment, perform the dynamodb point-in-time restoration procedure of the active tables to a common suffixx (e.g. User-05052022-backup)
3. Execute `copyAllTables` with the source database suffix, destination database suffix, `inline: false`, and `totalSegments: 25`. `totalSegments` represents the maximum degree of parallelism when copying the database across from the source suffix
  (it will be automatically lowered if the database is small, via the `estimatedTotalRecords` property in dynamodb). Higher is faster, too high and the database might start throttling lambdas.
4. Watch cloudwatch insights log group `copyTable` for console output / errors. In particular, if `failed to invoke` is found, the job may need to be restarted. The job can be restarted from the last successful request, using the `lastEvaluatedKey` property.
5. (Important) Validate that the number of items in the destination table is the same as the source table. If it is less, repeat the process, lowering `totalSegments`. We have observed, at a high parallelism-to-item ratio, not all data points being scanned. 
6. If a segment cannot complete within 15 minutes (e.g. database size too large), its job may need to be continued manually. Lookup `nextEvent` in cloudwatch insights and manually invoke `copyTable` lambda with these `nextEvent` objects.

If the database size is small, this process can be run entirely locally on a developer's machine via mutating the `scripts/copy-table.ts` script to point at two environments and setting `inline: true`.

## Cognito Disaster Recovery / Migrate users between environments
 
1. Create a new Cognito user pool.
2. Create a Batch Import of users from the `Users` table from your backup. As long as `email` is consistent the user's data will be automatically moved to the new `sub` upon their next login.
3. Deploy the application with the `migratedArn` property set to the new userpool's ARN
4. Complete the batch import.

## Migrate

On a high level, the migration process from AWS Amplify is:

1. Create a copy of all AWS Amplify managed resources with CDK resources.
   1. For each Amplify-managed Lambda, create an appropriate CDK construct to create it. Configure `lambdas/index.ts` to 
      compile it with esbuild. Symbolically link the old one whilst developing so that CDK work can be merged in parallel with lambda work.
   2. For all other Amplify-managed resources, create appropriate CDK constructs that recreate them.
   3. (Optional: CI) Configure CodeStar to access your repository. Take note of the Codestar ARN and import it into `environments.ts` 
   4. (Optional: Slack) Configure AWS Chatops to access a Slack channel
   5. Reference the existing userpool with the `migrate` prop. We prefer not to recreate it as otherwise all users will 
      need to reset passwords. Alternatively, do a batch migration of users: whilst the `sub` will change the
      `PreConfirmation` lambda will migrate `owner` references. 
2. Deploy a new environment alongside the old one
   1. Migrate data via the copy-table lambdas
   2. Target the new environment to the old userpool.
   3. Validate that the application is working correctly.
   4. Change over DNS to point at the new environment.
   5. Repeat [1,2,3,4] for all other environments.
   6. Cleanup old resources once they are no longer used.
   
In our experience, this process takes 1-2 weeks of work for a mid-large AWS amplify project, by adapting reamplify resources
into an existing repository. This work can be done in parallel with normal development cycles if done with care.

## Zero-Install

To enable the [Yarn v3 Zero Install](https://yarnpkg.com/features/zero-installs) configuration, navigate to the root `.gitignore`
and follow instructions to check in the `.yarn/cache` directory.

This is an optional step, but recommended. We didn't want to bloat repository size for this base-repository, but for any
professional-grade application our opinion is that the advantages far-outweigh the disadvantages.

### Advantages

 * IDE performance tends to be faster using PnP instead of a `node_modules` directory
 * Deployment is far faster when using Zero-Install, as there's no need to fetch dependencies
 * Stability is higher: there's less moving parts that can break

### Disadvantages

 * The size of the repository will grow over time as dependencies are upgraded. This increases initial checkout time
 * Many npm packages do not support PnP, and require manual fine-tuning in .yarnrc.yml to bring them in. To support PnP
   each package needs to explicitly declare their dependencies, and many packages instead just assume that certain
   other packages are installed. 

## Testing

End-to-end tests are configured via [reflow](https://reflow.io) for all releases. Reflow is a low-code AI-augmented browser record/replay tool. 

To get started testing, create an account at `https://reflow.io`, or execute `npm install -g reflowio; reflowio dashboard` to
record/replay test sequences on your locally running software. Reflow will replay these sequences, automatically repair element selectors,
and provide visual feedback / auto-healing workflows.

## Support

If you are interested in commercial engineering support, please [contact us](mailto:thomas@resilientsoftware.co.uk). We can help with:

 * Migration of existing Amplify Apps into Reamplify
 * Training
 * DevOps as a Service: we'll customise Reamplify and help manage your infrastructure with CDK for all your product needs

## Additional Resources

* We have built and maintain addons to this project which are not in this repository because they are only applicable to
  certain products; and generally have to be tailored to a specific product.
* If you would like these capabilities integrated into your project, please contact us: we'll be able to do this for you
  far faster than your team implementing it.
   * IAM-managed multi-tenancy via AWS Attributes for Access Control; including Lambdas / UIs / APIs / S3 File Upload/Retrieve.
   * Team Management / Multi-User Workspaces via Cognito Custom Attributes; including Lambdas / UIs / IAM rules / DynamoDB GSIs 
   * Licensable API Gateway access into your application
   * API Key management / authorization via Web UIs
   * AWS Marketplace Integrations
   * Usage-based licensing / Subscription Payment models; including Scheduled Lambdas / UIs / Usage Monitoring 
   * Role-based permission modeling
