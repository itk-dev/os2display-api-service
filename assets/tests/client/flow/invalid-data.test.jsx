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
  advance,
  buildGraph,
  fallbackShowing,
  makePlaylist,
  makeSlide,
  nextPull,
  playSlide,
  regionSlideTitles,
  serveGraph,
  settle,
  setupFlowTest,
  slideTitles,
  startClient,
  teardownFlowTest,
} from "./flow-harness.jsx";

const REGION_A = "REGIONA";

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
 * A single-region screen holding the given slides in one playlist.
 *
 * @param {Array} slides The slides, or raw playlist-slide rows.
 * @returns {object} The graph.
 */
function graphWithSlides(slides) {
  return buildGraph({
    regions: [
      {
        id: REGION_A,
        gridArea: ["a"],
        playlists: [makePlaylist({ id: "PLAYLIST1", slides })],
      },
    ],
  });
}

describe("A slide that names no template", () => {
  it("is kept off screen, and the fallback covers for it", async () => {
    // templateDataFromSlide answers null for a slide with no template, which
    // marks the slide invalid. Region drops invalid slides, so counting them as
    // content is what left a screen reporting itself full while showing
    // nothing - the fallback stayed hidden and the screen was black (#507).
    const graph = graphWithSlides([
      makeSlide({ id: "SLIDEA", title: "No template", template: null }),
    ]);

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual([]);
    expect(fallbackShowing(view.container)).toBe(true);
  });

  it("does not stop the slides beside it from playing", async () => {
    const graph = graphWithSlides([
      makeSlide({ id: "SLIDEA", title: "Good slide" }),
      makeSlide({ id: "SLIDEB", title: "No template", template: null }),
    ]);

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual(["Good slide"]);
    expect(fallbackShowing(view.container)).toBe(false);

    await playSlide();

    expect(regionSlideTitles(view.container, REGION_A)).toEqual(["Good slide"]);
  });
});

describe("A playlist row whose slide is absent", () => {
  it("is dropped, and the rest of the playlist still plays", async () => {
    // A row with no slide relation maps to undefined, and getScreen's relations
    // loop writes templateData onto every entry. Assigning to undefined throws,
    // and nothing between there and pull()'s catch handles it - so one broken
    // row in one playlist aborted the whole pull and froze the screen on its
    // last content, every pull after (#507).
    const graph = graphWithSlides([
      makeSlide({ id: "SLIDEA", title: "First good" }),
      { slide: null },
      { slide: undefined },
      makeSlide({ id: "SLIDEB", title: "Second good" }),
    ]);

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual(["First good"]);

    await playSlide();

    expect(regionSlideTitles(view.container, REGION_A)).toEqual([
      "Second good",
    ]);
  });
});

describe("A slide whose template is not in this build", () => {
  it("is contained by its own boundary, and the region moves on", async () => {
    // renderSlide throws for an id no bundled template has. Thrown outside the
    // slide's boundary it took out the region's instead, which has no handler
    // and never resets - one unrenderable slide replaced the whole region with
    // the error fallback until the client was reloaded.
    const graph = graphWithSlides([
      makeSlide({
        id: "SLIDEA",
        title: "Missing template",
        template: "01JZZZZZZZZZZZZZZZZZZZZZZZ",
      }),
      makeSlide({ id: "SLIDEB", title: "Good slide" }),
    ]);

    serveGraph(api, graph);
    view = await startClient(graph);

    // The region is still standing, with the error contained inside the slide.
    expect(view.container.querySelectorAll(".region")).toHaveLength(1);
    expect(
      view.container.querySelector(".slide .error-boundary"),
    ).not.toBeNull();

    // The failed slide reports itself done after five seconds, so the region
    // does not sit on it forever.
    await advance(5000);
    await settle();
    await advance(1000);
    await settle();

    expect(regionSlideTitles(view.container, REGION_A)).toEqual(["Good slide"]);
  });
});

describe("A region whose playlists cannot be fetched", () => {
  it("keeps showing what it had", async () => {
    // Content one pull out of date beats a black region on signage, and a failed
    // request says nothing about what the region should show.
    const graph = graphWithSlides([
      makeSlide({ id: "SLIDEA", title: "Last known good" }),
    ]);

    serveGraph(api, graph);
    view = await startClient(graph);

    expect(slideTitles(view.container)).toEqual(["Last known good"]);

    graph.fail(graph.regionPlaylistsPath(REGION_A));

    await nextPull();

    expect(regionSlideTitles(view.container, REGION_A)).toEqual([
      "Last known good",
    ]);
    expect(fallbackShowing(view.container)).toBe(false);
  });
});

describe("A screen request that fails", () => {
  it("leaves the running screen alone and recovers on a later pull", async () => {
    const graph = graphWithSlides([
      makeSlide({ id: "SLIDEA", title: "Still showing" }),
    ]);

    serveGraph(api, graph);
    view = await startClient(graph);

    graph.fail(graph.screenPath);

    await nextPull();

    // Without a screen there is nothing to deliver, so the pull is abandoned
    // before it can emit anything - the screen keeps what it has.
    expect(regionSlideTitles(view.container, REGION_A)).toEqual([
      "Still showing",
    ]);

    graph.recover(graph.screenPath);
    graph.setPlaylists(REGION_A, [
      makePlaylist({
        id: "PLAYLIST1",
        slides: [makeSlide({ id: "SLIDEB", title: "Recovered" })],
      }),
    ]);

    await nextPull();
    await playSlide();

    // The poll chain survived the failed pull, so new content still arrives.
    expect(regionSlideTitles(view.container, REGION_A)).toEqual(["Recovered"]);
  });
});

describe("A malformed slide that makes a pull throw", () => {
  it("costs that pull only, and the next one recovers the screen", async () => {
    // `media` is iterated with for..of, so a slide whose media relation is not
    // an array throws from inside getScreen. That throw reaches pull()'s catch,
    // which must not take the poll chain down with it.
    const graph = graphWithSlides([
      makeSlide({ id: "SLIDEA", title: "Last known good" }),
    ]);

    serveGraph(api, graph);
    view = await startClient(graph);

    graph.setPlaylists(REGION_A, [
      makePlaylist({
        id: "PLAYLIST1",
        slides: [makeSlide({ id: "SLIDEB", title: "Malformed", media: null })],
      }),
    ]);

    await nextPull();

    expect(regionSlideTitles(view.container, REGION_A)).toEqual([
      "Last known good",
    ]);

    graph.setPlaylists(REGION_A, [
      makePlaylist({
        id: "PLAYLIST1",
        slides: [makeSlide({ id: "SLIDEC", title: "Repaired" })],
      }),
    ]);

    await nextPull();
    await playSlide();

    expect(regionSlideTitles(view.container, REGION_A)).toEqual(["Repaired"]);
  });
});
