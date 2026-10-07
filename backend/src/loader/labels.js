const { parseLabelledFor, parseStageRange } = require('./normalise');

function isLabelMatch(labels, crop, state, growthStage) {
  if (!labels || labels.length === 0) return false;
  return labels.some(l =>
    l.crop === crop &&
    (l.state === state || l.state === '*') &&
    growthStage >= l.stage_min &&
    growthStage <= l.stage_max
  );
}

module.exports = { parseLabelledFor, parseStageRange, isLabelMatch };