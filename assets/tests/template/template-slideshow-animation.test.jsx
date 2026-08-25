import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import slideshow from "../../shared/templates/slideshow.jsx";

/**
 * Build a slideshow slide with a single image.
 *
 * @param {string | null} animation The animation setting.
 * @returns {object} The slide.
 */
function buildSlide(animation) {
  return {
    executionId: "EXE-ID-abc123",
    mediaData: {
      "/v2/media/image1": { assets: { uri: "http://localhost/image1.jpg" } },
    },
    content: {
      images: ["/v2/media/image1"],
      imageDuration: 5,
      transition: null,
      animation,
    },
  };
}

/**
 * Read the animation shorthand applied to the current image.
 *
 * jsdom does not expand the animation shorthand, so read it as a whole.
 *
 * @param {HTMLElement} container The render container.
 * @returns {string} The animation shorthand, empty when not animated.
 */
function getImageAnimation(container) {
  return container.querySelector(".image").style.animation;
}

/**
 * Find the transform the given keyframes animation starts out at.
 *
 * @param {string} name The keyframes name.
 * @returns {string} The transform of the 0% keyframe.
 */
function getKeyframesStartTransform(name) {
  let found = "";

  Array.from(document.styleSheets).forEach((sheet) => {
    Array.from(sheet.cssRules ?? []).forEach((rule) => {
      if (rule.type === CSSRule.KEYFRAMES_RULE && rule.name === name) {
        Array.from(rule.cssRules).forEach((keyframe) => {
          if (keyframe.keyText === "0%") {
            found = keyframe.style.transform;
          }
        });
      }
    });
  });

  return found;
}

describe("Slideshow template animation", () => {
  let styleElement = null;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mirrors the real client, which always has stylesheets in the document.
    styleElement = document.createElement("style");
    document.head.appendChild(styleElement);
  });

  afterEach(() => {
    cleanup();
    styleElement.remove();
    vi.useRealTimers();
  });

  it("does not animate when no animation is selected", () => {
    const { container } = render(
      slideshow.renderSlide(buildSlide(null), "run-1", vi.fn()),
    );

    expect(getImageAnimation(container)).toBe("");
  });

  it("stops animating when the slide is changed to no animation", () => {
    const { container, rerender } = render(
      slideshow.renderSlide(buildSlide("zoom-in-middle"), "run-1", vi.fn()),
    );

    expect(getImageAnimation(container)).not.toBe("");

    rerender(slideshow.renderSlide(buildSlide(null), "run-1", vi.fn()));

    expect(getImageAnimation(container)).toBe("");
  });

  it("picks up a changed animation without a remount", () => {
    const { container, rerender } = render(
      slideshow.renderSlide(buildSlide("zoom-in-middle"), "run-1", vi.fn()),
    );

    rerender(
      slideshow.renderSlide(buildSlide("zoom-out-middle"), "run-1", vi.fn()),
    );

    const [animationName] = getImageAnimation(container).split(" ");
    expect(animationName).not.toBe("");

    // zoom-out starts at scale(1.2), zoom-in starts at scale(1).
    expect(getKeyframesStartTransform(animationName)).toBe("scale(1.2)");
  });
});
