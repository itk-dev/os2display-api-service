import logger from "./logger.js";
import { clientStore } from "../redux/store.js";
import { clientApi } from "../redux/enhanced-api.ts";
import defaults from "../util/defaults.js";

/**
 * Dispatch an RTK Query endpoint and return the unwrapped result.
 *
 * @param {string} endpoint The endpoint name.
 * @param {object} args The endpoint args.
 * @param {boolean} forceRefetch Whether to bypass RTK Query cache.
 * @returns {Promise<any>} The result data.
 */
export function query(endpoint, args, forceRefetch = false) {
  const request = clientStore.dispatch(
    clientApi.endpoints[endpoint].initiate(args, { forceRefetch }),
  );

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      request.abort();
      reject(new Error(`Request timeout: ${endpoint}`));
    }, defaults.queryTimeoutDefault);
  });

  return Promise.race([request.unwrap(), timeout])
    .catch((err) => {
      const cached = clientApi.endpoints[endpoint].select(args)(
        clientStore.getState(),
      );
      if (cached?.data) {
        logger.warn(`Using cached data for ${endpoint} after fetch failure.`);
        return cached.data;
      }
      throw err;
    })
    .finally(() => {
      clearTimeout(timeoutId);
      request.unsubscribe();
    });
}

// Backstop so a misbehaving collection cannot page indefinitely. Matches the
// limit used by the admin's get-all-pages helper.
const MAX_PAGES = 100;

/**
 * Fetch all pages from a paginated endpoint.
 *
 * Pages by following `hydra:view['hydra:next']`, the same termination the admin
 * uses in components/util/helpers/get-all-pages.js. A missing `hydra:next`
 * always means there is nothing more to fetch: API Platform omits it on the last
 * page, on out-of-range pages, and on single-page collections. Deciding from the
 * links rather than comparing the collected count against `hydra:totalItems`
 * means a count that disagrees with the rows actually returned can no longer
 * produce an endless run of requests (issue #517).
 *
 * A page that fails gives up the whole collection by rejecting, so a caller can
 * never mistake a truncated result for a complete one.
 *
 * @param {string} endpoint The endpoint name.
 * @param {object} args The endpoint args (page will be added).
 * @param {boolean} forceRefetch Whether to bypass RTK Query cache.
 * @returns {Promise<Array>} All hydra:member results concatenated.
 */
export async function queryAllPages(endpoint, args, forceRefetch = false) {
  let results = [];
  let page = 1;

  do {
    let responseData;

    try {
      responseData = await query(endpoint, { ...args, page }, forceRefetch);
    } catch (err) {
      logger.error(`Failed to fetch all pages for ${endpoint}: ${err.message}`);
      throw err;
    }

    if (responseData === null || responseData === undefined) {
      logger.error(`Failed to fetch page ${page} for ${endpoint}`);
      throw new Error(`Failed to fetch page ${page} for ${endpoint}`);
    }

    const members = responseData["hydra:member"] ?? [];

    // An empty page also stops us, so a collection that offers a next link
    // without delivering members cannot keep the loop alive.
    if (members.length === 0) {
      break;
    }

    results = results.concat(members);

    if (responseData["hydra:view"]?.["hydra:next"]) {
      page += 1;
    } else {
      break;
    }
  } while (page <= MAX_PAGES);

  if (page > MAX_PAGES) {
    logger.warn(`Reached max page limit (${MAX_PAGES}) for ${endpoint}`);
  }

  return results;
}
