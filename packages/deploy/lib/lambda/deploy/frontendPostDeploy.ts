import type { CodePipelineHandler } from 'aws-lambda';
import * as aws from 'aws-sdk';
import type { ListObjectsV2Request } from 'aws-sdk/clients/s3';
import type { S3ArtifactLocation } from 'aws-sdk/clients/codepipeline';
import * as zip from 'yauzl';
import logger from '../logger';
const FRONTEND_BUCKET = process.env.FRONTEND_BUCKET;
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;
const s3 = new aws.S3();

// Returns a promise of Map<Object Key, Object Etag> of files in a given bucket under a given prefix
export const listFiles = async (props: { bucketName: string; objectKey?: string }): Promise<Map<string, string>> => {
  async function* listAllKeys(opts: ListObjectsV2Request) {
    try {
      opts = { ...opts };
      do {
        const data = await s3.listObjectsV2(opts).promise();
        opts.ContinuationToken = data.NextContinuationToken;
        yield data;
      } while (opts.ContinuationToken);
    } catch (e) {
      logger.error(`listObjectsV2`, opts, 'error', e);
      throw e;
    }
  }
  const files: Map<string, string> = new Map();
  for await (const data of listAllKeys({ Bucket: props.bucketName, Prefix: props.objectKey })) {
    if (!data.Contents) {
      return files;
    }
    for (const object of data.Contents) {
      if (!object.Key || !object.ETag) {
        continue;
      }
      files.set(object.Key, object.ETag);
    }
  }
  return files;
};

export const putFiles = async (
  originBucket: string,
  originPrefix: string,
  keys: string[],
  targetBucket: string
): Promise<any> => {
  const promises: Promise<any>[] = [];
  for (const key of keys) {
    promises.push(
      s3.copyObject({ CopySource: `${originBucket}/${originPrefix + key}`, Bucket: targetBucket, Key: key }).promise()
    );
  }
  return Promise.all(promises);
};
export const deleteFiles = async (bucketName: string, keys: string[]): Promise<any> => {
  const promises: Promise<any>[] = [];
  for (const key of keys) {
    promises.push(s3.deleteObject({ Bucket: bucketName, Key: key }).promise());
  }
  return Promise.all(promises);
};

export const checkExisting = (
  origin: S3ArtifactLocation,
  extractedKey: any,
  existing: Map<string, string>
): Promise<Set<string>> =>
  new Promise(async (resolve, reject) => {
    let artifactGetResult;
    let notFound: Set<string> = new Set([...existing.keys()]);
    try {
      artifactGetResult = await s3.getObject({ Bucket: origin.bucketName, Key: origin.objectKey }).promise();
    } catch (e) {
      logger.error(`s3.getObject({ Bucket: ${origin.bucketName}, Key: ${origin.objectKey} }) error`, e);
      reject(e);
      return;
    }
    if (!artifactGetResult.Body || !(artifactGetResult.Body instanceof Buffer)) {
      const err = new Error(`missing artifact body at ${JSON.stringify(origin)}`);
      reject(err);
      return;
    }
    zip.fromBuffer(artifactGetResult.Body, { lazyEntries: true }, function (err: any, zipfile: any) {
      if (err) {
        reject(err);
        throw err;
      }
      if (!zipfile) {
        reject(err);
        throw new Error('no zipfile');
      }

      zipfile.on('error', function (err: any) {
        reject(err);
        throw err;
      });
      zipfile.on('entry', function (entry: any) {
        const filename = entry.fileName;
        if (/\/$/.exec(entry)) return zipfile.readEntry();
        notFound.delete(filename);
        zipfile.readEntry();
      });
      zipfile.on('end', async () => {
        resolve(notFound);
      });
      zipfile.readEntry();
    });
  });

export const syncronize = async (
  origin: S3ArtifactLocation,
  target: { bucketName: string; objectKey?: string },
  cloudfrontId: string,
  eventId: string
) => {
  const originPrefix = `${origin.objectKey}_extracted/`;

  const targetObjects = await listFiles(target);

  const notFound = await checkExisting(origin, originPrefix, targetObjects);
  logger.log(`cleanup ${notFound.size} items..`);
  if (notFound.size > 0) {
    try {
      await s3.deleteObjects({
        Bucket: target.bucketName,
        Delete: {
          Objects: [...notFound].map((k) => ({ Key: k })),
        },
      });
    } catch (e) {
      logger.error(
        `s3.deleteObjects({
        Bucket: ${target.bucketName},
        Delete: {
          Objects: ${JSON.stringify([...notFound].map((k) => ({ Key: k })))},
        },
      }) rejected`,
        e
      );
    }
  }

  // then trigger cloudfront invalidation
  const cloudfront = new aws.CloudFront();

  try {
    const invalidation = await cloudfront
      .createInvalidation({
        DistributionId: cloudfrontId,
        InvalidationBatch: {
          CallerReference: eventId,
          Paths: {
            Items: ['/*'],
            Quantity: 1,
          },
        },
      })
      .promise();
    logger.log('invalidation created', invalidation);
  } catch (e) {
    logger.error('cloudfront.createInvalidation error', e);
    throw e;
  }
  return;
};

export const handler: CodePipelineHandler = (event) => {
  logger.log('event=', JSON.stringify(event));
  logger.log('FRONTEND_BUCKET=', JSON.stringify(FRONTEND_BUCKET));
  logger.log('CLOUDFRONT_DISTRIBUTION_ID=', JSON.stringify(CLOUDFRONT_DISTRIBUTION_ID));
  const input = event['CodePipeline.job'].data.inputArtifacts[0];
  const artifactLocation = input.location.s3Location;
  const currentLocation = FRONTEND_BUCKET!;
  const jobId = event['CodePipeline.job'].id;
  const codepipeline = new aws.CodePipeline();

  syncronize(artifactLocation, { bucketName: currentLocation }, CLOUDFRONT_DISTRIBUTION_ID!, jobId).then(
    async () => {
      try {
        await codepipeline.putJobSuccessResult({ jobId }).promise();
      } catch (e) {
        logger.error('codepipeline.putJobSuccessResult({ jobId }) error', e);
      }
    },
    async (e) => {
      logger.error(e);

      try {
        await codepipeline
          .putJobFailureResult({ jobId, failureDetails: { type: 'JobFailed', message: e.message } })
          .promise();
      } catch (e) {
        logger.error(
          "codepipeline.putJobFailureResult({ jobId, failureDetails: { type: 'JobFailed', message: e.message } }) error",
          e
        );
      }
    }
  );
  return;
};
