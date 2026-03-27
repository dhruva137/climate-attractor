/**
 * Annotations — Event markers across all views.
 */

const Annotations = (() => {

  const EVENTS = [
    { t: -800000, label: 'Record start', short: '800 Ka',
      description: 'Oldest EPICA Dome C ice core data point.', doi: null },
    { t: -430000, label: 'Penultimate interglacial', short: 'MIS 11',
      description: 'Marine Isotope Stage 11 — the longest and warmest interglacial of the 800 Ka record.',
      doi: '10.1038/nature01120' },
    { t: -334000, label: 'Mid-Pleistocene Transition', short: 'MPT',
      description: 'Climate cycles shifted from 41 kyr obliquity-paced to 100 kyr eccentricity-paced. Cause still debated.',
      doi: '10.1016/j.quascirev.2007.06.009' },
    { t: -130000, label: 'Last interglacial', short: 'MIS 5e',
      description: 'Eemian interglacial. Sea levels ~6–9 m higher than today. Global temps ~1–2 °C warmer.',
      doi: '10.1126/science.1234414' },
    { t: -21000, label: 'Last Glacial Maximum', short: 'LGM',
      description: 'Ice sheets covered much of North America and Europe. Sea level ~120 m lower than today.',
      doi: null },
    { t: -11700, label: 'Holocene begins', short: 'Holocene',
      description: 'End of last ice age. Stable warm climate enables agriculture and civilization.', doi: null },
    { t: -7000, label: 'Holocene optimum', short: 'HCO',
      description: 'Holocene Climate Optimum — peak Holocene warmth in Northern Hemisphere.', doi: null },
    { t: -175, label: 'Industrial Revolution', short: 'Industrial',
      description: 'CO₂ begins accelerating beyond any level in 800,000 years of ice core records.',
      doi: '10.1126/science.1177072' },
    { t: -74, label: 'Present (2026 CE)', short: 'Now',
      description: 'CO₂: ~422 ppm. Temperature anomaly: ~1.3 °C above pre-industrial. Rate of change 100× faster than any natural transition.',
      doi: '10.5194/essd-15-2295-2023' },
  ];

  function init() {
    console.log('[Annotations] %d events registered', EVENTS.length);
  }

  function getVisibleEvents(currentAgeBP) {
    return EVENTS.filter(e => Math.abs(e.t) <= Math.abs(currentAgeBP) + 5000);
  }

  function getAll() { return EVENTS; }

  return Object.freeze({ init, getVisibleEvents, getAll });
})();
