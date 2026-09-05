import isPublished from "../util/isPublished";
import logger from "../logger/logger";
import ApiHelper from "./api-helper";
import { cloneDeep } from "lodash";
import ClientConfigLoader from "../util/client-config-loader.js";
import { settleWithConcurrency } from "../util/concurrency.js";

// Maximum requests in flight during a pull. A multi-region layout fans out one
// request per region, playlist, slide, template, media item and feed; sending
// all of them at once is what empties the reverse proxy's rate-limit bucket and
// leaves regions blank (#507). Keeping the burst well under the configured
// burst size means the retry layer rarely has to do anything.
const MAX_CONCURRENT_REQUESTS = 6;

/**
 * PullStrategy.
 *
 * Handles pull strategy.
 */
class PullStrategy {
  lastestScreenData;

  // Helper for all api calls.
  apiHelper;

  // Fetch-interval in ms.
  interval;

  // Path to screen that should be loaded data for.
  entryPoint = "";

  // Screen-level relationsChecksum keys whose data this pull could not fully
  // load. Reset at the start of every getScreen(). Caching the server's fresh
  // checksum for data we fell back on makes the next pull compare equal, take
  // the cache branch, and keep serving the stale content until an editor happens
  // to change something -- the failure mode #507 was about. Storing null instead
  // differs from any real checksum, so the next pull re-fetches.
  staleChecksumKeys = new Set();

  /**
   * Constructor.
   *
   * @param {object} config
   *   The config object.
   */
  constructor(config) {
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.getScreen = this.getScreen.bind(this);

    this.interval = config?.interval ?? 60000 * 5;
    this.entryPoint = config.entryPoint;

    this.apiHelper = new ApiHelper(config.endpoint ?? "");
  }

  /**
   * Gets all campaigns, both from screen and groups.
   *
   * @param {object} screen The screen object to extract campaigns from.
   * @returns {Promise<object>} Array of campaigns (playlists).
   */
  async getCampaignsData(screen) {
    const screenGroupCampaigns = [];

    try {
      // Paginated collection: fetch every page, not just the first.
      const response = await this.apiHelper.getAllResultsFromPath(
        screen.inScreenGroups,
      );

      if (Object.prototype.hasOwnProperty.call(response, "results")) {
        const tasks = response.results.map(
          (group) => () =>
            this.apiHelper.getAllResultsFromPath(group.campaigns),
        );

        const results = await settleWithConcurrency(
          tasks,
          MAX_CONCURRENT_REQUESTS,
        );

        results.forEach((result) => {
          if (result.status === "fulfilled" && result.value?.results) {
            result.value.results.forEach(({ campaign }) => {
              screenGroupCampaigns.push(campaign);
            });

            return;
          }

          this.staleChecksumKeys.add("inScreenGroups");
        });
      } else {
        this.staleChecksumKeys.add("inScreenGroups");
      }
    } catch (err) {
      logger.error(err);
      this.staleChecksumKeys.add("inScreenGroups");
    }

    let screenCampaigns = [];

    try {
      // Paginated collection: fetch every page, not just the first.
      const screenCampaignsResponse =
        await this.apiHelper.getAllResultsFromPath(screen.campaigns);

      if (screenCampaignsResponse.results === undefined) {
        this.staleChecksumKeys.add("campaigns");
      }

      screenCampaigns = (screenCampaignsResponse.results ?? []).map(
        ({ campaign }) => campaign,
      );
    } catch (err) {
      logger.error(err);
      this.staleChecksumKeys.add("campaigns");
    }

    return new Promise((resolve) => {
      resolve([...screenCampaigns, ...screenGroupCampaigns]);
    });
  }

  /**
   * Get slides for regions.
   *
   * @param {Array} regions Paths to regions.
   * @returns {Promise<object>} Regions data.
   */
  async getRegions(regions) {
    const reg = /\/v2\/screens\/.*\/regions\/(?<regionId>.*)\/playlists/;

    // Pair each region id with its request up front. Reading the id back out of
    // a positional index would depend on this list staying 1:1 with `regions`,
    // and mismatched playlists on a region are worse than a missing region.
    const entries = regions
      .map((regionPath) => ({
        regionPath,
        regionId: regionPath?.match(reg)?.groups?.regionId,
      }))
      .filter(({ regionId }) => regionId !== undefined);

    const results = await settleWithConcurrency(
      entries.map(
        ({ regionPath }) =>
          () =>
            this.apiHelper.getAllResultsFromPath(regionPath),
      ),
      MAX_CONCURRENT_REQUESTS,
    );

    const regionData = {};

    results.forEach((result, index) => {
      const { regionId } = entries[index];

      if (result.status === "fulfilled" && result?.value?.path) {
        regionData[regionId] = (result?.value?.results ?? []).map(
          ({ playlist }) => playlist,
        );

        return;
      }

      this.staleChecksumKeys.add("regions");

      // Keep the last known good playlists for this region rather than an empty
      // list. On signage, content that is one pull out of date beats a black
      // region, and a rejected request says nothing about what should be shown.
      const previous = this.lastestScreenData?.regionData?.[regionId];

      if (previous !== undefined) {
        logger.warn(
          `Could not load playlists for region ${regionId}. Keeping the previously loaded content.`,
        );

        regionData[regionId] = previous;

        return;
      }

      // Nothing to fall back to: this is the first pull for the region.
      logger.warn(
        `Could not load playlists for region ${regionId} and have no earlier content for it.`,
      );

      regionData[regionId] = [];
    });

    return regionData;
  }

