<?php

declare(strict_types=1);

namespace App\Tests\Controller\Api;

use App\Controller\Api\MediaController;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\Validator\Validator\ValidatorInterface;

class MediaControllerTest extends TestCase
{
    /**
     * When an upload exceeds php-fpm's `post_max_size`, PHP discards the whole
     * body: `$_POST` and `$_FILES` arrive empty even though the client sent a
     * large `Content-Length`. The editor must be told the file is too big, not
     * that the `file` field is missing.
     */
    public function testPostMaxSizeOverflowYieldsRequestEntityTooLarge(): void
    {
        $controller = new MediaController($this->createMock(ValidatorInterface::class), 200);

        $request = Request::create('/v2/media', 'POST',[],[],[],[
            'CONTENT_TYPE' => 'multipart/form-data; boundary=----boundary',
            // Comfortably above any plausible `post_max_size`, so the test does
            // not depend on the container's php.ini.
            'CONTENT_LENGTH' => (string) (8 * 1024 * 1024 * 1024),
            ]);

        try {
            $controller($request);
            $this->fail('Expected an HttpException to be thrown.');
        } catch (HttpException $exception) {
            $this->assertSame(Response::HTTP_REQUEST_ENTITY_TOO_LARGE, $exception->getStatusCode());
            $this->assertStringContainsString('200', $exception->getMessage());
        }
    }

    /**
     * A genuinely malformed request - no file, no oversized body - must keep
     * answering 400 as before.
     */
    public function testMissingFileStillYieldsBadRequest(): void
    {
        $controller = new MediaController($this->createMock(ValidatorInterface::class), 200);

        $request = Request::create('/v2/media', 'POST',['title' => 'A title']);

        $this->expectException(BadRequestHttpException::class);
        $this->expectExceptionMessage('"file" is required');

        $controller($request);
    }
}
