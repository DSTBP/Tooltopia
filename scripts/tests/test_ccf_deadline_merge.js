const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '../../utils/CCFDDL/assets/js/deadline-supplement.js'),
    'utf8'
);
const context = { window: {}, Intl, Date, Set, Map };
vm.runInNewContext(source, context);
const { merge, mergeJiajun, mergeCycle, status, key, deadlineMs, roundOf } = context.window.CCFDeadlineSupplement;

assert.equal(deadlineMs('2026-05-06 23:59:59', 'AoE'), Date.parse('2026-05-07T11:59:59Z'));
assert.equal(deadlineMs('2026-05-06 23:59:59', 'PST'), Date.parse('2026-05-07T07:59:59Z'));
assert.equal(deadlineMs('2026-05-06 23:59:59', 'Asia/Seoul'), Date.parse('2026-05-06T14:59:59Z'));
assert.equal(roundOf('first round'), 'Round 1');
assert.equal(roundOf('Round 2 Paper Submission'), 'Round 2');
assert.equal(roundOf('截稿日期 [First Submission]'), 'Round 1');
assert.equal(roundOf('截稿日期 [Second Submission]'), 'Round 2');

const paperMs = Date.parse('2026-05-07T11:59:00Z');
const base = [{
    title: 'NeurIPS 2026',
    description: 'Conference on Neural Information Processing Systems',
    sub: 'AI',
    rank: { ccf: 'A' },
    confs: [{
        year: 2026,
        link: 'https://neurips.cc/',
        date: 'December 2026',
        place: 'Sydney',
        timeline: [
            { comment: '摘要截稿', deadlineMs: Date.parse('2026-05-05T11:59:00Z') },
            { comment: '截稿日期', deadlineMs: paperMs }
        ]
    }]
}];
const supplement = [{
    title: 'NeurIPS',
    year: 2026,
    full_name: 'Conference on Neural Information Processing Systems',
    link: 'https://neurips.cc/',
    city: 'Sydney',
    country: 'Australia',
    deadlines: [
        { type: 'paper', label: 'Paper submission deadline', date: '2026-05-06 23:59:59', timezone: 'AoE' },
        { type: 'review_release', label: 'Reviews released', date: '2026-07-22 23:59:59', timezone: 'AoE' },
        { type: 'rebuttal_start', label: 'Rebuttal starts', date: '2026-07-27 00:00:00', timezone: 'AoE' },
        { type: 'notification', label: 'Author notification', date: '2026-09-24 23:59:59', timezone: 'AoE' }
    ]
}, {
    title: 'RLC',
    year: 2026,
    full_name: 'Reinforcement Learning Conference',
    deadlines: [
        { type: 'paper', label: 'Round 1 Paper Submission', date: '2026-10-08 23:59:59', timezone: 'AoE' },
        { type: 'paper', label: 'Round 2 Paper Submission', date: '2026-11-08 23:59:59', timezone: 'AoE' }
    ]
}];

const result = merge(base, supplement);
assert.equal(result.length, 2);
assert.equal(key(result[0].title, 2026), 'neurips|2026');
assert.equal(key('ATC', 2026), key('SIGOPS ATC 2026', 2026));
assert.equal(key('CGO', 2027), key('IEEE/ACM CGO 2027', 2027));
assert.equal(result[0].rank.ccf, 'A');
assert.equal(result[0].confs[0].place, 'Sydney');
assert.equal(result[0].confs[0].timeline.filter(event => /paper|截稿日期/i.test(event.comment)).length, 1);
assert.equal(result[0].confs[0].timeline.length, 5);
assert.equal(status(result[0], Date.parse('2026-08-01T00:00:00Z')).state, 'passed');
assert.equal(result[1].supplementOnly, true);
assert.equal(result[1].sub, 'EXT');
assert.equal(result[1].confs[0].timeline.length, 2);
assert.equal(status(result[1], Date.parse('2026-10-10T00:00:00Z')).comment, 'Round 2 Paper Submission');

const legacy = merge([], [{
    title: 'CVPR',
    year: 2025,
    deadline: '2024-11-14 23:59:00',
    abstract_deadline: '2024-11-07 23:59:00',
    review_release_date: '2025-01-23 07:59:59',
    timezone: 'UTC-8'
}]);
assert.equal(legacy[0].confs[0].timeline.length, 3);
assert.equal(legacy[0].confs[0].timeline.find(event => event.type === 'abstract').deadlineMs, Date.parse('2024-11-08T07:59:00Z'));
assert.equal(legacy[0].confs[0].timeline.find(event => event.type === 'review_release').deadlineMs, Date.parse('2025-01-23T07:59:59Z'));

