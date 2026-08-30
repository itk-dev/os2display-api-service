import { createApi } from "@reduxjs/toolkit/query/react";
import clientBaseQuery from "./base-query";

export const clientEmptySplitApi = createApi({
  reducerPath: "clientApi",
  baseQuery: clientBaseQuery,
  // Retain cache entries indefinitely. api-query's query() unsubscribes as soon
  // as it resolves, so every entry would otherwise start ageing immediately, and
  // the window has to stay long for two reasons: entries must outlive the pull
  // interval so relations whose relationsChecksum has not changed are served
  // from cache rather than refetched every cycle, and the cache is what keeps a
  // screen rendering through a network outage.
  //
  // Infinity rather than a number: it is explicitly supported (handleUnsubscribe
  // returns before setting any timer), whereas the previous 2592000 was meant to
  // mirror JWT_SCREEN_REFRESH_TOKEN_TTL at 30 days but was silently clamped to
  // THIRTY_TWO_BIT_MAX_TIMER_SECONDS, about 24.85 days.
  //
  // Staleness is bounded per resource instead, via query()'s maxAge — see the
  // feed fetch in pull-strategy's enrichSlide.
  keepUnusedDataFor: Infinity,
  endpoints: () => ({}),
});
