/* global awslambda */
// above /* global awslambda */ to fix eslint: error 'awslambda' is not defined no-undef
import { Logger, LogLevel } from '@aws-lambda-powertools/logger';
import {
  CloudWatchLogsClient,
  StartLiveTailCommand,
  StartLiveTailCommandInput
} from '@aws-sdk/client-cloudwatch-logs';
import { Context } from 'aws-lambda';

const logger = new Logger({
  serviceName: 'logs-live-tail-lambda',
  logLevel: LogLevel.INFO,
});

interface Event {
  // CloudWatch Logs
  StartLiveTailCommandInput?: StartLiveTailCommandInput,
}

// ################################################################################
// Lazy singletons
let cloudWatchLogsClient: CloudWatchLogsClient | undefined;
const getCloudWatchLogsClient = (): CloudWatchLogsClient => (cloudWatchLogsClient ??= new CloudWatchLogsClient());

// ################################################################################
export const handler = awslambda.streamifyResponse(async (
  event: Event,
  responseStream: awslambda.HttpResponseStream,
  context: Context,
) => {
  // logger.info('Environment variables', { env: process.env });
  logger.info('Received Event', { event: event, context: context });

  const endResponseStream = (): void => {
    if (responseStream.writable) {
      try {
        responseStream.end();
      } catch (err) {
        logger.warn('Error ending response stream', { ERROR: err });
      }
    }
  };
  const abortController = new AbortController();
  const onClientDisconnect = (reason: unknown) => {
    abortController.abort(reason);
    logger.warn('Client disconnected; aborted upstream stream:', { reason: reason });
    endResponseStream();
  };
  responseStream.on('close', onClientDisconnect);

  responseStream.setContentType('application/x-ndjson; charset=utf-8');
  const writeToResponseStream = (data: unknown) => {
    if (data !== undefined && responseStream.writable) {
      responseStream.write(JSON.stringify(data) + '\n');
    }
  };
  const writeErrorToResponseStream = (error: unknown) => {
    writeToResponseStream({ ERROR: mapError(error) });
  }

  try {
    // CloudWatch Logs
    if (event.StartLiveTailCommandInput) {
      logger.info('Sending StartLiveTailCommand', { StartLiveTailCommandInput: event.StartLiveTailCommandInput });
      const response = await getCloudWatchLogsClient().send(
        new StartLiveTailCommand(event.StartLiveTailCommandInput),
        { abortSignal: abortController.signal }
      );
      logger.info('Received StartLiveTailCommand response', { response: response });

      // https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/example_cloudwatch-logs_StartLiveTail_section.html
      for await (const event of response.responseStream ?? []) {
        if (event.sessionStart) {
          logger.info('event.sessionStart', { sessionStart: event.sessionStart });
        } else if (event.sessionUpdate) {
          for (const logEvent of event.sessionUpdate.sessionResults ?? []) {
            writeToResponseStream(logEvent);
          }
        } else {
          logger.error('Unknown event type', { event: event });
        }
      }

    } else {
      writeErrorToResponseStream(new Error('No valid command found in the logs-live-tail-lambda event'));
    }

  } catch (err: unknown) {
    logger.error('Error processing command', { ERROR: err });
    writeErrorToResponseStream(err);

  } finally {
    responseStream.removeListener('close', onClientDisconnect);
    endResponseStream();
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
