/**
 * Whether a slide can actually be put on screen.
 *
 * A slide the pull could not load a template for is marked invalid and dropped
 * by Region. ScheduleService has to apply the same test when it decides whether
 * a region has content: counting slides the region will drop is what let a
 * screen whose templates all failed report itself as non-empty, so the fallback
 * image stayed hidden and the screen went black instead.
 *
 * @param {object} slide The slide to test.
 * @returns {boolean} True if the slide should be rendered.
 */
export default function isRenderableSlide(slide) {
  return slide?.invalid !== true;
}
