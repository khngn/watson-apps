
export const parseAsJson = (it?: string) => {
  if (it) {
    try {
      return JSON.parse(it);
    } catch {
      // If parsing fails, return the original string
    }
  }
  return it;
};

export const mapError = (error: unknown): object => {
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
