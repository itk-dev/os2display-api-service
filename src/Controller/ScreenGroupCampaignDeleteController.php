<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\ScreenGroupCampaignRepository;
use App\Utils\ValidationUtils;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;

#[AsController]
class ScreenGroupCampaignDeleteController extends AbstractController
{
    public function __construct(
        private readonly ScreenGroupCampaignRepository $screenGroupCampaignRepository,
        private readonly ValidationUtils $validationUtils
    ) {}

    public function __invoke(string $id, string $campaignId): JsonResponse
    {
        $ulid = $this->validationUtils->validateUlid($id);
        $campaignUlid = $this->validationUtils->validateUlid($campaignId);

        $this->screenGroupCampaignRepository->deleteRelations($ulid, $campaignUlid);

        return new JsonResponse(null, \Symfony\Component\HttpFoundation\Response::HTTP_NO_CONTENT);
    }
}
