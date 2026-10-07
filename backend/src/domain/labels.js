// labels.js — pure label compliance check.
// Field = { crop, state, growth_stage }. Labels carry stage_min..stage_max and state '*'
// for all-states. A product is labelled for the field when at least one label row covers
// the crop, either the exact state or '*', and growth_stage falls within the range.

function isLabelledFor(labels, field) {
  if (!labels || !labels.length || !field) return false;
  const crop = field.crop.toUpperCase();
  const state = field.state.toUpperCase();
  const stage = field.growth_stage;
  return labels.some(l =>
    l.crop.toUpperCase() === crop &&
    (l.state === '*' || l.state.toUpperCase() === state) &&
    stage >= l.stage_min &&
    stage <= l.stage_max
  );
}

module.exports = { isLabelledFor };