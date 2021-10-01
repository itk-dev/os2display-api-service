<?php

namespace App\Tests\Api;

use ApiPlatform\Core\Bridge\Symfony\Bundle\Test\ApiTestCase;
use App\Entity\Media;
use App\Tests\BaseTestTrait;
use Symfony\Component\HttpFoundation\File\UploadedFile;

class MediaTest extends ApiTestCase
{
    use BaseTestTrait;

    public function testGetCollection(): void
    {
        $response = static::createClient()->request('GET', '/v1/media?itemsPerPage=10', ['headers' => ['Content-Type' => 'application/ld+json']]);

        $this->assertResponseIsSuccessful();
        $this->assertResponseHeaderSame('content-type', 'application/ld+json; charset=utf-8');
        $this->assertJsonContains([
            '@context' => '/contexts/Media',
            '@id' => '/v1/media',
            '@type' => 'hydra:Collection',
            'hydra:totalItems' => 100,
            'hydra:view' => [
                '@id' => '/v1/media?itemsPerPage=10&page=1',
                '@type' => 'hydra:PartialCollectionView',
                'hydra:first' => '/v1/media?itemsPerPage=10&page=1',
                'hydra:last' => '/v1/media?itemsPerPage=10&page=10',
                'hydra:next' => '/v1/media?itemsPerPage=10&page=2',
            ],
        ]);

        $this->assertCount(10, $response->toArray()['hydra:member']);

        // @TODO: hydra:member[0].assets: Object value found, but an array is required
//        $this->assertMatchesResourceCollectionJsonSchema(Media::class);
    }

    public function testGetItem(): void
    {
        $client = static::createClient();
        $iri = $this->findIriBy(Media::class, []);

        $client->request('GET', $iri, ['headers' => ['Content-Type' => 'application/ld+json']]);

        $this->assertResponseIsSuccessful();
        $this->assertResponseHeaderSame('content-type', 'application/ld+json; charset=utf-8');
        $this->assertJsonContains([
            '@context' => [
                '@vocab' => 'http://example.com/docs.jsonld#',
                'hydra' => 'http://www.w3.org/ns/hydra/core#',
                'title' => 'Media/title',
                'description' => 'Media/description',
                'license' => 'Media/license',
                'created' => 'Media/created',
                'modified' => 'Media/modified',
                'modifiedBy' => 'Media/modifiedBy',
                'createdBy' => 'Media/createdBy',
                'media' => 'Media/media',
                'assets' => 'Media/assets',
            ],
            '@type' => 'Media',
            '@id' => $iri,
        ]);

        // @TODO: hydra:member[0].assets: Object value found, but an array is required
//        $this->assertMatchesResourceItemJsonSchema(Media::class);
    }

    public function testMediaUpload(): void
    {
        // Move test file content into tmp file as the file upload will remove the source file. WTF.
        $tmpFile = stream_get_meta_data(tmpfile())['uri'];
        file_put_contents($tmpFile, file_get_contents('fixtures/files/test.jpg'));
        $file = new UploadedFile($tmpFile, 'test.jpg');

        $response = static::createClient()->request('POST', '/v1/media', [
            'extra' => [
                'parameters' => [
                    'title' => 'Test media',
                    'description' => 'This is a test media upload',
                    'license' => 'Free CC',
                    'modifiedBy' => 'Test Testersen',
                    'createdBy' => 'Test Testersen',
                ],
                'files' => [
                    'file' => $file,
                ],
            ],
            'headers' => [
                'Content-Type' => 'multipart/form-data',
            ],
        ]);

        $this->assertResponseIsSuccessful();
        $this->assertResponseHeaderSame('content-type', 'application/ld+json; charset=utf-8');
        $this->assertJsonContains([
            '@context' => [
                '@vocab' => 'http://example.com/docs.jsonld#',
                'hydra' => 'http://www.w3.org/ns/hydra/core#',
                'title' => 'Media/title',
                'description' => 'Media/description',
                'license' => 'Media/license',
                'created' => 'Media/created',
                'modified' => 'Media/modified',
                'modifiedBy' => 'Media/modifiedBy',
                'createdBy' => 'Media/createdBy',
                'media' => 'Media/media',
                'assets' => 'Media/assets',
            ],
            '@type' => 'Media',
            'title' => 'Test media',
            'description' => 'This is a test media upload',
            'license' => 'Free CC',
            'modifiedBy' => 'Test Testersen',
            'createdBy' => 'Test Testersen',
            'media' => [],
            'assets' => [
                'type' => 'image/jpeg',
                'dimensions' => [
                    'height' => 800,
                    'width' => 1280,
                ],
                'sha' => '6bad886ed9f0ed053dc0ec69d5fa79a25cfbfccb',
                'size' => 367965,
            ],
        ]);
        $this->assertMatchesRegularExpression('@^/v\d/\w+/([A-Za-z0-9]{26})$@', $response->toArray()['@id']);

        // @TODO: hydra:member[0].assets: Object value found, but an array is required
//        $this->assertMatchesResourceItemJsonSchema(Media::class);
    }
}