  /**
   * Get slides for the given regions.
   *
   * @param {object} regions Regions to fetch slides for.
   * @returns {Promise<object>} Promise with slides for the given regions.
   */
  async getSlidesForRegions(regions) {
    const regionData = cloneDeep(regions);
    const entries = [];

    Object.keys(regionData).forEach((regionKey) => {
      Object.keys(regionData[regionKey]).forEach((playlistKey) => {
        entries.push({ regionKey, playlistKey });
      });
    });

    // The widest fan-out in a pull: one request per playlist per region. Bounded
    // so a screen with many regions does not open them all at once (#507).
    const results = await settleWithConcurrency(
      entries.map(
        ({ regionKey, playlistKey }) =>
          () =>
            this.apiHelper.getAllResultsFromPath(
              regionData[regionKey][playlistKey].slides,
            ),
      ),
      MAX_CONCURRENT_REQUESTS,
    );

    results.forEach((result, index) => {
      const { regionKey, playlistKey } = entries[index];

      const playlist = regionData[regionKey][playlistKey];

      if (
        result.status !== "fulfilled" ||
        result.value?.results === undefined
      ) {
        logger.warn(
          `Could not load slides for playlist ${playlistKey} in region ${regionKey}.`,
        );

        this.staleChecksumKeys.add("regions");

        // Carry the previous pull's slides over. Leaving slidesData alone only
        // preserves anything when getRegions() handed us its own fallback
        // object; a playlist that came straight from the API has no slidesData
        // at all, so doing nothing here empties the region -- the black screen
        // the fallback above exists to avoid. Matched by playlist id rather than
        // position, because a region's playlists can be reordered between pulls.
        const previous = this.lastestScreenData?.regionData?.[regionKey]?.find(
          (candidate) => candidate?.["@id"] === playlist?.["@id"],
        );

        if (previous?.slidesData !== undefined) {
          playlist.slidesData = previous.slidesData;
        }

        return;
      }

      playlist.slidesData = result.value.results.map(
        (playlistSlide) => playlistSlide.slide,
      );
    });

    return regionData;
  }