const monthlyCycles = Array.from({ length: 12 }, (_, index) => ({
    type: 'paper', cycle: `Month ${index + 1} cycle`,
    at: `2026-${String(index + 1).padStart(2, '0')}-01T17:00:00-07:00`,
    timezone: '5pm PT'
}));
const enriched = mergeJiajun(result, [{
    acronym: 'NeurIPS', year: 2026,
    events: [
        { type: 'paper', at: '2026-05-06T23:59:00-12:00', timezone: 'AoE' },
        { type: 'notification', date: '2026-09-24' },
        { type: 'camera_ready', date: '2026-10-10' }
    ]
}, {
    acronym: 'VLDB', year: 2027, conferenceStart: '2027-08-23',
    conferenceEnd: '2027-08-27', events: monthlyCycles
}, {
    acronym: 'SIGCOMM', year: 2027, conferenceStart: '2027-08-08',
    conferenceEnd: '2027-08-12', events: []
}]);
assert.equal(enriched.length, 4);
const neurips = enriched.find(item => key(item.title, item.confs[0].year) === 'neurips|2026');
assert.equal(neurips.confs[0].timeline.length, 6);
assert.equal(neurips.confs[0].timeline.filter(event => context.window.CCFDeadlineSupplement.typeOf(event) === 'paper').length, 1);
assert.equal(neurips.confs[0].timeline.filter(event => event.type === 'notification').length, 1);
assert.equal(neurips.confs[0].timeline.find(event => event.type === 'camera_ready').dateOnly, true);
assert.equal(status(neurips, Date.parse('2026-08-01T00:00:00Z')).state, 'passed');
const vldb = enriched.find(item => key(item.title, item.confs[0].year) === 'vldb|2027');
assert.equal(vldb.confs[0].timeline.length, 12);
assert.equal(vldb.supplementOnly, true);
assert.equal(vldb.confs[0].date, '2027-08-23 — 2027-08-27');
assert.equal(enriched.find(item => item.title === 'SIGCOMM 2027').confs[0].timeline.length, 0);
const sameDayRounds = mergeJiajun([], [{
    acronym: 'ICDE', year: 2027, events: [
        { type: 'paper', cycle: 'Round 1', at: '2026-06-11T17:00:00-07:00' },
        { type: 'paper', cycle: 'Round 2', at: '2026-06-11T17:00:00-07:00' }
    ]
}]);
assert.equal(sameDayRounds.length, 1);
assert.equal(sameDayRounds[0].confs[0].timeline.length, 2);
const aliasRows = mergeJiajun([{
    title: 'SIGOPS ATC 2026', description: 'ACM SIGOPS Annual Technical Conference',
    sub: 'DS', rank: { ccf: 'A' },
    confs: [{ year: 2026, date: 'TBA', timeline: [] }]
}, {
    title: 'IEEE/ACM CGO 2027', description: 'Code Generation and Optimization',
    sub: 'SE', rank: { ccf: 'B' },
    confs: [{ year: 2027, date: 'TBA', timeline: [] }]
}], [
    { acronym: 'ATC', year: 2026, events: [{ type: 'paper', at: '2026-06-10T23:59:59-12:00' }] },
    { acronym: 'CGO', year: 2027, events: [{ type: 'paper', at: '2026-09-01T23:59:59-12:00' }] }
]);
assert.equal(aliasRows.length, 2);
assert.equal(aliasRows[0].confs[0].timeline.length, 1);
assert.equal(aliasRows[1].confs[0].timeline.length, 1);
const cycleRows = mergeCycle([{
    title: 'SIGOPS ATC 2026', description: 'ACM SIGOPS Annual Technical Conference',
    sub: 'DS', rank: { ccf: 'A' },
    confs: [{ year: 2026, link: 'https://sigops.org/', date: 'TBA', tags: ['systems'],
        timeline: [{ type: 'paper', comment: '截稿日期',
            deadlineMs: Date.parse('2026-06-11T11:59:59Z'), source: 'ccfddl' }] }]
}], [{
    acronym: 'USENIX ATC', year: 2026, websiteUrl: 'https://other.example/',
    cfpUrl: 'https://example.com/cfp', dblpUrl: 'https://dblp.org/db/conf/usenix',
    changes: ['Deadline month changed'], events: [
        { type: 'paper', at: '2026-06-10T23:59:59Z' },
        { type: 'review_release', date: '2026-08-17' },
        { type: 'rebuttal_start', date: '2026-08-17' }
    ]
}]);
assert.equal(cycleRows.length, 1);
assert.equal(cycleRows[0].rank.ccf, 'A');
assert.equal(cycleRows[0].confs[0].link, 'https://sigops.org/');
assert.equal(cycleRows[0].confs[0].timeline.filter(event => event.type === 'paper').length, 1);
assert.equal(cycleRows[0].confs[0].timeline.length, 3);
assert.equal(cycleRows[0].confs[0].dblpUrl, 'https://dblp.org/db/conf/usenix');
assert.equal(cycleRows[0].confs[0].tags[0], 'systems');
const cgo = mergeCycle([{
    title: 'IEEE/ACM CGO 2027', sub: 'SE', rank: { ccf: 'B' },
    confs: [{ year: 2027, timeline: [
        { type: 'paper', comment: '截稿日期 [First Submission]', deadlineMs: Date.parse('2026-09-01T00:00:00Z') },
        { type: 'paper', comment: '截稿日期 [Second Submission]', deadlineMs: Date.parse('2026-11-01T00:00:00Z') }
    ] }]
}], [{ acronym: 'CGO', year: 2027, events: [
    { type: 'paper', cycle: 'Round 1', at: '2026-09-02T00:00:00Z' },
    { type: 'paper', cycle: 'Round 2', at: '2026-11-02T00:00:00Z' },
    { type: 'notification', cycle: 'Round 1', date: '2026-10-01' }
] }]);
assert.equal(cgo.length, 1);
assert.equal(cgo[0].confs[0].timeline.filter(event => event.type === 'paper').length, 2);
assert.equal(cgo[0].confs[0].timeline.filter(event => event.type === 'notification').length, 1);
const hfTagged = merge([], [{ title: 'Example', year: 2027, tags: ['AI'], deadlines: [
    { type: 'paper', label: 'Paper deadline', date: '2026-10-01 23:59:59', timezone: 'AoE' }
] }]);
const mixed = mergeCycle(hfTagged, [{ acronym: 'Example', year: 2027,
    cfpUrl: 'https://example.com/cfp', events: [
        { type: 'paper', at: '2026-10-02T12:00:00Z' },
        { type: 'camera_ready', date: '2027-01-01' }
    ] }]);
