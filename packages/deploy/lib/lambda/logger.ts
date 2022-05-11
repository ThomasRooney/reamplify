import { inspect } from 'util';

export const Level = {
  DEBUG: 1,
  VERBOSE: 2,
  LOG: 3,
  WARN: 4,
  ERROR: 5,
  FATAL: 6,
};

function getLevel(LOG_LEVEL: string = '') {
  const level: keyof typeof Level | string = LOG_LEVEL.toUpperCase();
  if (level in Level) {
    return Level[level as keyof typeof Level];
  }
  return Level.LOG;
}

class Logger {
  private level: number = getLevel(process.env.LOG_LEVEL);

  private static _getLogFn(level: number, levelMsg: string): (message?: any, ...optionalParams: any[]) => void {
    const header = `[${levelMsg}]:`;
    switch (level) {
      default:
      case Level.VERBOSE:
      case Level.LOG:
        return (message, ...optionalParams: any[]) => {
          process.stdout.write(
            header +
              (typeof message !== 'string' ? inspect(message) : message) +
              ' ' +
              optionalParams.map((p) => (typeof p !== 'string' ? inspect(p) : p)).join(' ') +
              '\n'
          );
        };
      case Level.WARN:
        return function (message, ...optionalParams: any[]) {
          console.warn(header, message, ...optionalParams);
        };
      case Level.FATAL:
        return function (message, ...optionalParams: any[]) {
          console.error(header, message, ...optionalParams);
          process.exit(1);
        };
      case Level.ERROR:
        return function (message, ...optionalParams: any[]) {
          console.error(header, message, ...optionalParams);
        };
    }
  }

  public setLevel(level: number) {
    this.level = level;
    process.env.LOG_LEVEL = Object.entries(Level)
      .find(([, v]) => v === level)?.[0]
      ?.toUpperCase();
  }

  async catchFatal<T>(param: () => Promise<T>): Promise<T> {
    try {
      return await param();
    } catch (e) {
      this.error(e);
      throw e;
    }
  }

  private doLog =
    (level: number, levelMsg: string) =>
    (msg?: any, ...optionalParams: any[]): void => {
      if (this.level > level) {
        return;
      }
      const logFn = Logger._getLogFn(level, levelMsg);
      logFn(msg, ...optionalParams);
    };

  public debug = this.doLog(Level.DEBUG, 'DEBUG');
  public log = this.doLog(Level.LOG, 'LOG');
  public verbose = this.doLog(Level.VERBOSE, 'VERBOSE');
  public warn = this.doLog(Level.WARN, 'WARN');
  public error = this.doLog(Level.ERROR, 'ERROR');
  public fatal = this.doLog(Level.FATAL, 'FATAL') as (msg?: any, ...optionalParams: any[]) => never;
}

export default new Logger();
