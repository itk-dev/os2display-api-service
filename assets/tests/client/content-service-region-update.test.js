import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../client/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("../../client/util/client-config-loader.js", () => ({
  default: {
    loadConfig: vi.fn(() =>
      Promise.resolve({
        schedulingInterval: 60000,
        pullStrategyInterval: 600000,
      }),
    ),
  },
}));

const { default: ContentService } =
  await import("../../client/service/content-service");

const REGION_ID = "R";

/**
 * Build a screen payload with a stable layout and one region holding one
 * playlist with one slide.
 *
 * @param {string} latestRequestDateTime - Volatile screen status value.
 * @param {string} title - The slide title.
 * @returns {object} - The screen payload.
 */
function screenPayload(latestRequestDateTime, title) {
  return {
    "@id": "/v2/screens/A",
    regions: [`/v2/screens/A/regions/${REGION_ID}/playlists`],
    campaignsData: [],
    status: { latestRequestDateTime },
    layoutData: {
      grid: { rows: 1, columns: 1 },
      regions: [{ "@id": `/v2/layouts/regions/${REGION_ID}`, gridArea: ["a"] }],
    },
    regionData: {
      [REGION_ID]: [
        {
          "@id": "/v2/playlists/P",
          published: { from: null, to: null },
          schedules: [],
          slidesData: [
            {
              "@id": "/v2/slides/S",
              title,
              published: { from: null, to: null },
            },
          ],
        },
      ],
    },
  };
}

/**
 * Dispatch a content event.
 *
 * @param {object} screen - The screen payload.
 */
function emitContent(screen) {
  document.dispatchEvent(new CustomEvent("content", { detail: { screen } }));
}

/**
 * Dispatch a regionReady event.
 */
function emitRegionReady() {
  document.dispatchEvent(
    new CustomEvent("regionReady", { detail: { id: REGION_ID } }),
  );
}

describe("ContentService region updates", () => {
  let service;
  let received;
  let listener;

  /**
   * Simulate a Region component mounting: it registers its content listener
   * and then announces itself with regionReady.
   */
  function mountRegion() {
    document.addEventListener(`regionContent-${REGION_ID}`, listener);
    emitRegionReady();
  }

  beforeEach(() => {
    service = new ContentService();
    service.start();

    received = [];
    listener = (event) => received.push(event.detail);
  });

  afterEach(() => {
    document.removeEventListener(`regionContent-${REGION_ID}`, listener);
    service.scheduleService.regionRemoved(REGION_ID);
    service.stop();
    vi.clearAllMocks();
  });

  it("delivers updated slides when only the volatile screen status changed", () => {
    emitContent(screenPayload("2026-01-01T10:00:00+00:00", "Old"));
    mountRegion();

    expect(received).toHaveLength(1);
    expect(received[0].slides[0].title).toBe("Old");

    // A later pull: the screen status has changed (TRACK_SCREEN_INFO), so the
    // screen hash differs. The mounted region keeps the same region prop, so
    // it does not announce itself again.
    emitContent(screenPayload("2026-01-01T10:10:00+00:00", "New"));

    expect(received).toHaveLength(2);
    expect(received[1].slides[0].title).toBe("New");
  });

  it("delivers slides to a region announcing itself again with unchanged content", () => {
    emitContent(screenPayload("2026-01-01T10:00:00+00:00", "Old"));
    mountRegion();

    expect(received).toHaveLength(1);

    // The screen changed but the region content did not. The region announces
    // itself again, and must still be given its slides.
    emitContent(screenPayload("2026-01-01T10:10:00+00:00", "Old"));
    emitRegionReady();

    expect(received).toHaveLength(2);
    expect(received[1].slides[0].title).toBe("Old");
  });
});
