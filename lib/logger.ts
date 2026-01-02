/**
 * Structured Logger
 *
 * Provides consistent logging with log levels, timestamps, and context.
 * Automatically redacts sensitive information from logs.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

// Sensitive field patterns to redact
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /bearer/i,
  /session/i,
  /cookie/i,
];

// Check if a key matches sensitive patterns
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

// Redact sensitive values from an object
function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 10) return "[Max depth exceeded]";

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Redact JWT tokens
    if (obj.startsWith("eyJ")) return "[REDACTED JWT]";
    // Redact API keys
    if (obj.startsWith("sk-") || obj.startsWith("ask_")) return "[REDACTED API KEY]";
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item, depth + 1));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSensitive(value, depth + 1);
      }
    }
    return result;
  }

  return obj;
}

// Format log entry
function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const redactedContext = context ? redactSensitive(context) : undefined;

  const logEntry: Record<string, unknown> = {
    timestamp,
    level,
    message,
  };

  if (redactedContext !== undefined) {
    logEntry.context = redactedContext;
  }

  return JSON.stringify(logEntry);
}

// Log level priority
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get minimum log level from environment
function getMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

// Check if a log level should be output
function shouldLog(level: LogLevel): boolean {
  const minLevel = getMinLevel();
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

/**
 * Logger instance
 */
export const logger = {
  debug(message: string, context?: LogContext): void {
    if (shouldLog("debug")) {
      console.debug(formatLog("debug", message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    if (shouldLog("info")) {
      console.info(formatLog("info", message, context));
    }
  },

  warn(message: string, context?: LogContext): void {
    if (shouldLog("warn")) {
      console.warn(formatLog("warn", message, context));
    }
  },

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (shouldLog("error")) {
      const errorContext: LogContext = { ...context };

      if (error instanceof Error) {
        errorContext.error = {
          name: error.name,
          message: error.message,
          stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        };
      } else if (error) {
        errorContext.error = String(error);
      }

      console.error(formatLog("error", message, errorContext));
    }
  },

  /**
   * Create a child logger with preset context
   */
  child(baseContext: LogContext) {
    return {
      debug: (message: string, context?: LogContext) =>
        logger.debug(message, { ...baseContext, ...context }),
      info: (message: string, context?: LogContext) =>
        logger.info(message, { ...baseContext, ...context }),
      warn: (message: string, context?: LogContext) =>
        logger.warn(message, { ...baseContext, ...context }),
      error: (message: string, error?: Error | unknown, context?: LogContext) =>
        logger.error(message, error, { ...baseContext, ...context }),
    };
  },
};

export default logger;
