import ErrorBoundary from "./error-boundary.jsx";
import logger from "../logger/logger";
import { renderSlide } from "../../shared/slide-utils/templates.js";
import "./slide.scss";

/**
 * Render the slide's template.
 *
 * A component rather than a call in Slide's own render: renderSlide throws when
 * the slide names a template this build does not bundle, and an argument is
 * evaluated before ErrorBoundary mounts. The throw escaped the boundary meant
 * to contain it and hit the region's instead, which has no handler and never
 * resets - so one unrenderable slide replaced its whole region with the error
 * fallback until the client was reloaded. Thrown from inside the boundary's
 * subtree it costs that one slide, which is then moved on from.
 *
 * @param {object} props - Props.
 * @param {object} props.slide - The slide data.
 * @param {string} props.run - Timestamp for when to run the slide.
 * @param {Function} props.slideDone - The function to call when the slide is done running.
 * @returns {object} - The rendered template.
 */
function SlideTemplate({ slide, run, slideDone }) {
  return renderSlide(slide, run, slideDone);
}

/**
 * Slide component.
 *
 * @param {object} props - Props.
 * @param {object} props.slide - The slide data.
 * @param {string} props.id - The unique slide id.
 * @param {string} props.run - Timestamp for when to run the slide.
 * @param {Function} props.slideDone - The function to call when the slide is done running.
 * @param {Function} props.slideError - Callback when slide encountered an error.
 * @param {object} props.forwardRef - Ref to the slide root element. Used as
 *   nodeRef by the region's CSSTransition.
 * @returns {object} - The component.
 */
function Slide({ slide, id, run, slideDone, slideError, forwardRef }) {
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
        <SlideTemplate slide={slide} run={run} slideDone={slideDone} />
      </ErrorBoundary>
    </div>
  );
}

export default Slide;
