import { Logger, LogLevel } from '@aws-lambda-powertools/logger';
import {
  GetQueryExecutionCommand as AthenaGetQueryExecutionCommand,
  GetQueryExecutionCommandInput as AthenaGetQueryExecutionCommandInput,
  StartQueryExecutionCommand as AthenaStartQueryExecutionCommand,
  StartQueryExecutionCommandInput as AthenaStartQueryExecutionCommandInput,
  GetQueryResultsCommand as AthenaGetQueryResultsCommand,
  GetQueryResultsCommandInput as AthenaGetQueryResultsCommandInput,
  GetQueryResultsCommandOutput as AthenaGetQueryResultsCommandOutput,
  AthenaClient,
} from '@aws-sdk/client-athena';
import {
  CloudWatchLogsClient, DescribeLogGroupsCommand, DescribeLogGroupsCommandInput,
  FilterLogEventsCommand, FilterLogEventsCommandInput,
  GetQueryResultsCommand, GetQueryResultsCommandInput,
  ListLogGroupsCommand, ListLogGroupsCommandInput, StartQueryCommand, StartQueryCommandInput,
  StopQueryCommand, StopQueryCommandInput,
} from '@aws-sdk/client-cloudwatch-logs';
import { DescribeFlowLogsCommand, DescribeFlowLogsCommandInput, DescribeVpcsCommand, DescribeVpcsCommandInput, EC2Client } from '@aws-sdk/client-ec2';
import { DecryptCommand, DecryptCommandInput, EncryptCommand, EncryptCommandInput, KMSClient, ListAliasesCommand } from '@aws-sdk/client-kms';
import {
  InvokeCommand, InvokeCommandInput, LambdaClient,
  ListFunctionsCommand,
  ListFunctionsCommandInput,
  PublishVersionCommand,
  UpdateAliasCommand,
  UpdateFunctionCodeCommand,
  waitUntilFunctionUpdatedV2
} from '@aws-sdk/client-lambda';
import {
  CopyObjectCommand, CopyObjectCommandInput, DeleteObjectCommand, DeleteObjectCommandInput,
  DeleteObjectsCommand,
  DeleteObjectsCommandInput,
  GetObjectCommand, GetObjectCommandInput, HeadBucketCommand, HeadBucketCommandInput,
  HeadObjectCommand, HeadObjectCommandInput, HeadObjectCommandOutput,
  ListBucketsCommand, ListBucketsCommandInput, ListObjectsV2Command, ListObjectsV2CommandInput,
  PutObjectCommand, PutObjectCommandInput,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SQSEvent } from 'aws-lambda';
import { gunzipSync } from 'zlib';
import { isS3Event, isSQSEvent } from './event-types.js';
import {
  DecryptKmsRequest,
  DecryptKmsResponse,
  EncryptKmsRequest,
  EncryptKmsResponse,
  GetS3ObjectRequest, GetS3ObjectResponse, PutS3ObjectRequest, PutS3ObjectResponse,
  TransferS3ObjectRequest, TransferS3ObjectResponse, UpdateFunctionCodeAndVersionRequest,
  UpdateFunctionCodeAndVersionResponse
} from './lib/apl-types.js';
import { mapError, parseAsJson } from './utils.js';

const logger = new Logger({
  serviceName: 'aws-sdk-proxy-lambda',
  logLevel: LogLevel.INFO,
});

