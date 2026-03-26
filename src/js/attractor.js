/**
 * Attractor — Convex hull utilities for phase portrait and t-SNE views.
 */

const Attractor = (() => {

  /**
   * Compute the convex hull from an array of [x, y] screen-coordinate points.
   * Filters out NaN/null before computing. Returns null if < 3 valid points.
   */
  function computeHull(points2D) {
    const valid = points2D.filter(p =>
      p && isFinite(p[0]) && isFinite(p[1])
    );
    if (valid.length < 3) return null;
    return d3.polygonHull(valid);
  }

  /**
   * Returns the signed area of a hull polygon.
   */
  function hullArea(hull) {
    if (!hull) return 0;
    return Math.abs(d3.polygonArea(hull));
  }

  /**
   * Returns true if [x, y] lies outside the hull polygon.
   */
  function isOutsideHull(point, hull) {
    if (!hull || !point) return false;
    return !d3.polygonContains(hull, point);
  }

  /**
   * Returns the centroid [x, y] of a hull polygon.
   */
  function hullCentroid(hull) {
    if (!hull) return [0, 0];
    return d3.polygonCentroid(hull);
  }

  /**
   * Generate a smooth closed SVG path from hull points
   * using Catmull-Rom-style interpolation via D3 curve.
   */
  function smoothHull(hull, tension) {
    if (!hull || hull.length < 3) return '';
    tension = tension !== undefined ? tension : 0.3;

    // Close the loop: append first point at end
    const closed = hull.concat([hull[0]]);

    const lineGen = d3.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRomClosed.alpha(tension));

    return lineGen(hull);
  }

  return Object.freeze({
    computeHull,
    hullArea,
    isOutsideHull,
    hullCentroid,
    smoothHull,
  });
})();
