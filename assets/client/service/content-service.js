import sha256 from "crypto-js/sha256";
import Base64 from "crypto-js/enc-base64";
import PullStrategy from "../data-sync/pull-strategy";
import {
  screenForPlaylistPreview,
  screenForSlidePreview,
} from "../util/preview";
import logger from "../logger/logger";
import DataSync from "../data-sync/data-sync";
import ScheduleService from "./schedule-service";
import ClientConfigLoader from "../util/client-config-loader.js";

/**
 * ContentService.
 *
 * The central component responsible for receiving data from DataSync and sending data to the react components.
 */
class ContentService {
  dataSync;

  currentScreen;

  scheduleService;

  screenHash;

  // Regions that have mounted and are listening for their content. Region
  // content is dispatched as a DOM event, so pushing to a region before React
  // has mounted it drops the payload on the floor -- and worse, ScheduleService
  // would record the hash of what it "sent", so the regionReady that follows the
  // mount finds the content unchanged and sends nothing at all. Feeding only
  // regions that have announced themselves keeps a new region's first delivery
  // on the regionReady path, where it has always been.
  readyRegions = new Set();

  /**
   * Constructor.
   */
  constructor() {
    // Setup schedule service.
    this.scheduleService = new ScheduleService();

    this.startSyncing = this.startSyncing.bind(this);
    this.stopSyncHandler = this.stopSyncHandler.bind(this);
    this.startDataSyncHandler = this.startDataSyncHandler.bind(this);
    this.regionReadyHandler = this.regionReadyHandler.bind(this);
    this.regionRemovedHandler = this.regionRemovedHandler.bind(this);
    this.contentHandler = this.contentHandler.bind(this);
    this.start = this.start.bind(this);
  }

  /**
   * Start data synchronization.
   *
   * @param {string} screenPath Path to the screen.
   */
  startSyncing(screenPath) {
    logger.info("Starting data synchronization");

    ClientConfigLoader.loadConfig().then((config) => {
      const dataStrategyConfig = {
        interval: config.pullStrategyInterval,
        endpoint: "",
      };

      if (screenPath) {
        dataStrategyConfig.entryPoint = screenPath;
      }

      this.dataSync = new DataSync(dataStrategyConfig);
      this.dataSync.start();
    });
  }

  /**
   * Stop sync event handler.
   */
  stopSyncHandler() {
    logger.info("Event received: Stop data synchronization");

    if (this.dataSync) {
      logger.info("Stopping data synchronization");
      this.dataSync.stop();
      this.dataSync = null;
    }
  }

  /**
   * Start data event handler.
   *
   * @param {CustomEvent} event
   *   The event.
   */
  startDataSyncHandler(event) {
    const data = event.detail;

    this.stopSyncHandler();

    logger.log(
      "info",
      `Event received: Start data synchronization from ${data?.screenPath}`,
    );
    if (data?.screenPath) {
      logger.info(
        `Event received: Start data synchronization from ${data.screenPath}`,
      );
      this.startSyncing(data.screenPath);
    } else {
      logger.log("error", "Error: screenPath not set.");
    }
  }

  /**
   * New content event handler.
   *
   * @param {CustomEvent} event
   *   The event.
   */
  contentHandler(event) {
    logger.info("Event received: content");

    const data = event.detail;
    this.currentScreen = data.screen;

    // regionData is left out because it reaches the regions through
    // ScheduleService below, not through a re-render. relationsChecksum is left
    // out because it changes whenever *anything* below the screen changes, which
    // made this hash report "the screen changed" on every content edit. What is
    // left answers the only question the hash is for: does the screen itself
    // need re-rendering?
    const { regionData, relationsChecksum, ...screenData } = this.currentScreen;

    const newHash = Base64.stringify(sha256(JSON.stringify(screenData)));

    // TODO: Handle issue where region data is not present for a given region. Remove given region content.

    if (newHash !== this.screenHash) {
      logger.info("Screen has changed. Emitting screen.");
      this.screenHash = newHash;
      ContentService.emitScreen(screenData);
    } else {
      logger.info("Screen has not changed. Not emitting screen.");
    }

    // Unconditional, and deliberately not an `else`. Adding a slide to a
    // playlist changes screen.relationsChecksum.regions but not .layout -- the
    // ScreenLayoutRegions node stores its checksum as a JSON array, so JSON_SET
    // can never write to it and the layout checksum is byte-identical across the
    // edit. So the pull that fetches the new slide re-fetches regionData while
    // layoutData is served from cache *by reference*, leaving the region prop
    // identity unchanged and regionReady silent. Gating this on the screen hash
    // meant that one pull -- the only one carrying the new slide -- delivered it
    // nowhere, and the region waited a whole further pull interval for it.
    this.readyRegions.forEach((regionId) => {
      this.scheduleService.updateRegion(regionId, regionData?.[regionId]);
    });
  }

