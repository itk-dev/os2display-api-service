import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAllResultsFromPath, mockLogger } = vi.hoisted(() => ({
  mockGetAllResultsFromPath: vi.fn(),
  mockLogger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../client/logger/logger", () => ({ default: mockLogger }));

vi.mock("../../client/data-sync/api-helper", () => ({
  default: vi.fn().mockImplementation(function () {
    this.getAllResultsFromPath = mockGetAllResultsFromPath;
    this.getPath = vi.fn();
  }),
}));

import PullStrategy from "../../client/data-sync/pull-strategy";

const SCREEN = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const REGION_A = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const REGION_B = "01CRZ3NDEKTSV4RRFFQ69G5FAV";

const pathA = `/v2/screens/${SCREEN}/regions/${REGION_A}/playlists`;
const pathB = `/v2/screens/${SCREEN}/regions/${REGION_B}/playlists`;

describe("PullStrategy.getRegions with a failed region request", () => {
  beforeEach(() => {
    mockGetAllResultsFromPath.mockReset();
    mockLogger.warn.mockReset();
  });

  it("keeps the region key when its playlists request failed", async () => {
    // getAllResultsFromPath returns a bare {} when the underlying request
    // failed — the region path is then lost and the region silently drops
    // out of regionData, so the client never schedules content for it and
    // the region stays black. See #507.
    mockGetAllResultsFromPath.mockImplementation((regionPath) => {
      if (regionPath === pathA) {
        return Promise.resolve({
          path: pathA,
          results: [{ playlist: { "@id": "/v2/playlists/1", title: "A" } }],
          keys: {},
        });
      }

      return Promise.resolve({});
    });

    const strategy = new PullStrategy({ endpoint: "", entryPoint: "" });
    const regionData = await strategy.getRegions([pathA, pathB]);

    expect(Object.keys(regionData).sort()).toEqual([REGION_A, REGION_B].sort());
    expect(regionData[REGION_A]).toHaveLength(1);
    expect(regionData[REGION_B]).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("keeps the region key when the request rejects", async () => {
    mockGetAllResultsFromPath.mockImplementation((regionPath) => {
      if (regionPath === pathA) {
        return Promise.resolve({ path: pathA, results: [], keys: {} });
      }

      return Promise.reject(new Error("network error"));
    });

    const strategy = new PullStrategy({ endpoint: "", entryPoint: "" });
    const regionData = await strategy.getRegions([pathA, pathB]);

    expect(Object.keys(regionData).sort()).toEqual([REGION_A, REGION_B].sort());
  });
});