  /**
   * Fetch screen.
   *
   * @param {string} screenPath Path to the screen.
   */
  async getScreen(screenPath) {
    let screen;

    this.staleChecksumKeys.clear();

    // Fetch screen
    try {
      screen = await this.apiHelper.getPath(screenPath);
    } catch (err) {
      logger.warn(
        `Screen (${screenPath}) not loaded. Aborting content update.`,
      );

      return;
    }

    const config = await ClientConfigLoader.loadConfig();
    const relationChecksumEnabled = config.relationsChecksumEnabled;

    if (screen === null) {
      logger.warn(`Screen (${screenPath}) not loaded`);
      return;
    }

    const newScreen = cloneDeep(screen);

    newScreen.hasActiveCampaign = false;

    const newScreenChecksums = newScreen?.relationsChecksum ?? [];
    const oldScreenChecksums =
      this.lastestScreenData?.relationsChecksum ?? null;

    if (
      relationChecksumEnabled === false ||
      oldScreenChecksums === null ||
      oldScreenChecksums?.campaigns !== newScreenChecksums?.campaigns ||
      oldScreenChecksums?.inScreenGroups !== newScreenChecksums?.inScreenGroups
    ) {
      logger.info(`Fetching campaigns.`);
      newScreen.campaignsData = await this.getCampaignsData(newScreen);
    } else {
      logger.info(`Campaigns data loaded from cache.`);
      newScreen.campaignsData = this.lastestScreenData.campaignsData;
    }

    if (newScreen.campaignsData.length > 0) {
      newScreen.campaignsData.forEach(({ published }) => {
        if (isPublished(published)) {
          newScreen.hasActiveCampaign = true;
        }
      });
    }

    // With active campaigns, we override region/layout values.
    if (newScreen.hasActiveCampaign) {
      logger.info(`Has active campaign.`);

      // Create ulid to connect the campaign with the regions/playlists.
      const campaignRegionId = "01G112XBWFPY029RYFB8X2H4KD";

      // Campaigns are always in full screen layout, for simplicity.
      newScreen.layoutData = {
        grid: {
          rows: 1,
          columns: 1,
        },
        regions: [
          {
            "@id": `/v2/layouts/regions/${campaignRegionId}`,
            gridArea: ["a"],
          },
        ],
      };

      newScreen.regionData = {};
      newScreen.regionData[campaignRegionId] = newScreen.campaignsData;
      newScreen.regions = [
        `/v2/screens/01FV9K4K0Y0X0K1J88SQ6B64VT/regions/${campaignRegionId}/playlists`,
      ];
      newScreen.regionData = await this.getSlidesForRegions(
        newScreen.regionData,
      );
    } else {
      logger.info(`Has no active campaign.`);

      // Get layout: Defines layout and regions.
      if (
        relationChecksumEnabled === false ||
        this.lastestScreenData?.hasActiveCampaign ||
        oldScreenChecksums === null ||
        oldScreenChecksums?.layout !== newScreenChecksums?.layout
      ) {
        logger.info(`Fetching layout.`);
        newScreen.layoutData = await this.apiHelper.getPath(newScreen.layout);

        // Screen renders its regions from layoutData, so a null one is a blank
        // screen. Fall back to the last known good layout, and do not let this
        // pull cache the checksum that says we have it.
        if (newScreen.layoutData === null) {
          logger.warn(
            `Layout (${newScreen.layout}) not loaded. Keeping the previously loaded layout.`,
          );

          newScreen.layoutData = this.lastestScreenData?.layoutData ?? null;
          this.staleChecksumKeys.add("layout");
        }
      } else {
        // Get layout: Defines layout and regions.
        logger.info(`Layout loaded from cache.`);
        newScreen.layoutData = this.lastestScreenData.layoutData;
      }

      // Fetch regions playlists: Yields playlists of slides for the regions
      if (
        relationChecksumEnabled === false ||
        this.lastestScreenData?.hasActiveCampaign ||
        oldScreenChecksums === null ||
        oldScreenChecksums?.regions !== newScreenChecksums?.regions
      ) {
        logger.info(`Fetching regions and slides for regions.`);
        const regions = await this.getRegions(newScreen.regions);
        newScreen.regionData = await this.getSlidesForRegions(regions);
      } else {
        logger.info(`Regions and slides for regions loaded from cache.`);
        newScreen.regionData = this.lastestScreenData.regionData;
      }
    }

    // Cached data.
    const fetchedTemplates = {};
    const fetchedMedia = {};

    // Iterate all slides and load required relations.
    const { regionData } = newScreen;
    /* eslint-disable no-restricted-syntax,no-await-in-loop */
    for (const regionKey of Object.keys(regionData)) {
      const regionDataEntry = regionData[regionKey];

      for (const playlistKey of Object.keys(regionDataEntry)) {
        const dataEntryPlaylist = regionDataEntry[playlistKey];
        // A playlist whose slides request failed has no slidesData. Without
        // this guard the whole pull rejects and every region goes blank.
        const dataEntrySlidesData = dataEntryPlaylist.slidesData ?? {};

        for (const slideKey of Object.keys(dataEntrySlidesData)) {
          const slide = cloneDeep(dataEntrySlidesData[slideKey]);

          // Find the slide in previous data for comparing relationsChecksum
          // values. Every step is optional: a playlist whose slides request
          // failed carries no slidesData at all, and reading through it
          // unguarded threw the whole pull away on the following pull.
          const previousSlide =
            this.lastestScreenData?.regionData?.[regionKey]?.[playlistKey]
              ?.slidesData?.[slideKey] ?? {};

          const newSlideChecksums = slide.relationsChecksum ?? [];
          const oldSlideChecksums = previousSlide?.relationsChecksum ?? null;

          // Fetch template if it has changed.
          if (
            relationChecksumEnabled === false ||
            oldSlideChecksums === null ||
            newSlideChecksums.templateInfo !== oldSlideChecksums.templateInfo
          ) {
            const templatePath = slide.templateInfo["@id"];

            // Load template into slide.templateData.
            if (
              Object.prototype.hasOwnProperty.call(
                fetchedTemplates,
                templatePath,
              )
            ) {
              slide.templateData = fetchedTemplates[templatePath];
            } else {
              logger.info(`Fetching template data.`);
              const templateData = await this.apiHelper.getPath(templatePath);
              slide.templateData = templateData;

              if (templateData !== null) {
                fetchedTemplates[templatePath] = templateData;
              }
            }
          } else {
            logger.info(`Template data loaded from cache.`);
            slide.templateData = previousSlide.templateData;
          }

          // A slide cannot work without templateData. Mark as invalid.
          if (slide.templateData === null) {
            logger.warn(
              `Template (${slide.templateInfo["@id"]}) not loaded, slideId: ${slide["@id"]}`,
            );
            slide.invalid = true;

            // Without this the failure is cached as a success: the next pull
            // finds the checksum unchanged, loads the template "from cache",
            // and the slide stays invalid for as long as nobody edits it.
            slide.relationsChecksum = {
              ...slide.relationsChecksum,
              templateInfo: null,
            };
          }

          // Fetch media if it has changed.
          if (
            relationChecksumEnabled === false ||
            oldSlideChecksums === null ||
            newSlideChecksums.media !== oldSlideChecksums.media
          ) {
            const nextMediaData = {};
            let mediaMissing = false;

            for (const mediaId of slide.media) {
              if (Object.prototype.hasOwnProperty.call(fetchedMedia, mediaId)) {
                nextMediaData[mediaId] = fetchedMedia[mediaId];
              } else {
                logger.info(`Fetching media data.`);
                const mediaData = await this.apiHelper.getPath(mediaId);
                nextMediaData[mediaId] = mediaData;

                if (mediaData !== null) {
                  fetchedMedia[mediaId] = mediaData;
                } else {
                  mediaMissing = true;
                }
              }
            }

            slide.mediaData = nextMediaData;

            // Same reasoning as the template above: a media item we could not
            // load must not be cached as loaded, or the slide renders without it
            // until someone edits the slide.
            if (mediaMissing) {
              slide.relationsChecksum = {
                ...slide.relationsChecksum,
                media: null,
              };
            }
          } else {
            logger.info(`Media data loaded from cache.`);
            slide.mediaData = previousSlide.mediaData;
          }

          // Fetch feed.
          if (slide?.feed?.feedUrl !== undefined) {
            logger.info(`Fetching feed data.`);
            slide.feedData = await this.apiHelper.getPath(slide.feed.feedUrl);
          }

          dataEntrySlidesData[slideKey] = slide;
        }
      }
    }
    /* eslint-enable no-restricted-syntax,no-await-in-loop */

    // Anything this pull fell back on keeps a null checksum in the cache, so the
    // next pull re-fetches it instead of trusting data it never received. Only
    // the cache is affected -- the event below still carries the last known good
    // content, so a transient failure never blanks a screen.
    if (this.staleChecksumKeys.size > 0) {
      newScreen.relationsChecksum = { ...newScreen.relationsChecksum };

      this.staleChecksumKeys.forEach((key) => {
        newScreen.relationsChecksum[key] = null;
      });
    }

    this.lastestScreenData = newScreen;

    // Deliver result to rendering
    const event = new CustomEvent("content", {
      detail: {
        screen: newScreen,
      },
    });
    document.dispatchEvent(event);
  }

