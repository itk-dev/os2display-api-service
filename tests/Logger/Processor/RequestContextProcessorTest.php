<?php

declare(strict_types=1);

namespace App\Tests\Logger\Processor;

use App\Entity\ScreenUser;
use App\Entity\Tenant;
use App\Entity\Tenant\Screen;
use App\Entity\User;
use App\Logger\Processor\RequestContextProcessor;
use Monolog\Level;
use Monolog\LogRecord;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\Uid\Ulid;

class RequestContextProcessorTest extends TestCase
{
    public function testNoRequestAndNoUserLeavesRecordUnenriched(): void
    {
        $processor = new RequestContextProcessor(new RequestStack(), $this->security(null));

        $record = $processor($this->record());

        $this->assertArrayNotHasKey('request_id', $record->extra);
        $this->assertArrayNotHasKey('http.route', $record->extra);
        $this->assertArrayNotHasKey('user.id', $record->extra);
        $this->assertArrayNotHasKey('screen.id', $record->extra);
    }

    public function testRequestContextLogsPathTemplateNotConcreteId(): void
    {
        // A concrete item URL carrying a ULID, with the matched route params
        // Symfony sets on the request after routing.
        $request = Request::create('/v2/screens/01HXYZ1234567890ABCDEFGHJK', Request::METHOD_GET);
        $request->attributes->set('_request_id', 'abc123def4567890abc123def4567890');
        $request->attributes->set('_route', 'screen_item');
        $request->attributes->set('_route_params', ['id' => '01HXYZ1234567890ABCDEFGHJK']);
        $stack = new RequestStack();
        $stack->push($request);

        $processor = new RequestContextProcessor($stack, $this->security(null));

        $record = $processor($this->record());

        // 32-char hex request id accepted verbatim — no reformatting/rejection.
        $this->assertSame('abc123def4567890abc123def4567890', $record->extra['request_id']);
        // http.route is the path template — id-free; the ULID is substituted back to {id}.
        $this->assertSame('/v2/screens/{id}', $record->extra['http.route']);
        // url.path keeps the concrete path (incl. the id) — the two are distinct.
        $this->assertSame('/v2/screens/01HXYZ1234567890ABCDEFGHJK', $record->extra['url.path']);
        $this->assertSame('GET', $record->extra['http.request.method']);
        // Raw IP here; truncation is SensitiveDataProcessor's job.
        $this->assertSame('127.0.0.1', $record->extra['client.address']);
    }

    public function testRouteIsUnsetWhenNoRouteMatched(): void
    {
        $request = Request::create('/v2/unmatched', Request::METHOD_GET);
        $stack = new RequestStack();
        $stack->push($request);

        $processor = new RequestContextProcessor($stack, $this->security(null));

        $record = $processor($this->record());

        // No `_route` => no http.route; but the concrete path is still in url.path.
        $this->assertArrayNotHasKey('http.route', $record->extra);
        $this->assertSame('/v2/unmatched', $record->extra['url.path']);
        $this->assertSame('GET', $record->extra['http.request.method']);
    }

    public function testScreenUserPopulatesScreenIdAndTenantNotUserId(): void
    {
        $tenant = $this->createMock(Tenant::class);
        $tenant->method('getTenantKey')->willReturn('Example1');

        $screen = $this->createMock(Screen::class);
        $screen->method('getId')->willReturn(new Ulid());

        $user = $this->createMock(ScreenUser::class);
        $user->method('getScreen')->willReturn($screen);
        $user->method('getResolvedActiveTenant')->willReturn($tenant);

        $processor = new RequestContextProcessor(new RequestStack(), $this->security($user));

        $record = $processor($this->record());

        $this->assertArrayHasKey('screen.id', $record->extra);
        $this->assertArrayNotHasKey('user.id', $record->extra);
        $this->assertSame('Example1', $record->extra['tenant.key']);
    }

    public function testBackOfficeUserPopulatesUserIdNotScreenId(): void
    {
        $tenant = $this->createMock(Tenant::class);
        $tenant->method('getTenantKey')->willReturn('Example1');

        $user = $this->createMock(User::class);
        $user->method('getUserIdentifier')->willReturn('editor@example.com');
        $user->method('getResolvedActiveTenant')->willReturn($tenant);

        $processor = new RequestContextProcessor(new RequestStack(), $this->security($user));

        $record = $processor($this->record());

        $this->assertSame('editor@example.com', $record->extra['user.id']);
        $this->assertArrayNotHasKey('screen.id', $record->extra);
        $this->assertSame('Example1', $record->extra['tenant.key']);
    }

    public function testActiveTenantResolutionFailureDoesNotThrow(): void
    {
        $user = $this->createMock(User::class);
        $user->method('getUserIdentifier')->willReturn('editor@example.com');
        $user->method('getResolvedActiveTenant')->willThrowException(new \InvalidArgumentException('no tenant'));

        $processor = new RequestContextProcessor(new RequestStack(), $this->security($user));

        $record = $processor($this->record());

        $this->assertSame('editor@example.com', $record->extra['user.id']);
        $this->assertArrayNotHasKey('tenant.key', $record->extra);
    }

    /**
     * The processor must never fall back to getActiveTenant(): that accessor
     * resolves "the user's first tenant", which lazy-loads the tenant collection.
     * A query issued from a log processor is logged in turn by the DBAL logging
     * middleware, re-entering the processor while the collection is still marked
     * uninitialised — and Doctrine appends each nested load, leaving the user
     * holding one copy of every tenant per nesting level.
     */
    public function testUnresolvedTenantIsOmittedRatherThanResolved(): void
    {
        $user = $this->createMock(User::class);
        $user->method('getUserIdentifier')->willReturn('editor@example.com');
        $user->method('getResolvedActiveTenant')->willReturn(null);
        $user->expects($this->never())->method('getActiveTenant');

        $processor = new RequestContextProcessor(new RequestStack(), $this->security($user));

        $record = $processor($this->record());

        $this->assertSame('editor@example.com', $record->extra['user.id']);
        $this->assertArrayNotHasKey('tenant.key', $record->extra);
    }

    /**
     * Belt and braces for the same cycle: should an accessor ever reach the
     * database again, the log record it triggers must not run enrichment a
     * second time.
     */
    public function testEnrichmentDoesNotRunReentrantly(): void
    {
        $tenant = $this->createMock(Tenant::class);
        $tenant->method('getTenantKey')->willReturn('Example1');

        $nested = null;
        $user = $this->createMock(User::class);
        $user->method('getUserIdentifier')->willReturn('editor@example.com');

        $processor = new RequestContextProcessor(new RequestStack(), $this->security($user));

        // Stand in for a lazy load that logs: the accessor re-enters the
        // processor before returning.
        $user->method('getResolvedActiveTenant')->willReturnCallback(
            function () use (&$nested, $processor, $tenant) {
                $nested = $processor($this->record());

                return $tenant;
            }
        );

        $record = $processor($this->record());

        // The outer call enriches as usual; the nested one is left untouched.
        $this->assertSame('Example1', $record->extra['tenant.key']);
        $this->assertArrayNotHasKey('user.id', $nested->extra);
        $this->assertArrayNotHasKey('tenant.key', $nested->extra);
    }

    private function record(): LogRecord
    {
        return new LogRecord(new \DateTimeImmutable('2026-06-02T00:00:00+00:00'), 'screen', Level::Info, 'test');
    }

    private function security(?object $user): Security
    {
        $security = $this->createMock(Security::class);
        $security->method('getUser')->willReturn($user);

        return $security;
    }
}
