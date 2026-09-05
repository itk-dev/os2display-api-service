import { useEffect, useState } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { vi } from "vitest";

import Screen from "../../../client/components/screen.jsx";
import { MIN_SLIDE_DWELL_MS } from "../../../client/components/slide.jsx";
import ContentService from "../../../client/service/content-service.js";

/**
 * Harness for the client flow tests.
 *
 * These tests exist because the screen client's failures live between its
 * parts, not inside them. A pull that half-succeeded, a region that remounted,
 * a slide that became schedulable - each of those is handled correctly by every
 * unit involved and still ended with a black or frozen screen (#507). So the
 * flow tests mock exactly one thing, ApiHelper, and run the real pull loop, the
 * real scheduling, the real React tree and the real bundled templates against
 * it.
 *
 * ApiHelper is a sufficient seam because PullStrategy is the only production
 * code that constructs one (pull-strategy.js), and it uses just two methods -
 * so a fake is a routing table from path to response.
 *
 * Two things here are stubbed that are not ApiHelper, neither of them client
 * behaviour: the `/config/client` request, which is a plain fetch and sets the
 * intervals these tests drive, and pino, whose info-level output would bury the
 * results. Every other service the client runs is the real one.
 */

// The bundled template every fixture slide renders with. image-text puts
// content.title into an <h1>, which gives each assertion a plain, user-visible
// string to look for rather than an internal id.
// @see assets/shared/templates/image-text.json
export const IMAGE_TEXT_TEMPLATE = "01FP2SNGFN0BZQH03KCBXHKYHG";

// Timings, chosen so the three clocks in play can be driven independently.
// A slide outlasts a pull, so advancing to the next pull never rotates a region
// underneath a test; the scheduling tick is far shorter than both, so a test can
// re-evaluate scheduling without triggering either.
export const SLIDE_DURATION = 900000;
export const PULL_INTERVAL = 600000;
export const SCHEDULING_INTERVAL = 2000;

export const clientConfig = {
  apiEndpoint: "/api",
  pullStrategyInterval: PULL_INTERVAL,
  schedulingInterval: SCHEDULING_INTERVAL,
  loginCheckTimeout: 20000,
  refreshTokenTimeout: 900000,
  releaseTimestampIntervalTimeout: 600000,
  // Off, so every pull refetches rather than taking the checksum cache branch.
  // The cache has its own tests (pull-strategy-cache-recovery.test.js); leaving
  // it on here would make which request happens on which pull depend on
  // checksum bookkeeping instead of on the content a test is describing.
  relationsChecksumEnabled: false,
  debug: false,
};

/**
 * A readable stand-in for a ULID.
 *
 * idFromPath matches the first 26-character alphanumeric run in an IRI, so
 * anything of that length and shape works - and a name that survives into the
 * failure output beats 26 random characters.
 *
 * @param {string} name Alphanumeric label, at most 26 characters.
 * @returns {string} A 26-character id.
 */
export function ulid(name) {
  return `${name.toUpperCase()}${"0".repeat(26)}`.slice(0, 26);
}

export const SCREEN_ID = ulid("SCREEN");
export const LAYOUT_ID = ulid("LAYOUT");

/**
 * Build a slide as the API serves it.
 *
 * @param {object} spec The slide spec.
 * @param {string} spec.id Short name, expanded to a ULID.
 * @param {string} spec.title Rendered into the template's <h1>.
 * @param {string} [spec.text] Body text.
 * @param {number} [spec.duration] How long the slide plays, in ms.
 * @param {object} [spec.published] Publish window, `{from, to}`.
 * @param {string|null} [spec.template] Template ULID, or null for a slide that
 *   names no template at all.
 * @param {Array} [spec.media] Media IRIs.
 * @returns {object} The slide.
 */
export function makeSlide({
  id,
  title,
  text = "",
  duration = SLIDE_DURATION,
  published = null,
  template = IMAGE_TEXT_TEMPLATE,
  media = [],
}) {
  return {
    "@id": `/v2/slides/${ulid(id)}`,
    title,
    published,
    media,
    relationsChecksum: null,
    templateInfo:
      template === null ? null : { "@id": `/v2/templates/${template}` },
    content: { title, text, duration },
  };
}

