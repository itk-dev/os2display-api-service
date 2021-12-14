<?php

namespace App\Feed;

use App\Entity\Feed;
use App\Entity\FeedSource;
use FeedIo\Factory;
use FeedIo\Feed\Item;

class RssFeedType extends AbstractFeedType
{
    public function getData(FeedSource $feedSource, Feed $feed): ?array
    {
        $feedIo = Factory::create()->getFeedIo();

        $configuration = $feed->getConfiguration();

        $feedResult = $feedIo->read($configuration['url']);

        $result = [
            'title' => $feedResult->getFeed()->getTitle(),
            'entries' => [],
        ];

        /** @var Item $item */
        foreach ($feedResult->getFeed() as $item) {
            $result['entries'][] = $item->toArray();
        }

        return $result;
    }
}
