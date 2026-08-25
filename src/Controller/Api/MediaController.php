<?php

declare(strict_types=1);

namespace App\Controller\Api;

use ApiPlatform\Validator\Exception\ValidationException;
use App\Entity\Tenant\Media;
use App\Exceptions\MediaException;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[AsController]
class MediaController extends AbstractController
{
    public function __construct(
        private readonly ValidatorInterface $validator,
        private readonly int $mediaMaxUploadSizeMb,
    ) {}

    /**
     * @throws MediaException
     */
    public function __invoke(Request $request): Media
    {
        $uploadedFile = $request->files->get('file');
        if (!$uploadedFile) {
            // A body larger than php-fpm's `post_max_size` is discarded wholesale by
            // PHP: both bags arrive empty even though the client announced a large
            // Content-Length. Without this the editor gets a 400 about a missing
            // field, which says nothing about the actual problem.
            if ($this->exceedsPostMaxSize($request)) {
                throw new HttpException(
                    Response::HTTP_REQUEST_ENTITY_TOO_LARGE,
                    sprintf('The uploaded file exceeds the maximum allowed upload size of %d MB.', $this->mediaMaxUploadSizeMb)
                );
            }

            throw new BadRequestHttpException('"file" is required');
        }

        $title = $this->getRequestParameter($request, 'title');
        $description = $this->getRequestParameter($request, 'description');
        $license = $this->getRequestParameter($request, 'license');

        $media = new Media();
        $media
            ->setFile($uploadedFile)
            ->setTitle($title)
            ->setDescription($description)
            ->setLicense($license)
        ;

        // API Platform skips its built-in validation pipeline when `deserialize: false`
        // is set on the operation, so we re-trigger entity-level constraints here.
        // The size limit lives on the `#[MediaMaxUploadSize]` attribute on Media::$file.
        $violations = $this->validator->validate($media);
        if (count($violations) > 0) {
            throw new ValidationException($violations);
        }

        // Note that the extra information about the uploaded file is added in the MediaDoctrineEventListener because
        // the file does not exist on disk before this point.
        return $media;
    }

    private function exceedsPostMaxSize(Request $request): bool
    {
        if ($request->files->count() > 0 || $request->request->count() > 0) {
            return false;
        }

        $postMaxSize = $this->toBytes((string) ini_get('post_max_size'));
        if ($postMaxSize <= 0) {
            // 0 or an empty value means "unlimited" in php.ini.
            return false;
        }

        return (int) $request->headers->get('CONTENT_LENGTH', '0') > $postMaxSize;
    }

    private function toBytes(string $value): int
    {
        $value = trim($value);
        if (1 !== preg_match('/^(\d+)([kmg]?)$/i', $value, $matches)) {
            return 0;
        }

        return (int) $matches[1] * match (strtolower($matches[2])) {
            'k' => 1024,
            'm' => 1024 * 1024,
            'g' => 1024 * 1024 * 1024,
            default => 1,
        };
    }

    /**
     * @throws MediaException
     */
    private function getRequestParameter(Request $request, string $key): string
    {
        if (!$request->request->has($key)) {
            throw new MediaException(sprintf('Missing request parameter: %s', $key));
        }

        return strval($request->request->get($key));
    }
}