interface SdkCommandEvent {
  // CloudWatch Logs
  ListLogGroupsCommandInput?: ListLogGroupsCommandInput,
  DescribeLogGroupsCommandInput?: DescribeLogGroupsCommandInput,
  FilterLogEventsCommandInput?: FilterLogEventsCommandInput,
  StartQueryCommandInput?: StartQueryCommandInput,
  StopQueryCommandInput?: StopQueryCommandInput,
  GetQueryResultsCommandInput?: GetQueryResultsCommandInput,
  // Lambda
  ListFunctionsCommandInput?: ListFunctionsCommandInput,
  InvokeCommandInput?: InvokeCommandInput,
  UpdateFunctionCodeAndVersionRequest?: UpdateFunctionCodeAndVersionRequest,
  // S3
  ListBucketsCommandInput?: ListBucketsCommandInput,
  HeadBucketCommandInput?: HeadBucketCommandInput,
  GetS3Object?: GetS3ObjectRequest,
  PutObjectCommandInput?: PutObjectCommandInput,
  PutS3ObjectRequest?: PutS3ObjectRequest,
  PutS3ObjectRequests?: PutS3ObjectRequest[],
  ListObjectsV2CommandInput?: ListObjectsV2CommandInput,
  CopyObjectCommandInput?: CopyObjectCommandInput,
  TransferS3ObjectRequests?: TransferS3ObjectRequest[],
  DeleteObjectCommandInput?: DeleteObjectCommandInput,
  DeleteObjectsCommandInput?: DeleteObjectsCommandInput,
  // EC2
  DescribeVpcsCommandInput?: DescribeVpcsCommandInput,
  DescribeFlowLogsCommandInput?: DescribeFlowLogsCommandInput,
  // Athena
  AthenaStartQueryExecutionCommandInput?: AthenaStartQueryExecutionCommandInput,
  AthenaGetQueryExecutionCommandInput?: AthenaGetQueryExecutionCommandInput,
  AthenaGetQueryResultsCommandInput?: AthenaGetQueryResultsCommandInput,
  // KMS
  DecryptKmsRequest?: DecryptKmsRequest,
  EncryptKmsRequest?: EncryptKmsRequest,
}

// ################################################################################
// Lazy singletons
let cloudWatchLogsClient: CloudWatchLogsClient | undefined;
const getCloudWatchLogsClient = (): CloudWatchLogsClient => (cloudWatchLogsClient ??= new CloudWatchLogsClient());

let lambdaClient: LambdaClient | undefined;
const getLambdaClient = (): LambdaClient => (lambdaClient ??= new LambdaClient());

let s3Client: S3Client | undefined;
const getS3Client = (): S3Client => (s3Client ??= new S3Client());

let ec2Client: EC2Client | undefined;
const getEc2Client = (): EC2Client => (ec2Client ??= new EC2Client());

let athenaClient: AthenaClient | undefined;
const getAthenaClient = (): AthenaClient => (athenaClient ??= new AthenaClient());

let kmsClient: KMSClient | undefined;
const getKmsClient = (): KMSClient => (kmsClient ??= new KMSClient());

// ################################################################################
export const handler = async (
  event: SdkCommandEvent | SQSEvent,
  // context: Context
) => {
  // logger.info('Environment variables', { env: process.env });
  // logger.info('Received Event', { event: event, context: context });

  try {
    if (isSQSEvent(event)) {
      return await handleSQSEvent(event);
    } else {
      return await handleSdkCommandEvent(event);
    }
  } catch (error) {
    logger.error('Error handling event', { ERROR: error });
    throw error;
  }

};

const handleSQSEvent = async (event: SQSEvent) => {
  for (const record of event.Records) {
    if (isS3Event(record)) {
      for (const s3Record of record.Records) {
        logger.info('Received S3 event record from SQS', { s3Record });
        // Implement your custom logic to handle the S3 event record here
      }
    }
  }
}

