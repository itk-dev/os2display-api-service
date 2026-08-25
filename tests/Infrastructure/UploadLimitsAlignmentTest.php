<?php

declare(strict_types=1);

namespace App\Tests\Infrastructure;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Yaml\Yaml;

/**
 * The advertised upload limit (`MEDIA_MAX_UPLOAD_SIZE_MB`, shown verbatim in the
 * admin dropzone help text) is only real if nginx and php-fpm let a body that
 * size through. Any layer left below it turns into an unhelpful 413/400 for the
 * editor long before the Symfony validator gets a say.
 */
class UploadLimitsAlignmentTest extends TestCase
{
    private const PROJECT_DIR = __DIR__.'/../..';

    public function testDevStackAllowsTheAdvertisedUploadSize(): void
    {
        $maxUploadBytes = $this->advertisedMaxUploadBytes();
        $compose = Yaml::parseFile(self::PROJECT_DIR.'/docker-compose.yml');

        $nginx = $this->environment($compose['services']['nginx']['environment'] ?? []);
        $phpfpm = $this->environment($compose['services']['phpfpm']['environment'] ?? []);

        $this->assertLimitsAreAligned($maxUploadBytes, $nginx, $phpfpm, 'docker-compose.yml');
    }

    public function testShippedImagesAllowTheAdvertisedUploadSize(): void
    {
        $maxUploadBytes = $this->advertisedMaxUploadBytes();

        $nginx = $this->dockerfileEnvironment(self::PROJECT_DIR.'/infrastructure/nginx/Dockerfile');
        $phpfpm = $this->dockerfileEnvironment(self::PROJECT_DIR.'/infrastructure/display-api-service/Dockerfile');

        $this->assertLimitsAreAligned($maxUploadBytes, $nginx, $phpfpm, 'infrastructure Dockerfiles');
    }

    /**
     * @param array<string, string> $nginx
     * @param array<string, string> $phpfpm
     */
    private function assertLimitsAreAligned(int $maxUploadBytes, array $nginx, array $phpfpm, string $where): void
    {
        $this->assertArrayHasKey('NGINX_MAX_BODY_SIZE', $nginx, sprintf('NGINX_MAX_BODY_SIZE must be set in %s.', $where));
        $this->assertArrayHasKey('PHP_UPLOAD_MAX_FILESIZE', $phpfpm, sprintf('PHP_UPLOAD_MAX_FILESIZE must be set in %s rather than left to the base image default.', $where));
        $this->assertArrayHasKey('PHP_POST_MAX_SIZE', $phpfpm, sprintf('PHP_POST_MAX_SIZE must be set in %s rather than left to the base image default.', $where));

        $uploadMaxFilesize = $this->toBytes($phpfpm['PHP_UPLOAD_MAX_FILESIZE']);
        $postMaxSize = $this->toBytes($phpfpm['PHP_POST_MAX_SIZE']);

        $this->assertGreaterThanOrEqual($maxUploadBytes, $uploadMaxFilesize, sprintf('PHP_UPLOAD_MAX_FILESIZE in %s is below MEDIA_MAX_UPLOAD_SIZE_MB.', $where));
        $this->assertGreaterThan($uploadMaxFilesize, $postMaxSize, sprintf('PHP_POST_MAX_SIZE in %s must exceed PHP_UPLOAD_MAX_FILESIZE to leave room for the multipart envelope.', $where));
        $this->assertGreaterThanOrEqual($maxUploadBytes, $this->toBytes($nginx['NGINX_MAX_BODY_SIZE']), sprintf('NGINX_MAX_BODY_SIZE in %s is below MEDIA_MAX_UPLOAD_SIZE_MB.', $where));
    }

    private function advertisedMaxUploadBytes(): int
    {
        $env = file_get_contents(self::PROJECT_DIR.'/.env');
        $this->assertIsString($env);
        $this->assertSame(1, preg_match('/^MEDIA_MAX_UPLOAD_SIZE_MB=(\d+)$/m', $env, $matches), 'MEDIA_MAX_UPLOAD_SIZE_MB must be documented in .env.');

        return (int) $matches[1] * 1024 * 1024;
    }

    /**
     * Compose accepts both the `KEY: value` map form and the `- KEY=value` list form.
     *
     * @param array<int|string, string> $environment
     *
     * @return array<string, string>
     */
    private function environment(array $environment): array
    {
        $parsed = [];
        foreach ($environment as $key => $value) {
            if (is_int($key)) {
                [$key, $value] = array_pad(explode('=', $value, 2), 2, '');
            }
            $parsed[$key] = $value;
        }

        return $parsed;
    }

    /**
     * @return array<string, string>
     */
    private function dockerfileEnvironment(string $path): array
    {
        $dockerfile = file_get_contents($path);
        $this->assertIsString($dockerfile);

        // Unfold `ENV A=1 \<newline>    B=2` into a single line before matching.
        $dockerfile = preg_replace('/\\\\\s*\n\s*/', ' ', $dockerfile) ?? '';

        $parsed = [];
        foreach (explode("\n", $dockerfile) as $line) {
            if (!str_starts_with(trim($line), 'ENV ')) {
                continue;
            }
            preg_match_all('/([A-Z0-9_]+)=("[^"]*"|\S+)/', $line, $matches, PREG_SET_ORDER);
            foreach ($matches as $match) {
                $parsed[$match[1]] = trim($match[2], '"');
            }
        }

        return $parsed;
    }

    private function toBytes(string $value): int
    {
        $value = trim($value);
        $this->assertSame(1, preg_match('/^(\d+)([kmg]?)$/i', $value, $matches), sprintf('Cannot parse size "%s".', $value));

        return (int) $matches[1] * match (strtolower($matches[2])) {
            'k' => 1024,
            'm' => 1024 * 1024,
            'g' => 1024 * 1024 * 1024,
            default => 1,
        };
    }
}
