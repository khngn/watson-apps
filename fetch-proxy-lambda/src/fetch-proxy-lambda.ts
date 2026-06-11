
import { Context } from 'aws-lambda';
import { Logger, LogLevel } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  serviceName: 'fetch-proxy-lambda',
  logLevel: LogLevel.INFO,
});

interface Event {
  url: string,
  RequestInit: RequestInit,
}

const parseTemplate = (template: string, context: typeof process.env = process.env): string => {
  return template.replace(/\${(.*?)}/g, (_, key) => {
    const value = context[key];
    if (value === undefined) {
      throw new Error(`Context/environment variable ${key} is not defined`);
    }
    return value;
  });
}

// ################################################################################
export const handler = async (
  event: Event,
  context: Context
) => {
  // logger.info('Environment variables', { env: process.env });
  logger.info('Received Event', { event: event, context: context });

  const url = parseTemplate(event.url);
  if (!url) {
    const errorMessage = `URL is not provided in the event or environment variable. Event URL: ${event.url}`;
    logger.error(errorMessage);
    return { ERROR: mapError(new Error(errorMessage)) };
  }

  try {
    const response = await fetch(url, event.RequestInit);
    const data = await response.text();
    return {
      statusCode: response.status,
      statusText: response.statusText,
      responseType: response.type,
      url: response.url,
      headers: Object.fromEntries(response.headers.entries()),
      body: parseAsJson(data),
    };
  } catch (error: unknown) {
    logger.error('Fetch request failed', { ERROR: error });
    return { ERROR: mapError(error) };
  }
};

const parseAsJson = (it?: string) => {
  if (it) {
    try {
      return JSON.parse(it);
    } catch {
      // If parsing fails, return the original string
    }
  }
  return it;
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