/**
 * Build a playlist as the API serves it.
 *
 * @param {object} spec The playlist spec.
 * @param {string} spec.id Short name, expanded to a ULID.
 * @param {Array} [spec.slides] The slides, or raw playlist-slide rows.
 * @param {object} [spec.published] Publish window, `{from, to}`.
 * @param {Array} [spec.schedules] rrule schedules.
 * @returns {object} The playlist.
 */
export function makePlaylist({
  id,
  slides = [],
  published = null,
  schedules = [],
}) {
  return {
    "@id": `/v2/playlists/${ulid(id)}`,
    title: id,
    slides: `/v2/playlists/${ulid(id)}/slides`,
    published,
    schedules,
    slideSpecs: slides,
  };
}

/**
 * Build the API graph a screen is assembled from, and serve paths off it.
 *
 * The graph is read at request time rather than baked into a fixed table, so a
 * test can change what the API answers between pulls just by mutating it -
 * which is what "adding a slide" and "removing content" are.
 *
 * @param {object} spec The graph spec.
 * @param {object} [spec.grid] The layout grid, `{rows, columns}`.
 * @param {Array} [spec.regions] Regions, each `{id, gridArea, type, playlists}`.
 * @returns {object} The graph.
 */
export function buildGraph({ grid = { rows: 1, columns: 1 }, regions = [] }) {
  const screenPath = `/v2/screens/${SCREEN_ID}`;
  const layoutPath = `/v2/layouts/${LAYOUT_ID}`;
  const campaignsPath = `${screenPath}/campaigns`;
  const groupsPath = `${screenPath}/screen-groups`;

  const state = {
    grid,
    regions: regions.map((region) => ({ type: null, ...region })),
  };

  const failing = new Set();
  const media = new Map();

  const regionPlaylistsPath = (regionId) =>
    `${screenPath}/regions/${ulid(regionId)}/playlists`;

  const findRegion = (regionId) =>
    state.regions.find((region) => region.id === regionId);

  const screenDocument = () => ({
    "@id": screenPath,
    title: "Flow test screen",
    layout: layoutPath,
    regions: state.regions.map((region) => regionPlaylistsPath(region.id)),
    campaigns: campaignsPath,
    inScreenGroups: groupsPath,
    relationsChecksum: null,
    enableColorSchemeChange: false,
  });

  const layoutDocument = () => ({
    "@id": layoutPath,
    grid: state.grid,
    regions: state.regions.map((region) => ({
      "@id": `/v2/layouts/regions/${ulid(region.id)}`,
      gridArea: region.gridArea,
      type: region.type,
    })),
  });

  // The playlist as the API serves it: the slide specs the graph carries for
  // its own bookkeeping are not part of the resource.
  const playlistDocument = (playlist) => {
    const { slideSpecs, ...rest } = playlist;

    return rest;
  };

  return {
    screenPath,
    layoutPath,
    campaignsPath,
    groupsPath,
    regionPlaylistsPath,
    state,

    /**
     * Replace a region's playlists.
     *
     * @param {string} regionId The region.
     * @param {Array} playlists The playlists it should now hold.
     */
    setPlaylists(regionId, playlists) {
      findRegion(regionId).playlists = playlists;
    },

    /**
     * Replace the whole layout.
     *
     * @param {object} next The new grid and regions.
     */
    setLayout({ grid: nextGrid, regions: nextRegions }) {
      state.grid = nextGrid;
      state.regions = nextRegions.map((region) => ({ type: null, ...region }));
    },

    /**
     * Register a media resource so a slide can reference it.
     *
     * @param {string} path The media IRI.
     * @param {object} document What the API answers for it.
     */
    setMedia(path, document) {
      media.set(path, document);
    },

    /**
     * Make a path fail the way the real ApiHelper reports failure.
     *
     * @param {string} path The path that should fail.
     */
    fail(path) {
      failing.add(path);
    },

    /**
     * Let a previously failing path answer again.
     *
     * @param {string} path The path to recover.
     */
    recover(path) {
      failing.delete(path);
    },

    isFailing: (path) => failing.has(path),

    /**
     * The single resource at a path.
     *
     * @param {string} path The path.
     * @returns {object|null} The resource, or null if there is none.
     */
    documentFor(path) {
      if (path === screenPath) return screenDocument();
      if (path === layoutPath) return layoutDocument();
      if (media.has(path)) return media.get(path);

      return null;
    },

    /**
     * The collection members at a path.
     *
     * @param {string} path The path.
     * @returns {Array|null} The members, or null if the path is not a
     *   collection this graph serves.
     */
    collectionFor(path) {
      if (path === campaignsPath || path === groupsPath) return [];

      const region = state.regions.find(
        (candidate) => regionPlaylistsPath(candidate.id) === path,
      );

      if (region) {
        return region.playlists.map((playlist) => ({
          playlist: playlistDocument(playlist),
        }));
      }

      const owner = state.regions
        .flatMap((candidate) => candidate.playlists)
        .find((playlist) => playlist.slides === path);

      if (owner) {
        // A spec may be a raw playlist-slide row - `{slide: null}`, or `{}` -
        // so that malformed rows can be described as the API would send them.
        return owner.slideSpecs.map((spec) =>
          spec !== null && spec !== undefined && "slide" in spec
            ? spec
            : { slide: spec },
        );
      }

      return null;
    },
  };
}

