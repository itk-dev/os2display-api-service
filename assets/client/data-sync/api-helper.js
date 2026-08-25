import logger from "../logger/logger";
import appStorage from "../util/app-storage";

// Statuses that mean "try again later" rather than "this failed".
// 429 is the rate limit response from the reverse proxy, 502/503/504 are
// emitted while the backend is busy or restarting.
const RETRYABLE_STATUSES = [429, 502, 503, 504];

// Delays in ms before attempt 2, 3 and 4. A screen client on a multi region
// layout issues a burst of requests per pull, so a rejected request must be
// spread out rather than repeated immediately.
const RETRY_DELAYS = [250, 500, 1000];

// Backstop so a misbehaving collection cannot page indefinitely. Matches the
// limit used by the admin's get-all-pages helper.
const MAX_PAGES = 100;

class ApiHelper {
  endpoint = "";

  /**
   * Constructor.
   *
   * @param {string} endpoint The API endpoint.
   */
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  /**
   * Wait for the given number of ms.
   *
   * @param {number} ms Milliseconds to wait.
   * @returns {Promise<void>} Promise that resolves when the wait is over.
   */
  static delay(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Number of ms to wait before the given attempt, honouring Retry-After.
   *
   * @param {object} response The response that was rejected.
   * @param {number} attempt Zero based index of the attempt that failed.
   * @returns {number} Milliseconds to wait.
   */
  static retryDelay(response, attempt) {
    const retryAfter = parseInt(
      response?.headers?.get?.("Retry-After") ?? "",
      10,
    );

    if (!Number.isNaN(retryAfter) && retryAfter > 0) {
      return retryAfter * 1000;
    }

    // Add jitter to avoid all regions retrying in lockstep.
    return RETRY_DELAYS[attempt] + Math.floor(Math.random() * 250);
  }

  /**
   * Get result from path.
   *
   * Retryable failures (rate limiting, temporarily unavailable backend) are
   * retried with backoff. Everything else returns null on the first failure.
   *
   * @param {string} path Path to the resource.
   * @returns {Promise<any>} Promise with data.
   */
  async getPath(path) {
    if (!path) {
      throw new Error("No path");
    }

    /* eslint-disable no-await-in-loop */
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      const result = await this.fetchPath(path);

      if (result.retry === false || attempt === RETRY_DELAYS.length) {
        return result.data;
      }

      logger.info(
        `Retrying (status: ${result.status}): ${this.endpoint + path}`,
      );

      await ApiHelper.delay(ApiHelper.retryDelay(result.response, attempt));
    }
    /* eslint-enable no-await-in-loop */

    return null;
  }

  /**
   * Perform a single request against the path.
   *
   * @param {string} path Path to the resource.
   * @returns {Promise<object>} The data, and whether a retry makes sense.
   */
  async fetchPath(path) {
    let response;

    try {
      const url = new URL(window.location.href);
      const previewToken = url.searchParams.get("preview-token");
      const previewTenant = url.searchParams.get("preview-tenant");

      logger.log("info", `Fetching: ${this.endpoint + path}`);

      const token = appStorage.getToken();
      const tenantKey = appStorage.getTenantKey();

      if ((!token || !tenantKey) && (!previewToken || !previewTenant)) {
        logger.error("Token or tenantKey not set.");

        return { data: null, retry: false };
      }

      response = await fetch(this.endpoint + path, {
        headers: {
          authorization: `Bearer ${previewToken ?? token}`,
          "Authorization-Tenant-Key": previewTenant ?? tenantKey,
        },
      });

      if (response.ok === false) {
        // TODO: Change to a better strategy for triggering reauthenticate.
        if (response.status === 401) {
          document.dispatchEvent(new Event("reauthenticate"));
        }

        logger.error(
          `Failed to fetch (status: ${response.status}): ${
            this.endpoint + path
          }`,
        );

        return {
          data: null,
          retry: RETRYABLE_STATUSES.includes(response.status),
          status: response.status,
          response,
        };
      }

      try {
        return { data: await response.json(), retry: false };
      } catch (parseError) {
        // A body we cannot parse will not parse on a retry either.
        logger.error(`Failed to parse response: ${this.endpoint + path}`);

        return { data: null, retry: false };
      }
    } catch (err) {
      logger.error(`Failed to fetch: ${this.endpoint + path}`);

      return { data: null, retry: true, status: null, response: null };
    }
  }

  /**
   * Gets all resources from the given path.
   *
   * Pages by following `hydra:view['hydra:next']`, the same termination the
   * admin uses in components/util/helpers/get-all-pages.js. A missing
   * `hydra:next` always means there is nothing more to fetch: API Platform
   * omits it on the last page, on out-of-range pages, and on single-page
   * collections. Deciding from the links rather than comparing the collected
   * count against `hydra:totalItems` means a count that disagrees with the rows
   * actually returned can no longer produce an endless run of requests.
   *
   * @param {string} path Path to the resources.
   * @param {object} keys Keys that should be passed along with the result.
   * @returns {Promise<*>} Promise with all resources from a path.
   */
  async getAllResultsFromPath(path, keys = {}) {
    const results = [];
    let nextPath = path;
    let pagesFetched = 0;

    try {
      while (nextPath !== null && pagesFetched < MAX_PAGES) {
        // eslint-disable-next-line no-await-in-loop
        const responseData = await this.getPath(nextPath);
        pagesFetched += 1;

        // getPath() logs and returns null when a request fails, after
        // exhausting its retries. Give the whole collection up rather than
        // handing back part of it as if it were complete.
        if (responseData === null) {
          return {};
        }

        const members = responseData["hydra:member"] ?? [];
        results.push(...members);

        // An empty page also stops us, so a collection that offers a next link
        // without delivering members cannot keep the loop alive.
        nextPath =
          members.length === 0
            ? null
            : (responseData["hydra:view"]?.["hydra:next"] ?? null);
      }

      if (nextPath !== null) {
        logger.error(
          `Stopped paginating ${path} after ${MAX_PAGES} pages; results may be incomplete.`,
        );
      }
    } catch (err) {
      // Never let a data-sync failure surface on a screen; log and move on.
      logger.error(`Failed to page through ${path}: ${err.message}`);

      return {};
    }

    return { path, results, keys };
  }
}

export default ApiHelper;
