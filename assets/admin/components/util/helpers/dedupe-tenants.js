/**
 * Reduce a tenant list to one entry per tenantKey, keeping first-seen order.
 *
 * The backend deduplicates the `tenants` payload it issues, but the admin also
 * rehydrates tenants from localStorage, where a list stored by an older release
 * can still hold repeats. Deduplicating on ingest rather than at render keeps the
 * `tenants.length === 1` branches (which decide whether to show a tenant picker
 * at all) honest, and heals a stale session without forcing a re-login.
 *
 * @param {Array} tenants - Tenants as received from the API or localStorage.
 * @returns {Array} Distinct tenants; empty when the input is not an array.
 */
function dedupeTenants(tenants) {
  if (!Array.isArray(tenants)) {
    return [];
  }

  const seen = new Set();

  return tenants.filter(({ tenantKey }) => {
    if (seen.has(tenantKey)) {
      return false;
    }

    seen.add(tenantKey);

    return true;
  });
}

export default dedupeTenants;