const handleSdkCommandEvent = async (
  event: SdkCommandEvent,
) => {
  // CloudWatch Logs
  if (event.ListLogGroupsCommandInput) {
    logger.info('Sending ListLogGroupsCommand', { ListLogGroupsCommandInput: event.ListLogGroupsCommandInput });
    return await getCloudWatchLogsClient().send(new ListLogGroupsCommand(event.ListLogGroupsCommandInput));
  } else if (event.DescribeLogGroupsCommandInput) {
    logger.info('Sending DescribeLogGroupsCommand', { DescribeLogGroupsCommandInput: event.DescribeLogGroupsCommandInput });
    return await getCloudWatchLogsClient().send(new DescribeLogGroupsCommand(event.DescribeLogGroupsCommandInput));
  } else if (event.FilterLogEventsCommandInput) {
    logger.info('Sending FilterLogEventsCommand', { FilterLogEventsCommandInput: event.FilterLogEventsCommandInput });
    return await getCloudWatchLogsClient().send(new FilterLogEventsCommand(event.FilterLogEventsCommandInput));
  } else if (event.StartQueryCommandInput) {
    logger.info('Sending StartQueryCommand', { StartQueryCommandInput: event.StartQueryCommandInput });
    return await getCloudWatchLogsClient().send(new StartQueryCommand(event.StartQueryCommandInput));
  } else if (event.StopQueryCommandInput) {
    logger.info('Sending StopQueryCommand', { StopQueryCommandInput: event.StopQueryCommandInput });
    return await getCloudWatchLogsClient().send(new StopQueryCommand(event.StopQueryCommandInput));
  } else if (event.GetQueryResultsCommandInput) {
    logger.info('Sending GetQueryResultsCommand', { GetQueryResultsCommandInput: event.GetQueryResultsCommandInput });
    return await getCloudWatchLogsClient().send(new GetQueryResultsCommand(event.GetQueryResultsCommandInput));
    // Lambda
  } else if (event.ListFunctionsCommandInput) {
    logger.info('Sending ListFunctionsCommand', { ListFunctionsCommandInput: event.ListFunctionsCommandInput });
    return await getLambdaClient().send(new ListFunctionsCommand(event.ListFunctionsCommandInput));
  } else if (event.InvokeCommandInput) {
    if (event.InvokeCommandInput.Payload && typeof event.InvokeCommandInput.Payload !== 'string') {
      event.InvokeCommandInput.Payload = JSON.stringify(event.InvokeCommandInput.Payload);
    }
    logger.info('Sending InvokeCommand', { InvokeCommandInput: event.InvokeCommandInput });
    const output = await getLambdaClient().send(new InvokeCommand(event.InvokeCommandInput));
    return {
      ...output,
      Payload: parseAsJson(output.Payload?.transformToString('utf-8')),
      LogResult: output.LogResult ? Buffer.from(output.LogResult, 'base64').toString('utf-8').split('\n') : undefined,
    };
  } else if (event.UpdateFunctionCodeAndVersionRequest) {
    return await updateFunctionCode(event.UpdateFunctionCodeAndVersionRequest);
    // S3
  } else if (event.ListBucketsCommandInput) {
    logger.info('Sending ListBucketsCommand', { ListBucketsCommandInput: event.ListBucketsCommandInput });
    return await getS3Client().send(new ListBucketsCommand(event.ListBucketsCommandInput));
  } else if (event.HeadBucketCommandInput) {
    logger.info('Sending HeadBucketCommand', { HeadBucketCommandInput: event.HeadBucketCommandInput });
    return await getS3Client().send(new HeadBucketCommand(event.HeadBucketCommandInput));
  } else if (event.GetS3Object) {
    return await getS3Object(event.GetS3Object);
  } else if (event.PutObjectCommandInput) {
    logger.info('Sending PutObjectCommand', { PutObjectCommandInput: event.PutObjectCommandInput });
    return await getS3Client().send(new PutObjectCommand(event.PutObjectCommandInput));
  } else if (event.PutS3ObjectRequest) {
    return await putS3Object(event.PutS3ObjectRequest);
  } else if (event.PutS3ObjectRequests) {
    return await putS3Objects(event.PutS3ObjectRequests);
  } else if (event.ListObjectsV2CommandInput) {
    logger.info('Sending ListObjectsV2Command', { ListObjectsV2CommandInput: event.ListObjectsV2CommandInput });
    return await getS3Client().send(new ListObjectsV2Command(event.ListObjectsV2CommandInput));
  } else if (event.CopyObjectCommandInput) {
    logger.info('Sending CopyObjectCommand', { CopyObjectCommandInput: event.CopyObjectCommandInput });
    return await getS3Client().send(new CopyObjectCommand(event.CopyObjectCommandInput));
  } else if (event.TransferS3ObjectRequests) {
    return await transferS3Objects(event.TransferS3ObjectRequests);
  } else if (event.DeleteObjectCommandInput) {
    logger.info('Sending DeleteObjectCommand', { DeleteObjectCommandInput: event.DeleteObjectCommandInput });
    return await getS3Client().send(new DeleteObjectCommand(event.DeleteObjectCommandInput));
  } else if (event.DeleteObjectsCommandInput) {
    logger.info('Sending DeleteObjectsCommand', { DeleteObjectsCommandInput: event.DeleteObjectsCommandInput });
    return await getS3Client().send(new DeleteObjectsCommand(event.DeleteObjectsCommandInput));
    // EC2
  } else if (event.DescribeVpcsCommandInput) {
    logger.info('Sending DescribeVpcsCommand', { DescribeVpcsCommandInput: event.DescribeVpcsCommandInput });
    return await getEc2Client().send(new DescribeVpcsCommand(event.DescribeVpcsCommandInput));
  } else if (event.DescribeFlowLogsCommandInput) {
    logger.info('Sending DescribeFlowLogsCommand', { DescribeFlowLogsCommandInput: event.DescribeFlowLogsCommandInput });
    return await getEc2Client().send(new DescribeFlowLogsCommand(event.DescribeFlowLogsCommandInput));
    // Athena
  } else if (event.AthenaStartQueryExecutionCommandInput) {
    logger.info('Sending StartQueryExecutionCommand', { AthenaStartQueryExecutionCommandInput: event.AthenaStartQueryExecutionCommandInput });
    return await getAthenaClient().send(new AthenaStartQueryExecutionCommand(event.AthenaStartQueryExecutionCommandInput));
  } else if (event.AthenaGetQueryExecutionCommandInput) {
    logger.info('Sending GetQueryExecutionCommand', { AthenaGetQueryExecutionCommandInput: event.AthenaGetQueryExecutionCommandInput });
    return await getAthenaClient().send(new AthenaGetQueryExecutionCommand(event.AthenaGetQueryExecutionCommandInput));
  } else if (event.AthenaGetQueryResultsCommandInput) {
    logger.info('Sending GetQueryResultsCommand', { AthenaGetQueryResultsCommandInput: event.AthenaGetQueryResultsCommandInput });
    return await getAthenaClient().send(new AthenaGetQueryResultsCommand(event.AthenaGetQueryResultsCommandInput));
    // KMS
  } else if (event.DecryptKmsRequest) {
    const input: DecryptCommandInput = {
      ...event.DecryptKmsRequest.DecryptCommandInput,
      CiphertextBlob: Buffer.from(event.DecryptKmsRequest.textBase64, 'base64'),
    };
    const output = await getKmsClient().send(new DecryptCommand(input));
    const response: DecryptKmsResponse = {
      decryptedText: output.Plaintext ? Buffer.from(output.Plaintext).toString('utf-8') : '',
      DecryptCommandOutput: output,
      // Optional extra
      ...(event.DecryptKmsRequest.listKmsKeyAliases && output.KeyId ? {
        ListAliasesCommandOutput: await getKmsClient().send(new ListAliasesCommand({ KeyId: output.KeyId })),
      } : {}),
    };
    return response;
  } else if (event.EncryptKmsRequest) {
    const input: EncryptCommandInput = {
      ...event.EncryptKmsRequest.EncryptCommandInput,
      Plaintext: Buffer.from(event.EncryptKmsRequest.text, 'utf-8'),
    };
    const output = await getKmsClient().send(new EncryptCommand(input));
    const response: EncryptKmsResponse = {
      encryptedText: output.CiphertextBlob ? Buffer.from(output.CiphertextBlob).toString('base64') : '',
      EncryptCommandOutput: output,
    };
    return response;
  }
  // No valid command found in the event
  throw new Error('No parameter provided in the aws-sdk-proxy-lambda event.');
};

