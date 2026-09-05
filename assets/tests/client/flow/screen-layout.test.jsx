import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent } from "@testing-library/react";

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
  nextPull,
  regionSlideTitles,
  serveGraph,
  settle,
  setupFlowTest,
  slideTitles,
  startClient,
  teardownFlowTest,
  ulid,
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
 * The labels on a touch region's buttons.
 *
 * @param {HTMLElement} container The render container.
 * @returns {Array<string>} The labels.
 */
function touchButtonLabels(container) {
  return [
    ...container.querySelectorAll(".touch-button .touch-button-text"),
  ].map((node) => node.textContent.trim());
}

describe("A split screen layout", () => {
  it("gives each region its own content", async () => {
    // Playlists are matched to regions structurally rather than by position.
    // Handing a region another region's playlists is worse than handing it
    // none, so this asserts the separation and not just that both regions
    // ended up with something.
    const graph = buildGraph({
      grid: { rows: 1, columns: 2 },
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLISTA",
              slides: [makeSlide({ id: "SLIDEA", title: "Left slide" })],
            }),
          ],
        },
        {
          id: REGION_B,
          gridArea: ["b"],
          playlists: [
            makePlaylist({
              id: "PLAYLISTB",
              slides: [makeSlide({ id: "SLIDEB", title: "Right slide" })],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(view.container.querySelectorAll(".region")).toHaveLength(2);
    expect(regionSlideTitles(view.container, REGION_A)).toEqual(["Left slide"]);
    expect(regionSlideTitles(view.container, REGION_B)).toEqual([
      "Right slide",
    ]);

    // Each region lays itself out in its own grid area.
    expect(
      view.container.querySelector(`#${ulid(REGION_A)}`).style.gridArea,
    ).not.toBe(
      view.container.querySelector(`#${ulid(REGION_B)}`).style.gridArea,
    );
  });
});

describe("A touch region", () => {
  it("shows a button per slide and plays the one that is pressed", async () => {
    // A touch region does not rotate. It shows buttons and waits, so the whole
    // point is that nothing plays until somebody presses one.
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          type: "touch-buttons",
          playlists: [
            makePlaylist({
              id: "PLAYLIST1",
              slides: [
                makeSlide({ id: "SLIDEA", title: "Opening hours" }),
                makeSlide({ id: "SLIDEB", title: "Events" }),
              ],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(view.container.querySelectorAll(".touch-region")).toHaveLength(1);
    expect(touchButtonLabels(view.container)).toEqual([
      "Opening hours",
      "Events",
    ]);
    expect(slideTitles(view.container)).toEqual([]);

    fireEvent.click(view.container.querySelectorAll(".touch-button")[1]);
    await settle();

    expect(slideTitles(view.container)).toEqual(["Events"]);
    expect(view.container.querySelector(".touch-button-close")).not.toBeNull();

    fireEvent.click(view.container.querySelector(".touch-button-close"));
    await settle();

    // Back to the buttons, with nothing playing.
    expect(slideTitles(view.container)).toEqual([]);
    expect(touchButtonLabels(view.container)).toEqual([
      "Opening hours",
      "Events",
    ]);
  });

  it("reports the slide that was closed, not the click that closed it", async () => {
    // The close button was wired straight to slideDone, so it was called with
    // the click event and announced a slideDone for `undefined`. Nothing in the
    // client listens for that event today, which is exactly how a wrong value
    // sat there unnoticed: it is emitted for telemetry and end-to-end tests to
    // read, and both would have been reading a hole.
    const done = [];
    const listener = (event) => done.push(event.detail);

    document.addEventListener("slideDone", listener);

    try {
      const graph = buildGraph({
        regions: [
          {
            id: REGION_A,
            gridArea: ["a"],
            type: "touch-buttons",
            playlists: [
              makePlaylist({
                id: "PLAYLIST1",
                slides: [makeSlide({ id: "SLIDEA", title: "Opening hours" })],
              }),
            ],
          },
        ],
      });

      serveGraph(api, graph);
      view = await startClient(graph);

      fireEvent.click(view.container.querySelector(".touch-button"));
      await settle();

      const executionId =
        view.container.querySelector(".slide").dataset.executionId;

      expect(executionId).toBeTruthy();

      fireEvent.click(view.container.querySelector(".touch-button-close"));
      await settle();

      expect(done).toEqual([{ regionId: ulid(REGION_A), executionId }]);
    } finally {
      document.removeEventListener("slideDone", listener);
    }
  });

  it("offers no button for a slide that cannot be rendered", async () => {
    // A slide the pull could not resolve a template for renders as nothing, so
    // a button for it opens an empty panel the viewer can only back out of.
    // ScheduleService already discounts those slides when it decides whether a
    // region has content, so listing them here would have the touch region
    // advertising content the rest of the client agrees is not there.
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          type: "touch-buttons",
          playlists: [
            makePlaylist({
              id: "PLAYLIST1",
              slides: [
                makeSlide({
                  id: "SLIDEA",
                  title: "No template",
                  template: null,
                }),
                makeSlide({ id: "SLIDEB", title: "Events" }),
              ],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(touchButtonLabels(view.container)).toEqual(["Events"]);

    // The one button there is still works.
    fireEvent.click(view.container.querySelector(".touch-button"));
    await settle();

    expect(slideTitles(view.container)).toEqual(["Events"]);
  });

  it("falls back when every one of its slides is unrenderable", async () => {
    // With nothing renderable the region has no content, and the fallback image
    // has to cover for it rather than the screen offering dead buttons.
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          type: "touch-buttons",
          playlists: [
            makePlaylist({
              id: "PLAYLIST1",
              slides: [
                makeSlide({
                  id: "SLIDEA",
                  title: "No template",
                  template: null,
                }),
              ],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(touchButtonLabels(view.container)).toEqual([]);
    expect(fallbackShowing(view.container)).toBe(true);
  });
});

describe("A layout that changes under a running screen", () => {
  it("keeps a region's content when the region changes type", async () => {
    // Changing a region's type swaps the component behind an unchanged region
    // id, and React runs the outgoing cleanup before the incoming effects - so
    // regionReady arrives with the cache regionRemoved has just dropped. The
    // region then had nothing to show until some later pull happened to change
    // its content, which is up to a pull interval of blank screen (#507).
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLIST1",
              slides: [makeSlide({ id: "SLIDEA", title: "Opening hours" })],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(regionSlideTitles(view.container, REGION_A)).toEqual([
      "Opening hours",
    ]);

    graph.state.regions[0].type = "touch-buttons";

    await nextPull();

    expect(view.container.querySelectorAll(".touch-region")).toHaveLength(1);
    expect(touchButtonLabels(view.container)).toEqual(["Opening hours"]);
  });

  it("moves content onto the regions of a layout it has never seen", async () => {
    // A screen reassigned to a wider layout gets regions with new ids. The old
    // region unmounts and two new ones mount, all in one commit.
    const graph = buildGraph({
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLISTA",
              slides: [makeSlide({ id: "SLIDEA", title: "Left slide" })],
            }),
          ],
        },
      ],
    });

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(view.container.querySelectorAll(".region")).toHaveLength(1);

    graph.setLayout({
      grid: { rows: 1, columns: 2 },
      regions: [
        {
          id: REGION_A,
          gridArea: ["a"],
          playlists: [
            makePlaylist({
              id: "PLAYLISTA",
              slides: [makeSlide({ id: "SLIDEA", title: "Left slide" })],
            }),
          ],
        },
        {
          id: REGION_B,
          gridArea: ["b"],
          playlists: [
            makePlaylist({
              id: "PLAYLISTB",
              slides: [makeSlide({ id: "SLIDEB", title: "Right slide" })],
            }),
          ],
        },
      ],
    });

    await nextPull();

    expect(view.container.querySelectorAll(".region")).toHaveLength(2);
    expect(regionSlideTitles(view.container, REGION_A)).toEqual(["Left slide"]);
    expect(regionSlideTitles(view.container, REGION_B)).toEqual([
      "Right slide",
    ]);
  });
});
