const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {}, Date, Intl, Map, Set };
for (const file of ['deadline-supplement.js', 'deadline-chart.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../../utils/CCFDDL/assets/js', file), 'utf8');
    vm.runInNewContext(source, context);
}
const chart = context.window.CCFDeadlineChart;
const meeting = (title, year, timeline = [], date = 'TBA') => ({
    title, confs: [{ year, date, timeline }]
});
const all = [
    meeting('SIGOPS ATC 2026', 2026),
    meeting('USENIX ATC 2027', 2027, [{ dateOnly: true, date: '2027-06-05' }]),
    meeting('NeurIPS 2026', 2026), meeting('ICLR 2027', 2027), meeting('CVPR 2027', 2027)
];
const filtered = all.map(conf => ({ conf }));
assert.equal(chart.selectedRows(filtered, all, 'auto', []).length, 3);
assert.equal(chart.selectedRows(filtered.slice(2), all, 'auto', [])[0].conf.title, 'NeurIPS 2026');
const custom = chart.selectedRows(filtered, all, 'custom', ['sigopsatc', 'neurips', 'missing']);
assert.equal(custom[0].conf.title, 'USENIX ATC 2027');
assert.equal(custom[1].conf.title, 'NeurIPS 2026');
assert.equal(custom[2].conf, null);
assert.equal(chart.eventMs({ dateOnly: true, date: '2027-06-05' }), Date.parse('2027-06-05T12:00:00Z'));
assert.equal(chart.eventMs({ dateOnly: true, date: '' }), null);
assert.equal(chart.eventMs({ deadlineMs: Date.parse('2026-10-01T23:59:59Z') }), Date.parse('2026-10-01T23:59:59Z'));
const followed = meeting('S&P 2027', 2027, [
    { type: 'paper', deadlineMs: Date.parse('2026-09-21T23:59:59Z') },
    { type: 'review_release', dateOnly: true, date: '2026-09-24' },
    { type: 'notification', deadlineMs: Date.parse('2026-09-27T23:59:59Z') }
]);
assert.equal(chart.nextEvent(followed, Date.parse('2026-09-22T00:00:00Z')).event.type, 'review_release');
assert.equal(chart.daysUntil('2026-09-24', Date.parse('2026-09-22T00:00:00Z')), 2);
assert.equal(chart.daysUntil('2026-09-22', Date.parse('2026-09-22T00:00:00Z')), 0);
assert.equal(chart.nextEvent(meeting('Exact 2027', 2027, [
    { deadlineMs: Date.parse('2026-09-23T23:59:59Z') },
    { deadlineMs: Date.parse('2026-09-22T23:59:59Z') }
]), Date.parse('2026-09-22T00:00:00Z')).ms, Date.parse('2026-09-22T23:59:59Z'));
assert.equal(chart.nextEvent(followed, Date.parse('2026-10-01T00:00:00Z')), null);
assert.equal(chart.conferenceDates(meeting('Test 2027', 2027, [], '2027-08-01 — 2027-08-05')).length, 2);
assert.deepEqual(Array.from(chart.conferenceDates(meeting('SANER 2027', 2027, [], 'March 9-12, 2027'))), [Date.parse('2027-03-09T12:00:00Z'), Date.parse('2027-03-12T12:00:00Z')]);
assert.deepEqual(Array.from(chart.conferenceDates(meeting('ACNS 2027', 2027, [], 'June 28 - July 1, 2027'))), [Date.parse('2027-06-28T12:00:00Z'), Date.parse('2027-07-01T12:00:00Z')]);
assert.equal(chart.conferenceDates(meeting('TBD 2027', 2027, [], 'May 2027 (exact dates TBD)')).length, 0);
const now = Date.parse('2026-09-22T00:00:00Z');
const oneYear = chart.axisRange(custom, '1Y', now);
assert.equal(new Date(oneYear.start).toISOString(), '2026-08-01T00:00:00.000Z');
assert.equal(new Date(oneYear.end).toISOString(), '2027-08-01T00:00:00.000Z');
const panned = chart.panAxis(oneYear, 480, 960);
assert.equal(panned.start, oneYear.start - (oneYear.end - oneYear.start) / 2);
assert.equal(chart.panAxis(panned, -480, 960).start, oneYear.start);
assert.equal(panned.end - panned.start, oneYear.end - oneYear.start);
const zoomed = chart.centeredAxis(panned, '3M');
assert.equal((zoomed.start + zoomed.end) / 2, (panned.start + panned.end) / 2);
assert.equal(chart.monthTicks(zoomed).length >= 2, true);
const allRange = chart.axisRange(custom, 'ALL', now);
assert.ok(allRange.start < Date.parse('2027-06-05T00:00:00Z'));
assert.ok(allRange.end > Date.parse('2027-06-05T00:00:00Z'));
assert.equal(chart.monthTicks(oneYear).length, 12);
assert.deepEqual(Array.from(chart.yearBands(oneYear), band => band.year), [2026, 2027]);
assert.equal(chart.yearBands(oneYear)[0].percent, 0);
assert.equal(Math.round(chart.yearBands(oneYear).reduce((sum, band) => sum + band.width, 0)), 100);
assert.equal(chart.monthTicks(chart.axisRange(custom, '3M', now)).length, 3);
assert.equal(chart.monthTicks(chart.axisRange(custom, '6M', now)).length, 6);
const rebuttalEvents = [
    { type: 'rebuttal_start', cycle: 'Round 1', deadlineMs: Date.parse('2027-01-01T00:00:00Z') },
    { type: 'rebuttal_end', cycle: 'Round 2', deadlineMs: Date.parse('2027-01-03T00:00:00Z') },
    { type: 'rebuttal_end', cycle: 'Round 1', deadlineMs: Date.parse('2027-01-05T00:00:00Z') }
];
const paired = chart.eventPeriods(rebuttalEvents);
assert.equal(paired.periods.length, 1);
assert.equal(paired.periods[0].end, rebuttalEvents[2].deadlineMs);
assert.deepEqual(Array.from(paired.used), [0, 2]);
assert.equal(chart.eventPeriods([{ type: 'rebuttal_start', deadlineMs: rebuttalEvents[0].deadlineMs }]).periods.length, 0);
const datedRange = chart.eventPeriods([{ type: 'rebuttal', dateOnly: true, date: '2027-02-01', endDate: '2027-02-04' }]);
assert.equal(datedRange.periods[0].end, Date.parse('2027-02-04T12:00:00Z'));
console.log('CCF deadline chart tests passed');
