import type { SignalProvider } from "#/shared/signal";

export class ExchangeError extends Error {
  constructor(
    public readonly provider: SignalProvider,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ExchangeError";
  }
}
