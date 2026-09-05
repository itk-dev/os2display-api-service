<?php

declare(strict_types=1);

namespace App\Security;

use App\Entity\Interfaces\TenantScopedUserInterface;
use App\Entity\UserRoleTenant;

/**
 * Builds the `tenants` payload shared by the JWT claim and the authentication
 * response body.
 *
 * Both are read by the admin frontend, which stores the array verbatim and
 * renders one dropdown entry per element, so the payload has to be a plain JSON
 * *array* of distinct tenants. Neither property holds for a raw
 * `getUserRoleTenants()->toArray()`:
 *
 * - Duplicates. `UserRoleTenant` rows are unique per (user, tenant) in the
 *   database, but the in-memory collection can still hold repeats — a lazy
 *   collection initialised re-entrantly is appended to once per nesting level.
 * - Gaps. `AzureOidcAuthenticator::cleanUserTenants()` removes role-tenants
 *   during authentication, and `Collection::removeElement()` unsets by key
 *   rather than reindexing, so `toArray()` can return `[1 => …, 2 => …]` — which
 *   `json_encode` emits as an object, leaving the frontend with an undefined
 *   `tenants.length` and an empty dropdown.
 *
 * Deduplicating and reindexing here keeps clients correct regardless of what the
 * collection happens to contain.
 */
final class TenantPayloadBuilder
{
    /**
     * @return list<object> one entry per distinct tenant, in first-seen order
     */
    public function build(TenantScopedUserInterface $user): array
    {
        $tenants = [];

        foreach ($user->getUserRoleTenants() as $index => $userRoleTenant) {
            if (!is_object($userRoleTenant)) {
                continue;
            }

            // Entries whose tenant key cannot be read are kept, each under its own
            // key, so deduplication never collapses unrelated rows into one.
            $tenants[$this->tenantKey($userRoleTenant) ?? 'index:'.$index] = $userRoleTenant;
        }

        return array_values($tenants);
    }

    private function tenantKey(object $userRoleTenant): ?string
    {
        if ($userRoleTenant instanceof UserRoleTenant) {
            return $userRoleTenant->getTenant()?->getTenantKey();
        }

        // ScreenUser has no UserRoleTenant rows and synthesises plain objects
        // with the same public shape instead — see ScreenUser::getUserRoleTenants().
        $tenantKey = get_object_vars($userRoleTenant)['tenantKey'] ?? null;

        return is_string($tenantKey) ? $tenantKey : null;
    }
}
