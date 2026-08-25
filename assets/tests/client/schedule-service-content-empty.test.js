import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../client/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("../../client/util/client-config-loader.js", () => ({
  default: {
    loadConfig: vi.fn(() => Promise.resolve({ schedulingInterval: 60000 })),
  },
}));

import ScheduleService from "../../client/service/schedule-service";

const REGION_ID = "01FV9K4K0Y0X0K1J88SQ6B64VT";

/**
 * Build a region with a single playlist holding a single slide.
 *
 * @param {object} published - The published state of the slide.
 * @returns {Array} - The region content (array of playlists).
 */
function buildRegion(published) {
  return [
    {
      "@id": "/v2/playlists/01ABCDEFGHJKMNPQRSTVWXYZ01",
      published: { from: null, to: null },
      schedules: [],
      slidesData: [
        {
          "@id": "/v2/slides/01ABCDEFGHJKMNPQRSTVWXYZ02",
          published,
        },
      ],
    },
  ];
}

describe("ScheduleService empty content detection", () => {
  let service;
  let events;
  let listener;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new ScheduleService();
    events = [];
    listener = (event) => events.push(event.type);
    document.addEventListener("contentEmpty", listener);
    document.addEventListener("contentNotEmpty", listener);
  });

  afterEach(() => {
    document.removeEventListener("contentEmpty", listener);
    document.removeEventListener("contentNotEmpty", listener);
    service.regionRemoved(REGION_ID);
    vi.useRealTimers();
  });

  it("signals content when a future slide becomes active", () => {
    // Boot before the slide is published: nothing to play, the fallback is
    // correctly shown and no event is needed.
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    service.updateRegion(
      REGION_ID,
      buildRegion({ from: "2026-01-01T11:00:00Z", to: null }),
    );

    expect(events).toEqual([]);

    // Time passes, the slide enters its publishing window and the scheduling
    // interval picks it up.
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    service.checkScheduling(REGION_ID);

    expect(service.regions[REGION_ID].slides).toHaveLength(1);
    expect(events).toEqual(["contentNotEmpty"]);
  });

  it("signals empty content when the last slide expires", () => {
    // Boot with a playable slide.
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    service.updateRegion(
      REGION_ID,
      buildRegion({ from: null, to: "2026-01-01T11:00:00Z" }),
    );

    expect(events).toEqual(["contentNotEmpty"]);

    // The slide expires, leaving the region with nothing to play.
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    service.checkScheduling(REGION_ID);

    expect(service.regions[REGION_ID].slides).toEqual([]);
    expect(events).toEqual(["contentNotEmpty", "contentEmpty"]);
  });
});
