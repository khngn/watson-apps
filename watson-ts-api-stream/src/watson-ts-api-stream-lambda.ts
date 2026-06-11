/* global awslambda */
import { Logger, LogLevel } from '@aws-lambda-powertools/logger';
import { InvokeWithResponseStreamCommand, InvokeWithResponseStreamCommandInput, LambdaClient } from '@aws-sdk/client-lambda';

const logger = new Logger({
  serviceName: 'watson-ts-api-stream-lambda',
  logLevel: LogLevel.INFO,
});

const lambdaClient = new LambdaClient();

interface EventBody {
  // Lambda
  InvokeWithResponseStreamCommandInput: InvokeWithResponseStreamCommandInput,
}

export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
  logger.info('Received Event', { event: event, context: context });

  const writeErrorToResponseStream = (err: unknown) => {
    if (responseStream.writable) {
      responseStream.write(JSON.stringify({ ERROR: mapError(err) }) + '\n');
    }
  };

  const body = JSON.parse(event.body ?? '{}') as EventBody;
  const input = body.InvokeWithResponseStreamCommandInput;
  if (!input) {
    responseStream = awslambda.HttpResponseStream.from(responseStream, { 'statusCode': 400 });
    writeErrorToResponseStream(new Error('Invalid request body: missing InvokeWithResponseStreamCommandInput'));
    responseStream.end();
    return;
  }
  if (input.Payload && typeof input.Payload !== 'string') {
    input.Payload = JSON.stringify(input.Payload);
  }

  try {
    const response = await lambdaClient.send(new InvokeWithResponseStreamCommand(input));

    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      'statusCode': response.$metadata.httpStatusCode ?? 200,
      'headers': response.$metadata,
    });
    // Iterate over the streamed event chunks
    for await (const chunk of response.EventStream ?? []) {
      if (chunk.PayloadChunk?.Payload) {
        responseStream.write(chunk.PayloadChunk.Payload);
      }
      if (chunk.InvokeComplete) {
        if (chunk.InvokeComplete.ErrorCode) {
          logger.error('Streaming invocation error', { InvokeComplete: chunk.InvokeComplete });
          writeErrorToResponseStream(new Error(`Invocation error: ${JSON.stringify(chunk.InvokeComplete)}`));
        }
        break;
      }
    }

  } catch (err: unknown) {
    writeErrorToResponseStream(err);

  } finally {
    responseStream.end();
  }
});

const mapError = (error: unknown): object => {
  if (error instanceof Error) {
    return {
      errorType: error.name,
      errorMessage: error.message,
      stack: error.stack?.split('\n'),
    };
  }

  return {
    errorType: 'UnknownError',
    errorMessage: (() => {
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    })(),
  };
};