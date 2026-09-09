import 'server-only';

/**
 * Structured logging.
 *
 * One line of JSON per event, because logs are read by machines first: a log
 * aggregator can filter on `event` and `module` without a regex, and a
 * `console.log` of an interpolated sentence cannot be queried at all.
 *
 * Errors are reduced to name/message/stack rather than serialised whole. An
 * `Error` from a database driver carries the connection details on it, and
 * `JSON.stringify` would put the password in the log.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  readonly event: string;
  readonly module?: string;
  readonly [key: string]: unknown;
}

function emit(level: Level, fields: LogFields, error?: unknown): void {
  const line = {
    level,
    time: new Date().toISOString(),
    ...fields,
    ...(error === undefined ? {} : { error: describeError(error) }),
  };

  const serialised = JSON.stringify(line);
  if (level === 'error') console.error(serialised);
  else if (level === 'warn') console.warn(serialised);
  else console.log(serialised);
}

export const logger = {
  debug: (fields: LogFields) => emit('debug', fields),
  info: (fields: LogFields) => emit('info', fields),
  warn: (fields: LogFields, error?: unknown) => emit('warn', fields, error),
  error: (fields: LogFields, error?: unknown) => emit('error', fields, error),
};

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...('code' in error ? { code: (error as { code?: unknown }).code } : {}),
      stack: error.stack,
    };
  }
  return { message: String(error) };
}
