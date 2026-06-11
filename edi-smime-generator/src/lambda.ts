import { Logger, LogLevel } from '@aws-lambda-powertools/logger';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Context, S3Event, SQSEvent, SQSRecord } from 'aws-lambda';

const logger = new Logger({
  serviceName: 'edi-smime-generator',
  logLevel: LogLevel.INFO,
});

const s3Client = new S3Client({ region: process.env.REGION || 'ap-southeast-2' });

interface Smime {
    meta: { classification: string; };
    data: { message: string; };
}

export const handler = async (
  event: SQSEvent,
  context: Context
) => {
  logger.info('Environment variables', { env: process.env });
  logger.info('Received SQS event', { event: event, context: context });
  const sqsResults = event.Records.map(async (record: SQSRecord) => {
    const s3Event = JSON.parse(record.body) as S3Event;
    logger.info('Parsed S3 event from SQS message', { s3Event: s3Event });
    const s3Results = s3Event.Records.map(async (s3Record) => {
      // Download the file from S3
      const getS3ObjectResponse = await s3Client.send(new GetObjectCommand({
        Bucket: s3Record.s3.bucket.name,
        Key: s3Record.s3.object.key,
      }));
      const fileContent = JSON.parse(await getS3ObjectResponse.Body?.transformToString() || '{}');

      const testSmimeApiResponse = await fetch(`${process.env.TEST_SMIME_API_PRIVATE_API_URL}/smime`, {
        method: 'POST',
        headers: new Headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          meta: {
            classification: 'OFFICIAL'
          },
          data: fileContent,
        })
      });

      // const responseText = await testSmimeApiResponse.text();
      // logger.info('Sent file content to test smime api', {
      //   s3Key: s3Record.s3.object.key,
      //   testSmimeApiResponseOk: testSmimeApiResponse.ok,
      //   testSmimeApiResponseStatus: testSmimeApiResponse.status,
      //   testSmimeApiResponseStatusText: testSmimeApiResponse.statusText,
      //   testSmimeApiResponse: testSmimeApiResponse.ok ? JSON.parse(responseText) : responseText,
      // });
      if (testSmimeApiResponse.ok) {
        const smimeResponse = await testSmimeApiResponse.json() as Smime;
        logger.info('Received smime response from test smime api', {
          inputS3Key: s3Record.s3.object.key,
        });
        // Write the smime response to S3 (for inbound-smtp lambda to pick up)
        const outputKey = s3Record.s3.object.key;
        const putS3ObjectResponse = await s3Client.send(new PutObjectCommand({
          Bucket: process.env.OUTPUT_S3_BUCKET!,
          Key: outputKey,
          Body: smimeResponse.data.message,
        }));
        logger.info('Written smime response to S3', {
          inputS3Key: s3Record.s3.object.key,
          outputS3Key: outputKey,
          size: putS3ObjectResponse.Size,
        });
      } else {
        logger.error('Failed to get smime response from test smime api', {
          inputS3Key: s3Record.s3.object.key,
          testSmimeApiResponseOk: testSmimeApiResponse.ok,
          testSmimeApiResponseStatus: testSmimeApiResponse.status,
          testSmimeApiResponseStatusText: testSmimeApiResponse.statusText,
          testSmimeApiResponse: await testSmimeApiResponse.text(),
        });
      }
    });

    return Promise.all(s3Results);
  });

  return Promise.all(sqsResults);
};