/**
 * Point a mocked ApiHelper at a graph.
 *
 * The failure shapes are the real ones: getPath answers null, and
 * getAllResultsFromPath answers a bare {} with no `results` key, which is how
 * every caller in PullStrategy tells a failure from an empty collection.
 *
 * @param {object} api The hoisted mock with getPath / getAllResultsFromPath.
 * @param {object} graph The graph to serve.
 */
export function serveGraph(api, graph) {
  api.getPath.mockImplementation(async (path) => {
    if (!path) throw new Error("No path");
    if (graph.isFailing(path)) return null;

    return graph.documentFor(path);
  });

  api.getAllResultsFromPath.mockImplementation(async (path) => {
    if (!path || graph.isFailing(path)) return {};

    const results = graph.collectionFor(path);

    if (results === null) return {};

    return { path, results, keys: {} };
  });
}

/**
 * The part of App that puts a screen on the wall.
 *
 * App also owns login, bind keys, token refresh and release checks, none of
 * which is on the path from API data to rendered slide. This reproduces exactly
 * the wiring App gives Screen - the `screen` event, and the fallback image the
 * contentEmpty/contentNotEmpty pair drives (app.jsx) - and nothing else.
 *
 * @returns {object} The component.
 */
function ClientRoot() {
  const [screen, setScreen] = useState(null);
  const [displayFallback, setDisplayFallback] = useState(true);

  useEffect(() => {
    const screenHandler = (event) => {
      const screenData = event.detail?.screen;

      if (screenData !== null) {
        setScreen(screenData);
      }
    };
    const contentEmpty = () => setDisplayFallback(true);
    const contentNotEmpty = () => setDisplayFallback(false);

    document.addEventListener("screen", screenHandler);
    document.addEventListener("contentEmpty", contentEmpty);
    document.addEventListener("contentNotEmpty", contentNotEmpty);

    return () => {
      document.removeEventListener("screen", screenHandler);
      document.removeEventListener("contentEmpty", contentEmpty);
      document.removeEventListener("contentNotEmpty", contentNotEmpty);
    };
  }, []);

  return (
    <div className="app">
      {screen && <Screen screen={screen} />}
      {displayFallback && <div className="fallback" data-testid="fallback" />}
    </div>
  );
}

/**
 * Advance every clock by the same amount, letting React settle as it goes.
 *
 * @param {number} ms Milliseconds to advance.
 */
export async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Let pending promise chains finish without moving any clock. */
export async function settle() {
  for (let step = 0; step < 5; step += 1) {
    // eslint-disable-next-line no-await-in-loop
    await advance(0);
  }
}

