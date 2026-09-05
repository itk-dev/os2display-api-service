<?php

declare(strict_types=1);

namespace App\Tests\Security;

use App\Entity\Tenant;
use App\Entity\User;
use App\Entity\UserRoleTenant;
use App\Security\TenantPayloadBuilder;
use Doctrine\Common\Collections\ArrayCollection;
use PHPUnit\Framework\TestCase;

class TenantPayloadBuilderTest extends TestCase
{
    /**
     * A user's in-memory role-tenant collection can hold repeats even though the
     * table is unique per (user, tenant): a lazy collection initialised
     * re-entrantly is loaded once per nesting level, and Doctrine appends each
     * load. The payload the admin renders must not inherit that.
     */
    public function testDuplicateTenantsCollapseToOneEntry(): void
    {
        $user = $this->user([
            $this->userRoleTenant('ABC'),
            $this->userRoleTenant('XYZ'),
            $this->userRoleTenant('ABC'),
            $this->userRoleTenant('XYZ'),
        ]);

        $payload = new TenantPayloadBuilder()->build($user);

        $this->assertCount(2, $payload);
        $this->assertSame(['ABC', 'XYZ'], $this->tenantKeys($payload));
    }

    public function testDistinctTenantsAreAllKeptInOrder(): void
    {
        $user = $this->user([
            $this->userRoleTenant('ABC'),
            $this->userRoleTenant('DEF'),
            $this->userRoleTenant('XYZ'),
        ]);

        $payload = new TenantPayloadBuilder()->build($user);

        $this->assertSame(['ABC', 'DEF', 'XYZ'], $this->tenantKeys($payload));
    }

    /**
     * Collection::removeElement() unsets by key without reindexing, so a
     * collection that had entries removed during authentication yields a
     * gap-keyed array. Left as-is that serialises to a JSON object, and the
     * admin reads `tenants.length` as undefined and renders no dropdown.
     */
    public function testGapKeyedCollectionIsReindexedIntoAList(): void
    {
        $collection = new ArrayCollection([
            $this->userRoleTenant('ABC'),
            $this->userRoleTenant('DEF'),
            $this->userRoleTenant('XYZ'),
        ]);
        $collection->remove(0);

        $user = $this->createMock(User::class);
        $user->method('getUserRoleTenants')->willReturn($collection);

        $payload = new TenantPayloadBuilder()->build($user);

        $this->assertSame([0, 1], array_keys($payload));
        $this->assertSame(['DEF', 'XYZ'], $this->tenantKeys($payload));
        // The point of the reindex: a JSON array, never `{"1":…,"2":…}`.
        $this->assertStringStartsWith('[', json_encode($payload, JSON_THROW_ON_ERROR));
    }

    public function testEmptyCollectionYieldsAnEmptyList(): void
    {
        $payload = new TenantPayloadBuilder()->build($this->user([]));

        $this->assertSame([], $payload);
        $this->assertSame('[]', json_encode($payload, JSON_THROW_ON_ERROR));
    }

    /**
     * ScreenUser has no UserRoleTenant rows and synthesises plain objects with
     * the same public shape, so the builder must not assume entity accessors.
     */
    public function testPlainObjectEntriesAreSupported(): void
    {
        $screenRoleTenant = new \stdClass();
        $screenRoleTenant->tenantKey = 'ABC';
        $screenRoleTenant->roles = ['ROLE_SCREEN'];

        $user = $this->createMock(User::class);
        $user->method('getUserRoleTenants')->willReturn(
            new ArrayCollection([$screenRoleTenant, $screenRoleTenant])
        );

        $payload = new TenantPayloadBuilder()->build($user);

        $this->assertCount(1, $payload);
        $this->assertSame($screenRoleTenant, $payload[0]);
    }

    /**
     * A role-tenant whose tenant cannot be read carries no key to deduplicate
     * on; dropping or merging such rows would silently lose access entries, so
     * each is kept.
     */
    public function testEntriesWithoutATenantKeyAreKeptSeparately(): void
    {
        $user = $this->user([new UserRoleTenant(), new UserRoleTenant()]);

        $this->assertCount(2, new TenantPayloadBuilder()->build($user));
    }

    /** @param list<object> $userRoleTenants */
    private function user(array $userRoleTenants): User
    {
        $user = $this->createMock(User::class);
        $user->method('getUserRoleTenants')->willReturn(new ArrayCollection($userRoleTenants));

        return $user;
    }

    private function userRoleTenant(string $tenantKey): UserRoleTenant
    {
        $tenant = new Tenant();
        $tenant->setTenantKey($tenantKey);

        return new UserRoleTenant()->setTenant($tenant);
    }

    /**
     * @param list<object> $payload
     *
     * @return list<string|null>
     */
    private function tenantKeys(array $payload): array
    {
        return array_map(
            static fn (object $entry) => $entry instanceof UserRoleTenant
                ? $entry->getTenant()?->getTenantKey()
                : null,
            $payload
        );
    }
}
