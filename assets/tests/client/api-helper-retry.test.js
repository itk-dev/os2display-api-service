import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../client/logger/logger", () => ({
  default: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import ApiHelper from "../../client/data-sync/api-helper";
import localStorageKeys from "../../client/util/local-storage-keys";

const MEDIA_PATH = "/v2/media/01ARZ3NDEKTSV4RRFFQ69G5FAV";

/**
 * Resolve a getPath() promise, letting any backoff timers run.
 *
 * @param {Promise} promise The getPath() promise.
 * @returns {Promise<any>} The resolved value.
 */
async function resolveWithTimers(promise) {
  await vi.advanceTimersByTimeAsync(30000);

  return promise;
}

describe("ApiHelper.getPath retries throttled requests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem(localStorageKeys.API_TOKEN, "a-token");
    localStorage.setItem(localStorageKeys.TENANT_KEY, "a-tenant-key");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("retries a 503 and returns the data from the retry", async () => {
    // A screen client on a multi-region layout fires far more requests per
    // pull than the reverse proxy rate limit allows, so a timing dependent
    // tail of them is rejected. Without a retry the rejected request becomes
    // a silent null and the region renders black. See #507.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers() })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ "@id": MEDIA_PATH }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveWithTimers(
      new ApiHelper("").getPath(MEDIA_PATH),
    );

    expect(result).toEqual({ "@id": MEDIA_PATH });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 and returns the data from the retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers() })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ "@id": MEDIA_PATH }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveWithTimers(
      new ApiHelper("").getPath(MEDIA_PATH),
    );

    expect(result).toEqual({ "@id": MEDIA_PATH });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up and returns null when every attempt is throttled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, headers: new Headers() });

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveWithTimers(
      new ApiHelper("").getPath(MEDIA_PATH),
    );

    expect(result).toBeNull();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not retry a 401 and triggers reauthenticate once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, headers: new Headers() });

    vi.stubGlobal("fetch", fetchMock);

    const reauthenticate = vi.fn();
    document.addEventListener("reauthenticate", reauthenticate);

    const result = await resolveWithTimers(
      new ApiHelper("").getPath(MEDIA_PATH),
    );

    document.removeEventListener("reauthenticate", reauthenticate);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reauthenticate).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, headers: new Headers() });

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveWithTimers(
      new ApiHelper("").getPath(MEDIA_PATH),
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
