<?php

namespace App\Controller;

use ApiPlatform\Core\Bridge\Doctrine\Orm\Paginator;
use App\Repository\ScreenPlaylistRepository;
use App\Utils\ValidationUtils;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\AsController;

#[AsController]
class PlaylistScreenGetController extends AbstractController
{
    public function __construct(
        private ScreenPlaylistRepository $screenPlaylistRepository,
        private ValidationUtils $validationUtils
    ) {
    }

    public function __invoke(Request $request, string $id): Paginator
    {
        $page = (int) $request->query->get('page', '1');
        $itemsPerPage = (int) $request->query->get('itemsPerPage', '10');

        $screenUlidObj = $this->validationUtils->validateUlid($id);

        return $this->screenPlaylistRepository->getSlidePaginator($screenUlidObj, $page, $itemsPerPage);
    }
}
