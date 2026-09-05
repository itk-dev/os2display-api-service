<?php

declare(strict_types=1);

namespace App\Logger\Processor;

use App\Entity\Interfaces\TenantScopedUserInterface;
use App\Entity\ScreenUser;
use App\Logger\LogField;
use Monolog\LogRecord;
use Monolog\Processor\ProcessorInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Enriches every log record with request and identity context.
 *
 * Field names follow OpenTelemetry semantic conventions (http.request.method,
 * http.route, url.path, client.address, user.id, screen.id, tenant.key).
 * `request_id` is kept as-is. `client.address` is set to the raw client IP here
 * and truncated to a GDPR-safe form by {@see SensitiveDataProcessor}, which runs
 * after this processor.
 */
final readonly class RequestContextProcessor implements ProcessorInterface
{
    public function __construct(
        private RequestStack $requestStack,
        private Security $security,
    ) {}

    public function __invoke(LogRecord $record): LogRecord
    {
        $request = $this->requestStack->getMainRequest();
        if (null !== $request) {
            // No format validation — accept whatever nginx/Traefik passed through.
            $record->extra[LogField::REQUEST_ID] = $request->attributes->get('_request_id')
                ?? $request->headers->get('X-Request-Id');
            // http.route is the matched route's declared path TEMPLATE, never the
            // concrete URL: a request to `GET /v2/screens/01HXYZ…` is logged as
            // `http.route = /v2/screens/{id}` — the entity id never appears in
            // this field (low-cardinality, GDPR-safe; OTel http.route). Only set
            // when a route matched. The concrete id-bearing path is logged
            // separately as url.path below.
            $routeTemplate = $this->routeTemplate($request);
            if (null !== $routeTemplate) {
                $record->extra[LogField::HTTP_ROUTE] = $routeTemplate;
            }
            $record->extra[LogField::HTTP_REQUEST_METHOD] = $request->getMethod();
            $record->extra[LogField::URL_PATH] = $request->getPathInfo();
            // Raw IP; SensitiveDataProcessor truncates it to a GDPR-safe form
            // (except for screen clients, which are outside GDPR — see that class).
            $record->extra[LogField::CLIENT_ADDRESS] = $request->getClientIp();
        }

        // Re-entrancy latch for the identity block below. Identity enrichment
        // touches Doctrine-managed objects, and a lazy load there emits a
        // `database` log record through the DBAL logging middleware, which runs
        // this processor again. That is not merely wasteful: a
        // PersistentCollection initialised re-entrantly is loaded once per
        // nesting level and Doctrine *appends* each load to it, so the owning
        // entity ends up holding one copy of every row per level. The accessors
        // used below are lazy-load-free by construction; this latch keeps that
        // guarantee from depending on it. A method-level static because the class
        // is readonly (which forbids a static property) and the processor is a
        // shared service handling one request at a time anyway.
        static $enriching = false;

        $user = $this->security->getUser();
        if (null !== $user && !$enriching) {
            $enriching = true;

            // Enrichment must never break the request it is annotating. Every
            // identity accessor below can throw — getResolvedActiveTenant() on a
            // screen whose tenant cannot be read, getScreen() on a not-yet-hydrated
            // screen token, getUserIdentifier() on a custom user — so the whole
            // block is guarded. Fields written before a throw are kept (the record
            // is mutated in place); the failing one and any after it are simply
            // left unset.
            try {
                // Screen tokens authenticate as ScreenUser; everything else is a
                // back-office User. Populate screen.id XOR user.id accordingly.
                if ($user instanceof ScreenUser) {
                    $record->extra[LogField::SCREEN_ID] = (string) $user->getScreen()->getId();
                } else {
                    $record->extra[LogField::USER_ID] = $user->getUserIdentifier();
                }

                // Deliberately getResolvedActiveTenant() and not getActiveTenant():
                // the latter falls back to the user's first tenant, which lazy-loads
                // the tenant collection — a database query from inside a log
                // processor, which re-enters this processor and corrupts the
                // collection (see the $enriching docblock). Before a tenant is
                // resolved — on the login request itself, where the user has not
                // picked one yet — the field is simply omitted, which is also more
                // truthful than naming an arbitrary tenant.
                if ($user instanceof TenantScopedUserInterface) {
                    $tenant = $user->getResolvedActiveTenant();
                    if (null !== $tenant) {
                        $record->extra[LogField::TENANT_KEY] = $tenant->getTenantKey();
                    }
                }
            } catch (\Throwable) { // @phpstan-ignore logging.silentCatch (log enrichment must never break the request it annotates; identity accessors fail pre-resolution and simply omit the field)
                // An identity accessor failed (unresolvable tenant, unhydrated
                // screen, …). Keep whatever was set; never break logging.
            } finally {
                $enriching = false;
            }
        }

        return $record;
    }

    /**
     * The matched route's path template (OTel `http.route`), e.g.
     * `/v2/screens/{id}` — never the concrete path with the id. Reconstructed
     * from the request path by substituting the matched route parameters back to
     * their `{name}` placeholders, with the optional API Platform `.{_format}`
     * suffix stripped. Returns null when no route matched, so the field is only
     * present for matched requests (per OTel guidance).
     *
     * This deliberately avoids injecting the router: depending on it forms a
     * circular service graph with the `database` channel logger used by the DBAL
     * connection middleware (processor → router → EntityManager → DBAL middleware
     * → database logger → processor).
     */
    private function routeTemplate(Request $request): ?string
    {
        $routeName = $request->attributes->get('_route');
        if (!is_string($routeName)) {
            return null;
        }

        $params = $request->attributes->get('_route_params');
        if (!is_array($params)) {
            $params = [];
        }

        $path = $request->getPathInfo();
        foreach ($params as $name => $value) {
            // Skip framework params (_format, _locale, …); only real placeholders.
            if (!is_string($name) || str_starts_with($name, '_') || !is_scalar($value)) {
                continue;
            }
            $value = (string) $value;
            if ('' !== $value) {
                $path = str_replace($value, '{'.$name.'}', $path);
            }
        }

        // Strip the optional API Platform format suffix (e.g. `.jsonld`).
        $format = $params['_format'] ?? null;
        if (is_string($format) && '' !== $format) {
            $path = preg_replace('/\.'.preg_quote($format, '/').'$/', '', $path) ?? $path;
        }

        return $path;
    }
}
