import { Logger, LogLevel } from '@aws-lambda-powertools/logger';
import { __MetadataBearer, InvokeCommand, InvokeCommandInput, InvokeCommandOutput, LambdaClient } from '@aws-sdk/client-lambda';
import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';

const logger = new Logger({
  serviceName: 'watson-ts-api-lambda',
  logLevel: LogLevel.INFO,
});

const lambdaClient = new LambdaClient();

interface InvokeCommandEventBody {
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

  if (event.resource === '/invoke') {
    const body = JSON.parse(event.body ?? '{}') as InvokeCommandEventBody;
    return await handleInvokeCommandEvent(body.InvokeCommandInput);
  }

  if (event.resource.startsWith('/proxy/{proxy+}')) {
    return await handleProxyEvent(event);
  }

  return jsonResponse(404, {
    errorMessage: 'Resource not found: ' + event.resource,
  });
}

const handleProxyEvent = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const proxyPath = event.pathParameters?.proxy;
    if (!proxyPath) {
      return jsonResponse(400, {
        errorMessage: 'Missing proxy path',
      });
    }
    // e.g. for proxyPath api-1/target/path/...
    // 1. Resolve target service url
    const [targetId, ...targetPathParts] = proxyPath.split('/');
    const targetBaseUrl = process.env['PROXY_TARGET_' + targetId.replaceAll('-', '_')];
    if (!targetBaseUrl) {
      return jsonResponse(400, {
        errorMessage: `Unknown proxy target: ${targetId}`,
      });
    }
    const query = event.multiValueQueryStringParameters
      ? new URLSearchParams(
        Object.entries(event.multiValueQueryStringParameters).flatMap(
          ([key, values]) => (values ?? []).map(value => [key, value])
        )
      )
      : undefined;

    const fullTargetUrl = `${targetBaseUrl.replace(/\/+$/, '')}/${targetPathParts.join('/')}${query ? `?${query.toString()}` : ''}`;

    // 2. Build RequestInit
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(event.headers)) {
      if (value !== undefined && !['host', 'content-length'].includes(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    const body = event.body
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : event.body
      : undefined;

    const requestInit: RequestInit = {
      method: event.httpMethod,
      headers: headers,
      body: body,
    };

    // 3. Make request
    logger.debug('Proxying request to target', {
      method: requestInit.method,
      URL: fullTargetUrl,
      headers: requestInit.headers,
    });
    const invokeOutput = await sendInvokeCommand({
      FunctionName: process.env['KN_FETCH_LAMBDA_ARN'],
      Payload: JSON.stringify({
        url: fullTargetUrl,
        RequestInit: requestInit,
      }),
    });

    type InvokeOutputPayload = {
      statusCode: number;
      responseType: ResponseType,
      url: string,
      headers: Record<string, string>;
      body: unknown;
    };
    const outputPayload = invokeOutput.Payload
      ? JSON.parse(invokeOutput.Payload.transformToString('utf-8')) as InvokeOutputPayload
      : undefined;

    return {
      statusCode: outputPayload?.statusCode ?? 200,
      headers: outputPayload?.headers,
      body: JSON.stringify(outputPayload?.body ?? ''),
      isBase64Encoded: false,
    };
}

const sendInvokeCommand = async (input: InvokeCommandInput): Promise<InvokeCommandOutput> => {
  if (input.Payload && typeof input.Payload !== 'string') {
    input.Payload = JSON.stringify(input.Payload);
  }
  return await lambdaClient.send(new InvokeCommand(input));
};

const handleInvokeCommandEvent = async (input: InvokeCommandInput): Promise<APIGatewayProxyResult> => {
  if (!input) {
    return jsonResponse(400, {
      errorMessage: 'Invalid request body: missing InvokeCommandInput',
    });
  }

  try {
    const output = await sendInvokeCommand(input);
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
      stack: error.stack?.split('\n') ?? [],
      cause: error.cause ? mapError(error.cause) : undefined,
    };
  }

  return mapError(new Error('Unexpected Error', { cause: error }));
};