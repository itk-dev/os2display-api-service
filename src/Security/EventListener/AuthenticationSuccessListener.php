<?php

declare(strict_types=1);

namespace App\Security\EventListener;

use App\Entity\User;
use App\Security\TenantPayloadBuilder;
use Lexik\Bundle\JWTAuthenticationBundle\Event\AuthenticationSuccessEvent;

/**
 * class AuthenticationSuccessListener.
 *
 * Set "user" and "tenants" in the response body on get token endpoint
 */
class AuthenticationSuccessListener
{
    public function __construct(
        private readonly TenantPayloadBuilder $tenantPayloadBuilder,
    ) {}

    public function onAuthenticationSuccessResponse(AuthenticationSuccessEvent $event): void
    {
        $data = $event->getData();
        $user = $event->getUser();

        if (!$user instanceof User) {
            return;
        }

        $data['user'] = $user;
        $data['tenants'] = $this->tenantPayloadBuilder->build($user);

        $event->setData($data);
    }
}