assert.equal(mixed.length, 1);
assert.equal(mixed[0].aiOnly, true);
assert.equal(mixed[0].cycleEnriched, true);
assert.equal(mixed[0].confs[0].tags[0], 'AI');
assert.equal(mixed[0].confs[0].timeline.filter(event => event.type === 'paper').length, 1);
assert.equal(mixed[0].confs[0].timeline.filter(event => event.type === 'camera_ready').length, 1);
const papersWithCode = merge(base, [{
    short_name: 'NeurIPS', year: 2026, name: 'NeurIPS 2026',
    tags: ['machine-learning'], deadlines: [
        { type: 'submission', label: 'Paper submission deadline',
            deadline_at: '2026-05-07T11:59:59Z', timezone: 'AoE' },
        { type: 'review_release', label: 'Reviews released',
            deadline_at: '2026-07-23T11:59:59Z', timezone: 'AoE' }
    ]
}, {
    short_name: 'NeurIPS', year: 2026, deadlines: [
        { type: 'review_release', label: 'Reviews released',
            deadline_at: '2026-07-23T11:59:59Z', timezone: 'AoE' }
    ]
}, {
    short_name: 'Example', year: 2027,
    deadlines: [{ type: 'paper', label: 'Round 1 Paper Submission',
        deadline_at: '2026-10-02T11:59:59Z', timezone: 'AoE' }]
}], 'paperswithcode');
assert.equal(papersWithCode.length, 2);
assert.equal(papersWithCode[0].pwcEnriched, true);
assert.equal(papersWithCode[0].rank.ccf, 'A');
assert.equal(papersWithCode[0].confs[0].timeline.filter(event => event.type === 'review_release').length, 1);
assert.equal(papersWithCode[0].confs[0].timeline.filter(event => event.source === 'paperswithcode').length, 1);
assert.equal(papersWithCode[1].pwcOnly, true);
assert.equal(papersWithCode[1].confs[0].timeline[0].deadlineMs, Date.parse('2026-10-02T11:59:59Z'));
const distinctSameType = merge([{
    title: 'SGP 2025', description: 'SGP', sub: 'CG', rank: { ccf: 'B' },
    confs: [{ year: 2025, timeline: [{ type: 'paper', comment: '截稿日期',
        deadlineMs: Date.parse('2025-01-01T00:00:00Z') }] }]
}], [{ short_name: 'SGP', year: 2025, deadlines: [
    { type: 'camera_ready', label: 'Revised version due (Round 1)',
        deadline_at: '2025-02-01T00:00:00Z' },
    { type: 'camera_ready', label: 'Camera ready due (Round 1)',
        deadline_at: '2025-03-01T00:00:00Z' }
] }], 'paperswithcode');
assert.equal(distinctSameType.length, 1);
assert.equal(distinctSameType[0].confs[0].timeline.filter(event => event.type === 'camera_ready').length, 2);
console.log('CCF deadline merge tests passed');
