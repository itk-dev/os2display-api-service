<?php

declare(strict_types=1);

use Rector\CodeQuality\Rector\Class_\InlineConstructorDefaultToPropertyRector;
use Rector\Config\RectorConfig;
use Rector\Doctrine\Set\DoctrineSetList;
use Rector\Php81\Rector\FuncCall\NullToStrictStringFuncCallArgRector;
use Rector\Set\ValueObject\LevelSetList;
use Rector\Symfony\Set\SymfonySetList;

return RectorConfig::configure()
    ->withPaths([
        __DIR__.'/config',
        __DIR__.'/public',
        __DIR__.'/src',
        __DIR__.'/tests',
    ])
    ->withRules([
        InlineConstructorDefaultToPropertyRector::class,
    ])
    // Class references land as `use` statements instead of inline FQCNs, which is
    // what earlier Rector runs left scattered through the entities and controllers
    // (e.g. `#[ORM\Column(type: \Doctrine\DBAL\Types\Types::INTEGER)]`).
    //
    // importShortClasses: false — `@Symfony` does not enable global_namespace_import,
    // so `\DateTime` and friends stay inline, as they are in Symfony itself.
    ->withImportNames(importShortClasses: false)
    ->withSets([
        LevelSetList::UP_TO_PHP_82,
        DoctrineSetList::ANNOTATIONS_TO_ATTRIBUTES,
        // DOCTRINE_DBAL_30, DOCTRINE_ORM_214 and SYMFONY_63 (below) were removed by
        // rector-doctrine/rector-symfony and no longer exist as constants. All three
        // were one-shot migration sets — "upgrade to DBAL 3.0" / "ORM 2.14" /
        // "Symfony 6.3" — already applied to this codebase rather than ongoing quality
        // rules, so there is nothing to carry forward. Their modern replacement is
        // SetList::COMPOSER_BASED, which derives version sets from composer.json;
        // adopting it would change what Rector refactors, so it is left for its own PR.
        DoctrineSetList::DOCTRINE_CODE_QUALITY,
        SymfonySetList::ANNOTATIONS_TO_ATTRIBUTES,
        // SYMFONY_63 was dropped alongside the Doctrine version sets above, for the
        // same reason: it upgraded code *to* Symfony 6.3 and has already been applied.
        SymfonySetList::SYMFONY_CODE_QUALITY,
        SymfonySetList::SYMFONY_CONSTRUCTOR_INJECTION,
    ])
    // The (string) casts Rector wants here would re-introduce the silent
    // null→"" coercion that 987ae75c removed: the title-modifier path is a
    // correctness boundary, and on PCRE error the event is omitted with a
    // log rather than passed through with an unfiltered title.
    ->withSkip([
        NullToStrictStringFuncCallArgRector::class => [
            __DIR__.'/src/Feed/CalendarApiFeedType.php',
        ],
        // PHPStan rule fixtures are hand-crafted inputs that must stay verbatim
        // (e.g. silent-catch.php deliberately leaves the catch variable unused to
        // exercise logging.silentCatch). Rector must not refactor them.
        __DIR__.'/tests/PhpStan/data',
    ]);