  /**
   * Region ready handler.
   *
   * @param {CustomEvent} event
   *   The event.
   */
  regionReadyHandler(event) {
    const data = event.detail;
    const regionId = data.id;

    logger.info(`Event received: regionReady for ${regionId}`);

    // Recorded before the guard below: a region that mounts before the first
    // pull lands still has to receive that pull's content.
    this.readyRegions.add(regionId);

    if (this.currentScreen) {
      this.scheduleService.updateRegion(
        regionId,
        this.currentScreen.regionData[regionId],
      );
    }
  }

  /**
   * Region removed handler.
   *
   * @param {CustomEvent} event
   *   The event.
   */
  regionRemovedHandler(event) {
    const data = event.detail;
    const regionId = data.id;

    logger.info(`Event received: regionRemoved for ${regionId}`);

    this.readyRegions.delete(regionId);
    this.scheduleService.regionRemoved(regionId);
  }

  /**
   * Start the engine.
   */
  start() {
    logger.info("Content service started.");

    document.addEventListener("stopDataSync", this.stopSyncHandler);
    document.addEventListener("startDataSync", this.startDataSyncHandler);
    document.addEventListener("content", this.contentHandler);
    document.addEventListener("regionReady", this.regionReadyHandler);
    document.addEventListener("regionRemoved", this.regionRemovedHandler);
    document.addEventListener("startPreview", this.startPreview);
  }

  /**
   * Stop the engine.
   */
  stop() {
    logger.info("Content service stopped.");

    // The regions unmount after this point, so their regionRemoved events have
    // no listener left to clear the set entry.
    this.readyRegions.clear();

    document.removeEventListener("stopDataSync", this.stopSyncHandler);
    document.removeEventListener("startDataSync", this.startDataSyncHandler);
    document.removeEventListener("content", this.contentHandler);
    document.removeEventListener("regionReady", this.regionReadyHandler);
    document.removeEventListener("regionRemoved", this.regionRemovedHandler);
    document.removeEventListener("startPreview", this.startPreview);
  }

  /**
   * Start preview.
   *
   * @param {CustomEvent} event The event.
   */
  async startPreview(event) {
    const data = event.detail;
    const { mode, id } = data;
    logger.log("info", `Starting preview. Mode: ${mode}, ID: ${id}`);

    if (mode === "screen") {
      this.startSyncing(`/v2/screen/${id}`);
    } else if (mode === "playlist") {
      const pullStrategy = new PullStrategy({
        endpoint: "",
      });

      const playlist = await pullStrategy.getPath(`/v2/playlists/${id}`);

      // Paginated collection: fetch every page, not just the first.
      const playlistSlidesResponse = await pullStrategy.getAllResultsFromPath(
        playlist.slides,
      );

      playlist.slidesData = (playlistSlidesResponse.results ?? []).map(
        (playlistSlide) => playlistSlide.slide,
      );

      // eslint-disable-next-line no-restricted-syntax
      for (const slide of playlist.slidesData) {
        // eslint-disable-next-line no-await-in-loop
        await ContentService.attachReferencesToSlide(pullStrategy, slide);
      }

      const screen = screenForPlaylistPreview(playlist);

      document.dispatchEvent(
        new CustomEvent("content", {
          detail: {
            screen,
          },
        }),
      );
    } else if (mode === "slide") {
      const pullStrategy = new PullStrategy({
        endpoint: "",
      });

      const slide = await pullStrategy.getPath(`/v2/slides/${id}`);

      // eslint-disable-next-line no-await-in-loop
      await ContentService.attachReferencesToSlide(pullStrategy, slide);

      const screen = screenForSlidePreview(slide);

      document.dispatchEvent(
        new CustomEvent("content", {
          detail: {
            screen,
          },
        }),
      );
    } else {
      logger.error(`Unsupported preview mode: ${mode}.`);
    }
  }

  static async attachReferencesToSlide(strategy, slide) {
    /* eslint-disable no-param-reassign */
    slide.templateData = await strategy.getTemplateData(slide);
    slide.feedData = await strategy.getFeedData(slide);

    slide.mediaData = {};
    // eslint-disable-next-line no-restricted-syntax
    for (const media of slide.media) {
      // eslint-disable-next-line no-await-in-loop
      slide.mediaData[media] = await strategy.getMediaData(media);
    }

    if (typeof slide.theme === "string" || slide.theme instanceof String) {
      slide.theme = await strategy.getPath(slide.theme);
    }
    /* eslint-enable no-param-reassign */
  }

  /**
   * Emit screen.
   *
   * @param {object} screen
   *   Screen data.
   */
  static emitScreen(screen) {
    logger.info("Emitting screen");

    const event = new CustomEvent("screen", {
      detail: {
        screen,
      },
    });
    document.dispatchEvent(event);
  }
}

export default ContentService;