  getPath(id) {
    return this.apiHelper.getPath(id);
  }

  getAllResultsFromPath(path, keys = {}) {
    return this.apiHelper.getAllResultsFromPath(path, keys);
  }

  async getTemplateData(slide) {
    return new Promise((resolve) => {
      const templatePath = slide.templateInfo["@id"];

      this.apiHelper.getPath(templatePath).then((data) => {
        resolve(data);
      });
    });
  }

  async getFeedData(slide) {
    return new Promise((resolve) => {
      if (!slide?.feed?.feedUrl) {
        resolve([]);
      } else {
        this.apiHelper.getPath(slide.feed.feedUrl).then((data) => {
          resolve(data);
        });
      }
    });
  }

  async getMediaData(media) {
    return new Promise((resolve) => {
      this.apiHelper.getPath(media).then((data) => {
        resolve(data);
      });
    });
  }

  /**
   * Start the data synchronization.
   */
  start() {
    // Pull now.
    this.getScreen(this.entryPoint)
      .catch((err) => {
        // A failed first pull must not stop the poll interval from being
        // scheduled, or the screen stays dead until it is reloaded.
        logger.error(err);
      })
      .finally(() => {
        // Make sure nothing is running.
        this.stop();

        // Start interval for pull periodically. Each pull catches for the same
        // reason the first one does: an unhandled rejection here is invisible on
        // a screen nobody is looking at.
        this.activeInterval = setInterval(
          () =>
            this.getScreen(this.entryPoint).catch((err) => {
              logger.error(err);
            }),
          this.interval,
        );
      });
  }

  /**
   * Stop the data synchronization.
   */
  stop() {
    if (this.activeInterval !== undefined) {
      clearInterval(this.activeInterval);
      delete this.activeInterval;
    }
  }
}

export default PullStrategy;
