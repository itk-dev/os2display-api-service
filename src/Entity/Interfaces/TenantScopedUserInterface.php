<?php

declare(strict_types=1);

namespace App\Entity\Interfaces;

use App\Entity\Tenant;
use Doctrine\Common\Collections\Collection;

interface TenantScopedUserInterface
{
    public function getActiveTenant(): Tenant;

    /**
     * The active tenant if one has already been resolved, without resolving one.
     *
     * Unlike {@see self::getActiveTenant()} this never falls back to "the first
     * tenant the user happens to have", and so never triggers a lazy load of the
     * tenant collection. Callers that run inside logging or other cross-cutting
     * infrastructure must use this: a database query issued from a log processor
     * re-enters the processor through the DBAL logging middleware, and a lazy
     * collection initialised re-entrantly is loaded — and appended to — once per
     * nesting level (see App\Logger\Processor\RequestContextProcessor).
     */
    public function getResolvedActiveTenant(): ?Tenant;

    public function setActiveTenant(Tenant $activeTenant): self;

    public function getTenants(): Collection;

    public function getUserRoleTenants(): Collection;
}