/**
 * Run the next pull and let its results reach the screen.
 *
 * The pull chain arms its next timeout only once the previous pull has settled
 * (pull-strategy.js), so advancing the clock is not on its own enough.
 */
export async function nextPull() {
  await advance(PULL_INTERVAL);
  await settle();
}

/**
 * Move the wall clock without running a timer.
 *
 * Publish windows and rrule schedules are evaluated against `new Date()`, so
 * this is what makes a slide become due. It is deliberately separate from
 * advance(): reaching a publish time is not the same event as the scheduling
 * interval coming round to notice it, and the client needs both.
 *
 * @param {string} iso The wall clock to move to.
 */
export function setNow(iso) {
  vi.setSystemTime(new Date(iso));
}

/** Fire one scheduling re-evaluation, without reaching a pull. */
export async function tickScheduling() {
  await advance(SCHEDULING_INTERVAL);
  await settle();
}

/**
 * Let the current slide play out, so the region moves to the next one.
 *
 * The cross-fade is run out as well. React commits the advance after the clock
 * has stopped, so the outgoing slide's exit timeout is only scheduled once
 * advancing has finished - leaving both slides mounted, which is a transition
 * caught mid-flight rather than anything a viewer would end up looking at.
 */
export async function playSlide() {
  await advance(SLIDE_DURATION);
  await settle();

  await advance(MIN_SLIDE_DWELL_MS);
  await settle();
}

/**
 * Start a client against a graph and wait for its first pull.
 *
 * The three steps are the ones App takes when it starts content: construct a
 * ContentService, start it, and announce the screen path (app.jsx).
 *
 * @param {object} graph The graph to serve.
 * @returns {Promise<object>} The render result, plus the ContentService.
 */
export async function startClient(graph) {
  const service = new ContentService();
  service.start();

  const rendered = render(<ClientRoot />);

  document.dispatchEvent(
    new CustomEvent("startDataSync", {
      detail: { screenPath: graph.screenPath },
    }),
  );

  await settle();

  return { ...rendered, service };
}

/**
 * Install the fake clocks and the config response every flow test needs.
 *
 * @param {object} [options] Options.
 * @param {string} [options.now] The wall clock to start from.
 */
export function setupFlowTest({ now = "2026-09-05T10:00:00.000Z" } = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));

  vi.stubGlobal(
    "fetch",
    vi.fn(async (resource) => {
      if (String(resource).includes("/config/client")) {
        return { ok: true, status: 200, json: async () => clientConfig };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

/**
 * Stop the client and put the globals back.
 *
 * The sync is stopped before the service, so an in-flight pull cannot deliver
 * content into a tree that is being torn down.
 *
 * @param {object} [view] The result of startClient.
 */
export async function teardownFlowTest(view) {
  document.dispatchEvent(new Event("stopDataSync"));

  await settle();

  view?.service?.stop();

  cleanup();

  vi.useRealTimers();
  vi.unstubAllGlobals();
}

/**
 * The titles of every slide currently mounted.
 *
 * Both slides are mounted while a region cross-fades, so this can legitimately
 * hold two entries mid-transition.
 *
 * @param {HTMLElement} container The render container.
 * @returns {Array<string>} The titles.
 */
export function slideTitles(container) {
  return [...container.querySelectorAll(".slide h1")].map((node) =>
    node.textContent.trim(),
  );
}

/**
 * The titles of the slides mounted inside one region.
 *
 * @param {HTMLElement} container The render container.
 * @param {string} regionId The region's short name.
 * @returns {Array<string>} The titles.
 */
export function regionSlideTitles(container, regionId) {
  const region = container.querySelector(`#${ulid(regionId)}`);

  if (region === null) return [];

  return [...region.querySelectorAll(".slide h1")].map((node) =>
    node.textContent.trim(),
  );
}

/**
 * Whether the fallback image is showing.
 *
 * @param {HTMLElement} container The render container.
 * @returns {boolean} True if the fallback is on screen.
 */
export function fallbackShowing(container) {
  return container.querySelector(".fallback") !== null;
}
