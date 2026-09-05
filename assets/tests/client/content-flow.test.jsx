import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect, useState } from "react";
import {
  render,
  act,
  cleanup,
  screen as testScreen,
} from "@testing-library/react";

const { mockGetPath, mockGetAllResultsFromPath, slideDoneCallbacks } =
  vi.hoisted(() => ({
    mockGetPath: vi.fn(),
    mockGetAllResultsFromPath: vi.fn(),
    slideDoneCallbacks: new Map(),
  }));

vi.mock("../../client/logger/logger", () => ({
  default: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The only seam that is stubbed. Everything below it -- PullStrategy,
// ContentService, ScheduleService, Screen, Region, Slide -- is the real code,
// wired together by the real DOM events, because the bug this file exists for
// lived in the seams between those layers and every one of them looked correct
// on its own.
vi.mock("../../client/data-sync/api-helper", () => ({
  default: vi.fn().mockImplementation(function ApiHelperStub() {
    this.getPath = mockGetPath;
    this.getAllResultsFromPath = mockGetAllResultsFromPath;
  }),
}));

vi.mock("../../client/util/client-config-loader.js", () => ({
  default: {
    loadConfig: () =>
      Promise.resolve({
        pullStrategyInterval: 1000 * 60 * 60,
        schedulingInterval: 1000 * 60 * 60,
        relationsChecksumEnabled: true,
      }),
  },
}));

// Templates are stubbed down to "I am on screen" plus the slideDone handle, so
// the test can drive the rotation without depending on any real template's
// timing. How a slide renders is not what this file is about.
vi.mock("../../shared/slide-utils/templates.js", () => ({
  renderSlide: (slide, run, slideDone) => {
    slideDoneCallbacks.set(slide["@id"], () => slideDone(slide));

    return <div data-testid={`slide-${slide["@id"]}`} />;
  },
  getConfig: () => ({}),
}));

vi.mock("../../client/components/region.scss", () => ({}));
vi.mock("../../client/components/slide.scss", () => ({}));
vi.mock("../../client/components/screen.scss", () => ({}));
vi.mock("../../client/components/touch-region.scss", () => ({}));

import PullStrategy from "../../client/data-sync/pull-strategy";
import ContentService from "../../client/service/content-service";
import Screen from "../../client/components/screen.jsx";
import { MIN_SLIDE_DWELL_MS } from "../../client/components/slide.jsx";

// Drives Slide's dwell floor, see beforeEach.
let guardClock = 0;

const SCREEN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const REGION_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const LAYOUT = "/v2/layouts/01CRZ3NDEKTSV4RRFFQ69G5FAV";
const TEMPLATE = "/v2/templates/01DRZ3NDEKTSV4RRFFQ69G5FAV";
const PLAYLIST = "/v2/playlists/01ERZ3NDEKTSV4RRFFQ69G5FAV";

const screenPath = `/v2/screens/${SCREEN_ID}`;
const regionPath = `${screenPath}/regions/${REGION_ID}/playlists`;
const playlistSlidesPath = `${PLAYLIST}/slides`;

/**
 * Build a slide as the API returns it.
 *
 * @param {string} id - The slide ulid.
 * @returns {object} The slide.
 */
function createSlide(id) {
  return {
    "@id": `/v2/slides/${id}`,
    "@type": "Slide",
    title: id,
    published: { from: null, to: null },
    media: [],
    content: {},
    templateInfo: { "@id": TEMPLATE, options: {} },
    relationsChecksum: { templateInfo: "tmpl-1", media: "media-0" },
  };
}

/**
 * Build the screen resource.
 *
 * @param {string} regionsChecksum - The `regions` relations checksum. Changing
 *   it is how the API tells the client the region content moved.
 * @returns {object} The screen.
 */
function createScreen(regionsChecksum) {
  return {
    "@id": screenPath,
    "@type": "Screen",
    title: "Flow test screen",
    layout: LAYOUT,
    regions: [regionPath],
    campaigns: `${screenPath}/campaigns`,
    inScreenGroups: `${screenPath}/screen-groups`,
    // Only `regions` moves when a slide is added to a playlist: the layout's
    // checksum is byte-identical across that edit, which is exactly why the
    // client cannot rely on a layout re-fetch to notice new content.
    relationsChecksum: {
      campaigns: "campaigns-1",
      inScreenGroups: "groups-1",
      layout: "layout-1",
      regions: regionsChecksum,
    },
  };
}

const layout = {
  "@id": LAYOUT,
  "@type": "ScreenLayout",
  grid: { rows: 1, columns: 1 },
  regions: [
    {
      "@id": `/v2/layouts/regions/${REGION_ID}`,
      "@type": "ScreenLayoutRegions",
      gridArea: ["a"],
    },
  ],
};

const template = { "@id": TEMPLATE, resources: { component: "image-text" } };

let slidesInPlaylist = [];
let regionsChecksum = "regions-1";

/**
 * Wire the mocked ApiHelper to the current fixture state.
 */
function primeApi() {
  mockGetPath.mockImplementation((path) => {
    if (path === screenPath) {
      return Promise.resolve(createScreen(regionsChecksum));
    }

    if (path === LAYOUT) {
      // A fresh object every time, mirroring a real fetch. The client is
      // expected to reuse the *cached* one while the layout checksum holds, so
      // this must not be what makes the test pass.
      return Promise.resolve(structuredClone(layout));
    }

    if (path === TEMPLATE) {
      return Promise.resolve(template);
    }

    return Promise.resolve(null);
  });

  mockGetAllResultsFromPath.mockImplementation((path) => {
    if (path === regionPath) {
      return Promise.resolve({
        path,
        keys: {},
        results: [
          {
            playlist: {
              "@id": PLAYLIST,
              "@type": "Playlist",
              title: "Flow test playlist",
              published: { from: null, to: null },
              schedules: [],
              slides: playlistSlidesPath,
            },
          },
        ],
      });
    }

    if (path === playlistSlidesPath) {
      return Promise.resolve({
        path,
        keys: {},
        results: slidesInPlaylist.map((slide) => ({ slide })),
      });
    }

    // Campaigns and screen groups: present but empty.
    return Promise.resolve({ path, keys: {}, results: [] });
  });
}

/**
 * Render the screen the way App does, driven by the `screen` event.
 *
 * @returns {object} The render result.
 */
function renderClient() {
  /**
   * Stand-in for App: the only thing Region's delivery depends on is that a
   * `screen` event re-renders Screen with the emitted data.
   *
   * @returns {object} The component.
   */
  function ClientHarness() {
    const [screenData, setScreenData] = useState(null);

    useEffect(() => {
      /**
       * Handle the screen event.
       *
       * @param {CustomEvent} event - The event.
       */
      function handler(event) {
        setScreenData(event.detail.screen);
      }

      document.addEventListener("screen", handler);

      return () => document.removeEventListener("screen", handler);
    }, []);

    return screenData ? <Screen screen={screenData} /> : null;
  }

  return render(<ClientHarness />);
}

describe("New content reaches the screen", () => {
  let contentService;
  let strategy;

  beforeEach(() => {
    slidesInPlaylist = [createSlide("SLIDEA")];
    regionsChecksum = "regions-1";

    slideDoneCallbacks.clear();
    guardClock = 0;

    // Slide measures its dwell floor with performance.now(). Driving that from
    // the test keeps the rotation independent of how long the test takes.
    vi.spyOn(performance, "now").mockImplementation(() => guardClock);

    mockGetPath.mockReset();
    mockGetAllResultsFromPath.mockReset();
    primeApi();

    contentService = new ContentService();
    contentService.start();

    strategy = new PullStrategy({ endpoint: "", entryPoint: screenPath });
  });

  afterEach(() => {
    contentService.stop();
    cleanup();
    vi.restoreAllMocks();
  });

  /** Run one poll of the real pull strategy and let React settle. */
  async function pull() {
    await act(async () => {
      await strategy.getScreen(screenPath);
    });
  }

  /**
   * Play the slide that is on screen to the end of its run.
   *
   * @param {string} id - The slide iri.
   */
  function finishSlide(id) {
    guardClock += MIN_SLIDE_DWELL_MS * 10;

    act(() => {
      slideDoneCallbacks.get(id)();
    });
  }

  it("puts a slide added between two pulls into the region", async () => {
    renderClient();

    await pull();

    expect(
      testScreen.getByTestId("slide-/v2/slides/SLIDEA"),
    ).toBeInTheDocument();

    // The editor adds a slide. The API answers with the new slide and a moved
    // `regions` checksum -- and an unchanged `layout` checksum, so the client
    // serves layoutData from cache and the region prop identity never changes.
    slidesInPlaylist = [createSlide("SLIDEA"), createSlide("SLIDEB")];
    regionsChecksum = "regions-2";

    await pull();

    // Delivered to the scheduler on the pull that fetched it. Before the fix
    // this pull delivered it nowhere and the region waited a whole further pull
    // interval.
    expect(
      contentService.scheduleService.regions[REGION_ID].slides.map(
        ({ "@id": id }) => id,
      ),
    ).toEqual(["/v2/slides/SLIDEA", "/v2/slides/SLIDEB"]);

    // New content is staged, not forced on screen mid-slide, so SLIDEA is still
    // playing right after the pull.
    expect(
      testScreen.getByTestId("slide-/v2/slides/SLIDEA"),
    ).toBeInTheDocument();
    expect(
      testScreen.queryByTestId("slide-/v2/slides/SLIDEB"),
    ).not.toBeInTheDocument();

    // End of the lap: the region adopts the new list and starts it from the top.
    finishSlide("/v2/slides/SLIDEA");
    // ... and the next advance reaches the slide the editor added.
    finishSlide("/v2/slides/SLIDEA");

    expect(
      testScreen.getByTestId("slide-/v2/slides/SLIDEB"),
    ).toBeInTheDocument();
  });

  it("fetched the new slide without re-fetching the layout", async () => {
    renderClient();

    await pull();

    const layoutCallsAfterFirstPull = mockGetPath.mock.calls.filter(
      ([path]) => path === LAYOUT,
    ).length;

    slidesInPlaylist = [createSlide("SLIDEA"), createSlide("SLIDEB")];
    regionsChecksum = "regions-2";

    await pull();

    // Pins the premise of the test above: the layout checksum did not move, so
    // there was no layout re-fetch and therefore no new region prop identity.
    // If this ever changes, the first test could start passing for the wrong
    // reason.
    expect(
      mockGetPath.mock.calls.filter(([path]) => path === LAYOUT).length,
    ).toBe(layoutCallsAfterFirstPull);

    expect(
      mockGetAllResultsFromPath.mock.calls.filter(
        ([path]) => path === playlistSlidesPath,
      ).length,
    ).toBe(2);
  });

  it("recovers new content on the next pull when a request failed", async () => {
    renderClient();

    await pull();

    // The editor adds a slide, but this pull cannot read the playlist -- a 429
    // from the reverse proxy, say, which getAllResultsFromPath reports as {}.
    slidesInPlaylist = [createSlide("SLIDEA"), createSlide("SLIDEB")];
    regionsChecksum = "regions-2";

    const workingImplementation =
      mockGetAllResultsFromPath.getMockImplementation();

    mockGetAllResultsFromPath.mockImplementation((path) =>
      path === playlistSlidesPath
        ? Promise.resolve({})
        : workingImplementation(path),
    );

    await pull();

    // Last known good content stays on screen rather than the region going
    // blank.
    expect(
      contentService.scheduleService.regions[REGION_ID].slides.map(
        ({ "@id": id }) => id,
      ),
    ).toEqual(["/v2/slides/SLIDEA"]);

    // The pull must not have recorded the server's checksum for content it never
    // received, or the next pull compares equal, takes the cache branch, and the
    // region serves the stale list until somebody edits the playlist again.
    expect(strategy.lastestScreenData.relationsChecksum.regions).toBeNull();

    mockGetAllResultsFromPath.mockImplementation(workingImplementation);

    // Same server state as the failed pull: nothing changed except that the
    // request now succeeds.
    await pull();

    expect(
      contentService.scheduleService.regions[REGION_ID].slides.map(
        ({ "@id": id }) => id,
      ),
    ).toEqual(["/v2/slides/SLIDEA", "/v2/slides/SLIDEB"]);
  });

  it("does not disturb a region whose content did not change", async () => {
    renderClient();

    await pull();

    const regionContent = vi.fn();
    document.addEventListener(`regionContent-${REGION_ID}`, regionContent);

    // Same checksum, same slides: a poll that found nothing new.
    await pull();

    document.removeEventListener(`regionContent-${REGION_ID}`, regionContent);

    expect(regionContent).not.toHaveBeenCalled();
  });
});