// ################################################################################
const updateFunctionCode = async (request: UpdateFunctionCodeAndVersionRequest): Promise<UpdateFunctionCodeAndVersionResponse> => {
  const lambdaClient = getLambdaClient();
  logger.info('Sending UpdateFunctionCodeCommand', { UpdateFunctionCodeCommandInput: request.UpdateFunctionCodeCommandInput });
  const updateOutput = await lambdaClient.send(new UpdateFunctionCodeCommand(request.UpdateFunctionCodeCommandInput));
  const response: UpdateFunctionCodeAndVersionResponse = {
    UpdateFunctionCodeCommandOutput: updateOutput,
  };
  if (request.waitUntilFunctionUpdated && updateOutput.FunctionName) {
    const functionName = updateOutput.FunctionName;
    const maxWaitTime = request.waitUntilFunctionUpdated.maxWaitTime;
    logger.info('Waiting for function to be updated', { FunctionName: functionName, maxWaitTime: maxWaitTime });
    await waitUntilFunctionUpdatedV2({ client: lambdaClient, maxWaitTime: maxWaitTime }, { FunctionName: functionName });
    if (request.waitUntilFunctionUpdated.publishNewVersion) {
      logger.info('Sending PublishVersionCommand', { FunctionName: functionName });
      const publishOutput = await lambdaClient.send(new PublishVersionCommand({ FunctionName: functionName }));
      response.PublishVersionCommandOutput = publishOutput;
      if (request.waitUntilFunctionUpdated.publishNewVersion.updateAliasName) {
        const aliasName = request.waitUntilFunctionUpdated.publishNewVersion.updateAliasName;
        logger.info('Sending UpdateAliasCommand', { FunctionName: functionName, Name: aliasName, FunctionVersion: publishOutput.Version });
        const updateAliasOutput = await lambdaClient.send(new UpdateAliasCommand({ FunctionName: functionName, Name: aliasName, FunctionVersion: publishOutput.Version }));
        response.UpdateAliasCommandOutput = updateAliasOutput;
      }
    }
  }
  return response;
}

