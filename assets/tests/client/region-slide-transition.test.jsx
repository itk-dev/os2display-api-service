import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

const { slideDoneCallbacks } = vi.hoisted(() => ({
  slideDoneCallbacks: new Map(),
}));

vi.mock("../../client/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub the template rendering: the real templates pull in styled-components
// and media loading, which is irrelevant to the region transition.
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

describe("Region cross-fades between slides", () => {
  beforeEach(() => {
    slideDoneCallbacks.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("applies the transition classes when moving to the next slide", () => {
    const slideA = createSlide("EXECUTIONA");
    const slideB = createSlide("EXECUTIONB");

    const { container } = render(
      <Region
        region={{ "@id": `/v2/regions/${REGION_ID}`, gridArea: ["a"] }}
      />,
    );

    act(() => {
      document.dispatchEvent(
        new CustomEvent(`regionContent-${REGION_ID}`, {
          detail: { slides: [slideA, slideB] },
        }),
      );
    });

    // The first slide is playing.
    expect(container.querySelector("#EXECUTIONA")).toBeInTheDocument();

    // The first slide finishes, so the region moves on to the second one.
    act(() => {
      slideDoneCallbacks.get("EXECUTIONA")(slideA);
    });

    // Both slides are mounted while the transition runs.
    expect(container.querySelectorAll(".slide")).toHaveLength(2);

    // The incoming slide fades in, the outgoing slide fades out.
    expect(container.querySelector("#EXECUTIONB").className).toContain(
      "slide-enter-active",
    );
    expect(container.querySelector("#EXECUTIONA").className).toContain(
      "slide-exit-active",
    );
  });
});
