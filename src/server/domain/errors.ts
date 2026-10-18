export type CommandErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FORBIDDEN' | 'EXTERNAL';

export class CommandError extends Error {
  constructor(public readonly code: CommandErrorCode, message: string) {
    super(message);
    this.name = 'CommandError';
  }
}
