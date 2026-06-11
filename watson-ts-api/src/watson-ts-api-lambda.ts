import { Logger, LogLevel } from '@aws-lambda-powertools/logger';
import { __MetadataBearer, InvokeCommand, InvokeCommandInput, LambdaClient } from '@aws-sdk/client-lambda';
import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';

const logger = new Logger({
  serviceName: 'watson-ts-api-lambda',
  logLevel: LogLevel.INFO,
});

const lambdaClient = new LambdaClient();

interface EventBody {
  // Lambda
  InvokeCommandInput: InvokeCommandInput,
}

const jsonResponse = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
  statusCode: statusCode,
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body),
});

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {

  logger.info('Received Event', { event: event, context: context });

  const body = JSON.parse(event.body ?? '{}') as EventBody;
  const input = body.InvokeCommandInput;
  if (!input) {
    return jsonResponse(400, {
      errorMessage: 'Invalid request body: missing InvokeCommandInput',
    });
  }
  if (input.Payload && typeof input.Payload !== 'string') {
    input.Payload = JSON.stringify(input.Payload);
  }

  try {
    const output = await lambdaClient.send(new InvokeCommand(input));
    const outputPayload = output.Payload ? JSON.parse(output.Payload.transformToString('utf-8')) as unknown : undefined;

    return jsonResponse(output.StatusCode ?? 200, {
      InvokeCommandOutput: {
        ...output,
        Payload: outputPayload,
      },
    });

  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Error invoking Lambda function', { ERROR: error });
    const httpStatusCode = (error as Partial<__MetadataBearer>)?.$metadata?.httpStatusCode ?? 500;

    return jsonResponse(httpStatusCode, mapError(err));
  }
};

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