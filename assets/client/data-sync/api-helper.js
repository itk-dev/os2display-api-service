import logger from "../logger/logger";
import appStorage from "../util/app-storage";

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
   * Get result from path.
   *
   * @param {string} path Path to the resource.
   * @returns {Promise<any>} Promise with data.
   */
  async getPath(path) {
    if (!path) {
      throw new Error("No path");
    }

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

        return null;
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

        return null;
      }

      return response.json();
    } catch (err) {
      logger.error(`Failed to fetch: ${this.endpoint + path}`);

      return null;
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
        const responseData = await this.getPath(nextPath);
        pagesFetched += 1;

        // getPath() logs and returns null when a request fails. Give the whole
        // collection up rather than handing back part of it as if it were
        // complete.
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
