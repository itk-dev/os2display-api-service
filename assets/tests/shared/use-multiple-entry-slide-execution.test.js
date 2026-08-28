import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import useMultipleEntrySlideExecution from "../../shared/slide-utils/useMultipleEntrySlideExecution.js";

const SLIDE = { executionId: "EXE-ID" };
const ENTRIES = [{ title: "one" }, { title: "two" }, { title: "three" }];

/**
 * Render the hook, exposing a rerender that merges into the current props.
 *
 * @param {object} props Overrides for the default props.
 * @returns {object} The renderHook result, with a props-merging rerender.
 */
function render(props = {}) {
  let currentProps = {
    entries: ENTRIES,
    run: "run-1",
    slide: SLIDE,
    slideDone: vi.fn(),
    entryDuration: 1000,
    ...props,
  };

  const rendered = renderHook(
    (hookProps) => useMultipleEntrySlideExecution(hookProps),
    { initialProps: currentProps },
  );

  return {
    ...rendered,
    rerender: (next) => {
      currentProps = { ...currentProps, ...next };
      act(() => rendered.rerender(currentProps));
    },
  };
}

describe("useMultipleEntrySlideExecution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports nothing until the slide runs", () => {
    const slideDone = vi.fn();
    const { result } = render({ run: "", slideDone });

    expect(result.current.entryIndex).toBeNull();
    expect(result.current.currentEntry).toBeNull();

    act(() => vi.advanceTimersByTime(60000));
    expect(slideDone).not.toHaveBeenCalled();
  });

  it("shows the first entry when the slide starts", () => {
    const { result, rerender } = render({ run: "" });

    rerender({ run: "run-1" });

    expect(result.current.entryIndex).toBe(0);
    expect(result.current.currentEntry).toBe(ENTRIES[0]);
  });

  it("cycles through the entries one entryDuration apart", () => {
    const { result } = render();

    expect(result.current.entryIndex).toBe(0);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.entryIndex).toBe(1);
    expect(result.current.currentEntry).toBe(ENTRIES[1]);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.entryIndex).toBe(2);
    expect(result.current.currentEntry).toBe(ENTRIES[2]);
  });

  it("calls slideDone with the slide after the last entry", () => {
    const slideDone = vi.fn();
    render({ slideDone });

    act(() => vi.advanceTimersByTime(2999));
    expect(slideDone).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(slideDone).toHaveBeenCalledExactlyOnceWith(SLIDE);
  });

  it("falls back to 15s when entryDuration is not a positive number", () => {
    const { result } = render({ entryDuration: 0 });

    act(() => vi.advanceTimersByTime(14999));
    expect(result.current.entryIndex).toBe(0);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.entryIndex).toBe(1);
  });

  it("is a no-op on an empty entries array", () => {
    const slideDone = vi.fn();
    const { result } = render({ entries: [], slideDone });

    act(() => vi.advanceTimersByTime(60000));

    expect(result.current.entryIndex).toBeNull();
    expect(result.current.currentEntry).toBeNull();
    // Templates add their own short fallback timer for this case.
    expect(slideDone).not.toHaveBeenCalled();
  });

  it("clears its state when the slide stops running", () => {
    const { result, rerender } = render();

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.entryIndex).toBe(1);

    rerender({ run: "" });

    expect(result.current.entryIndex).toBeNull();
    expect(result.current.currentEntry).toBeNull();
  });

  it("clears the timer on unmount", () => {
    const slideDone = vi.fn();
    const { result, unmount } = render({ slideDone });

    expect(result.current.entryIndex).toBe(0);

    unmount();
    act(() => vi.advanceTimersByTime(60000));

    expect(slideDone).not.toHaveBeenCalled();
  });

  it("uses the latest slideDone without restarting the cycle", () => {
    const firstSlideDone = vi.fn();
    const secondSlideDone = vi.fn();
    const { rerender } = render({ slideDone: firstSlideDone });

    act(() => vi.advanceTimersByTime(1000));
    rerender({ slideDone: secondSlideDone });
    act(() => vi.advanceTimersByTime(2000));

    expect(firstSlideDone).not.toHaveBeenCalled();
    expect(secondSlideDone).toHaveBeenCalledExactlyOnceWith(SLIDE);
  });
});
