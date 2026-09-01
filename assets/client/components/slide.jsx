import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import ErrorBoundary from "./error-boundary.jsx";
import logger from "../logger/logger";
import { renderSlide } from "../../shared/slide-utils/templates.js";
import "./slide.scss";

// A slide must be on screen this long before the region acts on slideDone().
// Templates may finish while mounting -- a video slide with no playable media
// calls slideDone() synchronously from its own effect -- and a region replays a
// slide by handing it a new run id, so an unguarded advance becomes an
// unbounded effect -> slideDone -> new run id -> effect loop. Matches the
// region's 1s CSSTransition, so a cross-fade can always finish before the next
// advance.
export const MIN_SLIDE_DWELL_MS = 1000;

/**
 * Slide component.
 *
 * @param {object} props - Props.
 * @param {object} props.slide - The slide data.
 * @param {string} props.id - The unique slide id.
 * @param {number} props.run - Run id. Changes each time the slide should run.
 * @param {Function} props.slideDone - The function to call when the slide is done running.
 * @param {Function} props.slideError - Callback when slide encountered an error.
 * @param {object} props.forwardRef - Ref to the slide root element. Used as
 *   nodeRef by the region's CSSTransition.
 * @returns {object} - The component.
 */
function Slide({ slide, id, run, slideDone, slideError, forwardRef }) {
  const slideDoneRef = useRef(slideDone);
  const pendingDoneRef = useRef(null);
  const runStartRef = useRef({ run: null, at: 0 });

  // When the current run started, recorded during render rather than in an
  // effect: React runs a child's effects before its parent's, so a template
  // that finishes while mounting would call slideDone() before an effect here
  // had run, and the very first advance would escape the guard.
  //
  // performance.now() rather than Date.now() because it is monotonic -- a wall
  // clock step on a screen that has been up for weeks must not make a slide
  // advance instantly or hang. The timer coarsening that rules a clock out for
  // run ids does not matter to a one second floor.
  if (runStartRef.current.run !== run) {
    runStartRef.current = { run, at: performance.now() };
  }

  // Read when the dwell timer fires, long after the effect ran, so it has to
  // come from a ref. Same discipline as the slide execution hooks.
  useLayoutEffect(() => {
    slideDoneRef.current = slideDone;
  });

  useEffect(() => {
    // A deferred advance belongs to the run that scheduled it. Letting it
    // survive into the next run would advance the region twice.
    return () => {
      if (pendingDoneRef.current !== null) {
        clearTimeout(pendingDoneRef.current);
        pendingDoneRef.current = null;
      }
    };
  }, [run]);

  /**
   * Report the slide done, no sooner than MIN_SLIDE_DWELL_MS into the run.
   *
   * @param {object} doneSlide - The slide that finished.
   */
  const slideDoneAfterMinimumDwell = useCallback((doneSlide) => {
    // Already waiting: a template that signals more than once in a single run
    // still advances the region only once.
    if (pendingDoneRef.current !== null) {
      return;
    }

    const remaining =
      MIN_SLIDE_DWELL_MS - (performance.now() - runStartRef.current.at);

    if (remaining <= 0) {
      slideDoneRef.current(doneSlide);
      return;
    }

    pendingDoneRef.current = setTimeout(() => {
      pendingDoneRef.current = null;
      slideDoneRef.current(doneSlide);
    }, remaining);
  }, []);

  /**
   * Handle errors in ErrorBoundary.
   *
   * Call slideDone after a timeout to ensure progression.
   */
  const handleError = () => {
    logger.warn("Slide error boundary triggered.");

    setTimeout(() => {
      slideError(slide);
    }, 5000);
  };

  return (
    <div
      ref={forwardRef}
      id={id}
      className="slide"
      data-run={run}
      data-execution-id={slide.executionId}
    >
      <ErrorBoundary errorHandler={handleError}>
        {renderSlide(slide, run, slideDoneAfterMinimumDwell)}
      </ErrorBoundary>
    </div>
  );
}

export default Slide;
