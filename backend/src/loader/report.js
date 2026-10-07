function pad(s, n) {
  return String(s).padEnd(n, ' ');
}

function printReport(stats, ruleCounts) {
  console.log('\n=== LOADER REPORT ===\n');

  const fileHeader = ['File', 'Read', 'Inserted', 'Updated', 'Unchanged', 'Quarantined'];
  console.log(fileHeader.map(h => pad(h, 14)).join(''));
  console.log(fileHeader.map(() => '──────────────').join(''));

  let totalRead = 0, totalInserted = 0, totalUpdated = 0, totalUnchanged = 0, totalQuarantined = 0;
  for (const stat of stats) {
    console.log(
      [stat.file, stat.read, stat.inserted, stat.updated, stat.unchanged, stat.quarantined]
        .map((v, i) => pad(v, 14)).join('')
    );
    totalRead += stat.read;
    totalInserted += stat.inserted;
    totalUpdated += stat.updated;
    totalUnchanged += stat.unchanged;
    totalQuarantined += stat.quarantined;
  }
  console.log(fileHeader.map(() => '──────────────').join(''));
  console.log(
    ['TOTAL', totalRead, totalInserted, totalUpdated, totalUnchanged, totalQuarantined]
      .map((v, i) => pad(v, 14)).join('')
  );

  if (totalQuarantined > 0) {
    console.log('\n--- Inconsistencies ---');
    const ruleHeader = ['Rule', 'Rows affected'];
    console.log(ruleHeader.map(h => pad(h, 22)).join(''));
    console.log(ruleHeader.map(() => '──────────────────────').join(''));
    for (const [ruleId, count] of Object.entries(ruleCounts)) {
      if (count > 0) {
        console.log([ruleId, String(count)].map((v, i) => pad(v, 22)).join(''));
      }
    }
  }
  console.log('\n========================\n');
}

function buildReportJson(stats, ruleCounts) {
  return {
    finished_at: new Date().toISOString(),
    files: stats,
    inconsistencies: ruleCounts,
    summary: {
      total_rows_read: stats.reduce((s, f) => s + f.read, 0),
      total_inserted: stats.reduce((s, f) => s + f.inserted, 0),
      total_updated: stats.reduce((s, f) => s + f.updated, 0),
      total_unchanged: stats.reduce((s, f) => s + f.unchanged, 0),
      total_quarantined: stats.reduce((s, f) => s + f.quarantined, 0),
    }
  };
}

module.exports = { printReport, buildReportJson };