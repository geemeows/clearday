// Google (Calendar) provider — cron-polled meeting Signals plus decline /
// reschedule capabilities against the Calendar API.

import type { Provider } from "#/features/integrations/provider";
import {
  type DeclineEventParams,
  type DeclineEventResult,
  declineCalendarEvent,
  type RescheduleEventParams,
  type RescheduleEventResult,
  rescheduleCalendarEvent,
} from "#/features/integrations/providers/google/capabilities/calendar-actions";
import {
  exchangeGoogle,
  refreshGoogleToken,
} from "#/features/integrations/providers/google/oauth";
import { pollCalendarSignals } from "#/features/integrations/providers/google/poll";
import { AUTHORIZE_PROVIDERS } from "#/shared/oauth/scopes";

export type GoogleCapabilities = {
  decline: (
    params: DeclineEventParams,
    deps: { fetch: typeof fetch; token: string | null },
  ) => Promise<DeclineEventResult>;
  reschedule: (
    params: RescheduleEventParams,
    deps: { fetch: typeof fetch; token: string | null },
  ) => Promise<RescheduleEventResult>;
};

export type {
  DeclineEventParams,
  DeclineEventResult,
  RescheduleEventParams,
  RescheduleEventResult,
};

export const google: Provider<void, void, GoogleCapabilities> = {
  id: "google",
  authorize: AUTHORIZE_PROVIDERS.google,
  exchange: (code, env, fetchImpl) => exchangeGoogle(code, env, fetchImpl),
  refresh: (refreshToken, env, fetchImpl) =>
    refreshGoogleToken(refreshToken, env, fetchImpl),
  poll: async (token, ctx) => {
    const signals = await pollCalendarSignals(
      token,
      async (url, init) => ctx.fetch(url, init),
      ctx.now,
    );
    return { signals, delta: undefined };
  },
  capabilities: {
    decline: (params, deps) => declineCalendarEvent(params, deps),
    reschedule: (params, deps) => rescheduleCalendarEvent(params, deps),
  },
};
