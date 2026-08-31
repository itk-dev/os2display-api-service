import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

const { slideDoneCallbacks } = vi.hoisted(() => ({
  slideDoneCallbacks: new Map(),
}));

vi.mock("../../client/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub the template rendering: the real templates pull in styled-components
// and media loading, which is irrelevant to the run id.
vi.mock("../../shared/slide-utils/templates.js", () => ({
  renderSlide: (slide, run, slideDone) => {
    slideDoneCallbacks.set(slide.executionId, slideDone);
    return <div data-testid={`template-${slide.executionId}`} />;
  },
  getConfig: () => ({}),
}));

vi.mock("../../client/components/region.scss", () => ({}));
vi.mock("../../client/components/slide.scss", () => ({}));

import Region from "../../client/components/region.jsx";

const REGION_ID = "01JB1D9E3ZMTFBT7CYHFHGX5KA";

/**
 * Build a minimal slide.
 *
 * @param {string} executionId - The execution id.
 * @returns {object} The slide.
 */
function createSlide(executionId) {
  return {
    executionId,
    templateData: { id: "template" },
    mediaData: {},
    content: {},
  };
}

describe("Region replays a single slide", () => {
  beforeEach(() => {
    slideDoneCallbacks.clear();

    // Freeze the clock. A single-slide region does not remount the slide (the
    // execution id, and so the React key, is unchanged), so replaying depends
    // entirely on the run id changing value. With a wall-clock run id, a
    // template calling slideDone() in the same millisecond it started produced
    // the same value, React bailed out of the update, and the region locked.
    // Only Date is faked, so real timers keep working.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("changes the run id on every slideDone, even within the same millisecond", () => {
    const slide = createSlide("EXECUTIONA");

    const { container } = render(
      <Region
        region={{ "@id": `/v2/regions/${REGION_ID}`, gridArea: ["a"] }}
      />,
    );

    act(() => {
      document.dispatchEvent(
        new CustomEvent(`regionContent-${REGION_ID}`, {
          detail: { slides: [slide] },
        }),
      );
    });

    const runIdOf = () => container.querySelector("#EXECUTIONA")?.dataset.run;

    const firstRun = runIdOf();
    expect(firstRun).toBeTruthy();

    // The slide finishes. It is the only slide, so it must start over.
    act(() => {
      slideDoneCallbacks.get("EXECUTIONA")(slide);
    });

    const secondRun = runIdOf();
    expect(secondRun).toBeTruthy();
    expect(secondRun).not.toBe(firstRun);

    // And it keeps going, rather than advancing exactly once.
    act(() => {
      slideDoneCallbacks.get("EXECUTIONA")(slide);
    });

    const thirdRun = runIdOf();
    expect(thirdRun).toBeTruthy();
    expect(thirdRun).not.toBe(secondRun);
  });
});
