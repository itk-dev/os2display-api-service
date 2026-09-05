import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { api } = vi.hoisted(() => ({
  api: { getPath: vi.fn(), getAllResultsFromPath: vi.fn() },
}));

// Noise only - pino logs at info level, and a pull logs a line per relation.
vi.mock("../../../client/logger/logger", () => ({
  default: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The one mock these tests are allowed. Everything from PullStrategy down is
// the real thing.
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
  nextPull,
  playSlide,
  regionSlideTitles,
  serveGraph,
  setupFlowTest,
  slideTitles,
  startClient,
  teardownFlowTest,
} from "./flow-harness.jsx";

const REGION_A = "REGIONA";
const REGION_B = "REGIONB";

let view;

beforeEach(() => {
  setupFlowTest();
});

afterEach(async () => {
  await teardownFlowTest(view);
  view = undefined;
  vi.clearAllMocks();
});

/**
 * Play the region forward, collecting every title it shows.
 *
 * A region does not adopt new slides until its rotation wraps, so the slide a
 * pull added is not on screen the moment it arrives - it appears a turn or two
 * later. Collecting over several turns describes that without pinning the test
 * to the exact turn it happens on.
 *
 * @param {HTMLElement} container The render container.
 * @param {string} regionId The region to play.
 * @param {number} turns How many slides to play.
 * @returns {Promise<Set<string>>} Every title seen.
 */
async function titlesOverTurns(container, regionId, turns) {
  const seen = new Set(regionSlideTitles(container, regionId));

  for (let turn = 0; turn < turns; turn += 1) {
    // eslint-disable-next-line no-await-in-loop
    await playSlide();
    regionSlideTitles(container, regionId).forEach((title) => seen.add(title));
  }

  return seen;
}

describe("A screen with no content", () => {
  it("shows the fallback and renders no slide", async () => {
    // The empty screen is the state every client starts in, and the one a
    // screen falls back to when its content goes away. Getting it wrong is not
    // a blank region but a black screen, because the fallback image is what
    // covers for having nothing to show.
    const graph = buildGraph({
      regions: [{ id: REGION_A, gridArea: ["a"], playlists: [] }],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(view.container.querySelectorAll(".slide")).toHaveLength(0);
    expect(fallbackShowing(view.container)).toBe(true);

    // The region itself is on screen - it just has nothing in it.
    expect(view.container.querySelectorAll(".region")).toHaveLength(1);
  });
});

describe("A screen with one slide", () => {
  it("renders the slide and hides the fallback", async () => {
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLIST1",
              slides: [makeSlide({ id: "SLIDEA", title: "First slide" })],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual(["First slide"]);
    expect(fallbackShowing(view.container)).toBe(false);
  });
});

describe("Content added to a running screen", () => {
  it("plays a slide that a later pull added", async () => {
    // The screen is already running when an editor adds a slide. Nothing
    // remounts, so the new slide has to reach the region through the pull ->
    // ScheduleService -> regionContent path while the old one is still playing.
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLIST1",
              slides: [makeSlide({ id: "SLIDEA", title: "First slide" })],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual(["First slide"]);

    graph.setPlaylists(REGION_A, [
      makePlaylist({
        id: "PLAYLIST1",
        slides: [
          makeSlide({ id: "SLIDEA", title: "First slide" }),
          makeSlide({ id: "SLIDEB", title: "Second slide" }),
        ],
      }),
    ]);

    await nextPull();

    const seen = await titlesOverTurns(view.container, REGION_A, 3);

    expect(seen).toContain("First slide");
    expect(seen).toContain("Second slide");
  });

  it("keeps every region playing its own slides when there is a lot of content", async () => {
    // Two regions, two playlists each, two slides each. Slides are matched to
    // regions structurally rather than by position, and the execution id is
    // built from region + playlist + slide - so the failure this guards against
    // is one region showing another region's content.
    const graph = buildGraph({
      grid: { rows: 1, columns: 2 },
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLISTA1",
              slides: [
                makeSlide({ id: "SLIDEA1", title: "A one" }),
                makeSlide({ id: "SLIDEA2", title: "A two" }),
              ],
            }),
            makePlaylist({
              id: "PLAYLISTA2",
              slides: [makeSlide({ id: "SLIDEA3", title: "A three" })],
            }),
          ],
        },
        {
          id: REGION_B,
          gridArea: ["b"],
          playlists: [
            makePlaylist({
              id: "PLAYLISTB1",
              slides: [
                makeSlide({ id: "SLIDEB1", title: "B one" }),
                makeSlide({ id: "SLIDEB2", title: "B two" }),
              ],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(view.container.querySelectorAll(".region")).toHaveLength(2);

    const seenInA = await titlesOverTurns(view.container, REGION_A, 4);

    expect([...seenInA].sort()).toEqual(["A one", "A three", "A two"]);

    const seenInB = await titlesOverTurns(view.container, REGION_B, 4);

    expect([...seenInB].every((title) => title.startsWith("B"))).toBe(true);
    expect(seenInB).toContain("B one");
    expect(seenInB).toContain("B two");
  });
});

describe("Content removed from a running screen", () => {
  it("brings the fallback back when the last playlist goes away", async () => {
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLIST1",
              slides: [makeSlide({ id: "SLIDEA", title: "First slide" })],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(fallbackShowing(view.container)).toBe(false);

    graph.setPlaylists(REGION_A, []);

    await nextPull();

    // The fallback comes back as soon as the region reports itself empty, even
    // though the slide it was showing is still on screen: a region adopts new
    // content only when its rotation wraps.
    expect(fallbackShowing(view.container)).toBe(true);
    expect(slideTitles(view.container)).toEqual(["First slide"]);

    // On the wrap it adopts the empty list, and the region really is empty.
    await playSlide();

    expect(slideTitles(view.container)).toEqual([]);
  });

  it("keeps playing the slides that remain when one is removed", async () => {
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLIST1",
              slides: [
                makeSlide({ id: "SLIDEA", title: "Kept slide" }),
                makeSlide({ id: "SLIDEB", title: "Removed slide" }),
              ],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    graph.setPlaylists(REGION_A, [
      makePlaylist({
        id: "PLAYLIST1",
        slides: [makeSlide({ id: "SLIDEA", title: "Kept slide" })],
      }),
    ]);

    await nextPull();

    // The removed slide is still played out once: a region finishes the
    // rotation it is in before it adopts a new list, so the shrunk playlist
    // takes effect on the wrap rather than mid-turn.
    await playSlide();
    await playSlide();

    const seen = await titlesOverTurns(view.container, REGION_A, 3);

    expect([...seen]).toEqual(["Kept slide"]);
    expect(fallbackShowing(view.container)).toBe(false);
  });
});