const putS3Object = async (request: PutS3ObjectRequest): Promise<PutS3ObjectResponse> => {
  const input = request.PutObjectCommandInput;
  let body = input.Body;
  if (body !== undefined) {
    if (request.isBase64Payload) {
      body = Buffer.from(body as string, 'base64');
      if (request.isBase64Payload.isGzip) {
        body = gunzipSync(body);
      }
      input.Body = body;
    }
    logger.info('Sending PutObjectCommand', { PutObjectCommandInput: input });
    return await getS3Client().send(new PutObjectCommand(input));
  }
  // No Body is provided, generate a presigned URL for uploading the object directly to S3.
  if (request.generateSignedUrl) {
    const expiresIn = request.generateSignedUrl.expiresIn ?? 3600;
    const signedUrl = await getSignedUrl(getS3Client(), new PutObjectCommand(input), { expiresIn: expiresIn });
    return {
      signedUrl: signedUrl,
    };
  }
  throw new Error('Invalid PutS3ObjectRequest: must include either a Body or generateSignedUrl parameter.');
}

const putS3Objects = async (requests: PutS3ObjectRequest[]): Promise<PutS3ObjectResponse[]> => {
  logger.info('Processing PutS3ObjectRequests', { total: requests.length });
  return await Promise.all(requests.map(async (request) => putS3Object(request)));
}

const getS3Object = async (request: GetS3ObjectRequest): Promise<GetS3ObjectResponse> => {

  const getHeadObject = async (input: HeadObjectCommandInput): Promise<HeadObjectCommandOutput> => {
    logger.info('Sending HeadObjectCommand', { input });
    return await getS3Client().send(new HeadObjectCommand(input));
  };

  const generateSignedUrl = async (input: GetObjectCommandInput, expiresIn: number): Promise<string> => {
    const getObjectCmd = new GetObjectCommand(input);
    logger.info('Calling getSignedUrl for GetObjectCommand', { input, expiresIn });
    return await getSignedUrl(getS3Client(), getObjectCmd, { expiresIn: expiresIn });
  };

  return {
    HeadObjectCommandOutput: await getHeadObject(request.GetObjectCommandInput),
    signedUrl: await generateSignedUrl(request.GetObjectCommandInput, request.expiresIn ?? 3600),
  }
}

const transferS3Objects = async (requests: TransferS3ObjectRequest[]) => {
  const total = requests.length;
  logger.info('Executing TransferS3ObjectRequests', { total: total });
  return (await Promise.allSettled(requests.map(async (request, index): Promise<TransferS3ObjectResponse> => {
    logger.info(`Sending TransferS3ObjectRequests.CopyObjectCommand[${index + 1}/${total}]`, { CopyObjectCommandInput: request.CopyObjectCommandInput });
    const copyOutput = await getS3Client().send(new CopyObjectCommand(request.CopyObjectCommandInput));
    let optionsOutput = {};
    if (copyOutput.CopyObjectResult?.LastModified && request.onSuccess?.DeleteObjectCommandInput) {
      logger.info(`Sending DeleteObjectCommand for onSuccess of TransferS3ObjectRequests.CopyObjectCommand[${index + 1}/${total}]`, {
        DeleteObjectCommandInput: request.onSuccess.DeleteObjectCommandInput,
      });
      const deleteOutput = await getS3Client().send(new DeleteObjectCommand(request.onSuccess.DeleteObjectCommandInput));
      optionsOutput = { DeleteObjectCommandOutput: deleteOutput };
    }
    return {
      CopyObjectCommandOutput: copyOutput,
      ...optionsOutput,
    };
  }))).map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      logger.error(`TransferS3ObjectRequests.item[${index + 1}/${total}] failed`, { ERROR: result.reason });
      return mapError(result.reason);
    }
  });
}
