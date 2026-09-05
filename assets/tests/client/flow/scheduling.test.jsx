import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { api } = vi.hoisted(() => ({
  api: { getPath: vi.fn(), getAllResultsFromPath: vi.fn() },
}));

vi.mock("../../../client/logger/logger", () => ({
  default: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../client/data-sync/api-helper", () => ({
  default: vi.fn().mockImplementation(function ApiHelperMock() {
    this.getPath = api.getPath;
    this.getAllResultsFromPath = api.getAllResultsFromPath;
  }),
}));

import {
  buildGraph,
  fallbackShowing,
  makePlaylist,
  makeSlide,
  playSlide,
  regionSlideTitles,
  serveGraph,
  setNow,
  setupFlowTest,
  slideTitles,
  startClient,
  teardownFlowTest,
  tickScheduling,
} from "./flow-harness.jsx";

const REGION_A = "REGIONA";

// The screen starts up at 10:00, so a window opening at noon is in the future
// and one closing at 11:00 is about to pass.
const BOOT = "2026-09-05T10:00:00.000Z";

let view;

beforeEach(() => {
  setupFlowTest({ now: BOOT });
});

afterEach(async () => {
  await teardownFlowTest(view);
  view = undefined;
  vi.clearAllMocks();
});

/**
 * How many times the screen resource has been requested.
 *
 * Used to show that content changed without the client asking the API again -
 * scheduling is meant to be re-evaluated locally, not polled for.
 *
 * @param {object} graph The graph in use.
 * @returns {number} The number of pulls so far.
 */
function pullCount(graph) {
  return api.getPath.mock.calls.filter(([path]) => path === graph.screenPath)
    .length;
}

/**
 * A screen whose single region holds one slide with a publish window.
 *
 * @param {object} published The publish window.
 * @returns {object} The graph.
 */
function graphWithPublishWindow(published) {
  return buildGraph({
    regions: [
      {
        id: REGION_A,
        gridArea: ["a"],
        playlists: [
          makePlaylist({
            id: "PLAYLIST1",
            slides: [
              makeSlide({ id: "SLIDEA", title: "Scheduled slide", published }),
            ],
          }),
        ],
      },
    ],
  });
}

describe("A slide that is not scheduled yet", () => {
  it("is not rendered, and the region reports itself empty", async () => {
    // The slide is in the pull's payload - it is ScheduleService that has to
    // keep it off screen. A region holding only slides that are not due has no
    // content, so the fallback image has to cover for it rather than the screen
    // going black.
    const graph = graphWithPublishWindow({
      from: "2026-09-05T12:00:00.000Z",
      to: null,
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual([]);
    expect(fallbackShowing(view.container)).toBe(true);

    // The region is mounted and waiting - it is the content that is missing.
    expect(view.container.querySelectorAll(".region")).toHaveLength(1);
  });
});

describe("A slide whose publish window opens while the screen is running", () => {
  it("starts playing without waiting for another pull", async () => {
    // This is the transition the scheduling interval exists for. The pull that
    // fetched the slide happened hours before it became due, so nothing new
    // arrives from the API - checkScheduling has to re-evaluate the slides it
    // already holds and push them to the region itself.
    const graph = graphWithPublishWindow({
      from: "2026-09-05T12:00:00.000Z",
      to: null,
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual([]);

    const pullsBefore = pullCount(graph);

    setNow("2026-09-05T12:30:00.000Z");
    await tickScheduling();

    expect(slideTitles(view.container)).toEqual(["Scheduled slide"]);
    expect(fallbackShowing(view.container)).toBe(false);
    expect(pullCount(graph)).toBe(pullsBefore);
  });
});

describe("A slide whose publish window closes", () => {
  it("drops out of the rotation and leaves the rest playing", async () => {
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLIST1",
              slides: [
                makeSlide({ id: "SLIDEA", title: "Always on" }),
                makeSlide({
                  id: "SLIDEB",
                  title: "Until eleven",
                  published: { from: null, to: "2026-09-05T11:00:00.000Z" },
                }),
              ],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    await playSlide();

    expect(regionSlideTitles(view.container, REGION_A)).toEqual([
      "Until eleven",
    ]);

    setNow("2026-09-05T11:30:00.000Z");
    await tickScheduling();

    // Play past the wrap, where the region adopts the shortened list.
    await playSlide();
    await playSlide();

    expect(regionSlideTitles(view.container, REGION_A)).toEqual(["Always on"]);

    await playSlide();

    expect(regionSlideTitles(view.container, REGION_A)).toEqual(["Always on"]);
  });
});

describe("A playlist with an rrule schedule", () => {
  it("plays only the playlist whose schedule occurs now", async () => {
    // Both playlists are in the region's payload; only the one whose rrule
    // covers the current time may contribute slides.
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "MORNING",
              // Daily from 09:00, for two hours - so 10:00 is inside it.
              schedules: [
                {
                  rrule: "DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY",
                  duration: 7200,
                },
              ],
              slides: [makeSlide({ id: "SLIDEA", title: "Morning slide" })],
            }),
            makePlaylist({
              id: "EVENING",
              // Daily from 20:00, for one hour - nowhere near 10:00.
              schedules: [
                {
                  rrule: "DTSTART:20260101T200000Z\nRRULE:FREQ=DAILY",
                  duration: 3600,
                },
              ],
              slides: [makeSlide({ id: "SLIDEB", title: "Evening slide" })],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual(["Morning slide"]);

    await playSlide();

    // One slide is scheduled, so the region replays it rather than reaching the
    // evening playlist.
    expect(regionSlideTitles(view.container, REGION_A)).toEqual([
      "Morning slide",
    ]);
  });

  it("brings a playlist in when its schedule comes round", async () => {
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "EVENING",
              schedules: [
                {
                  rrule: "DTSTART:20260101T200000Z\nRRULE:FREQ=DAILY",
                  duration: 3600,
                },
              ],
              slides: [makeSlide({ id: "SLIDEB", title: "Evening slide" })],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual([]);
    expect(fallbackShowing(view.container)).toBe(true);

    setNow("2026-09-05T20:30:00.000Z");
    await tickScheduling();

    expect(slideTitles(view.container)).toEqual(["Evening slide"]);
    expect(fallbackShowing(view.container)).toBe(false);
  });
});
