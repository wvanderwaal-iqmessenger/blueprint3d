/** Enumeration of log contexts. */
export enum ELogContext {
  None,
  All,
  Interaction2d,
  Item,
  Wall,
  Room,
}

/** Enumeration of log levels. */
export enum ELogLevel {
  Information,
  Warning,
  Error,
}

/** Current log level (set to Warning to reduce noise). */
export let currentLogLevel = ELogLevel.Warning;

/** Current log context. */
export let currentLogContext = ELogContext.None;

/** Log a message. */
export function log(
  context: ELogContext,
  level: ELogLevel,
  message: string
): void {
  if (level >= currentLogLevel && (currentLogContext === ELogContext.All || context === currentLogContext)) {
    switch (level) {
      case ELogLevel.Error:
        console.error(`[BP3D] ${message}`);
        break;
      case ELogLevel.Warning:
        console.warn(`[BP3D] ${message}`);
        break;
      default:
        console.log(`[BP3D] ${message}`);
    }
  }
}
