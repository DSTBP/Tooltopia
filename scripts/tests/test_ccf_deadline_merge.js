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
const { merge, status, key, deadlineMs, roundOf } = context.window.CCFDeadlineSupplement;

assert.equal(deadlineMs('2026-05-06 23:59:59', 'AoE'), Date.parse('2026-05-07T11:59:59Z'));
assert.equal(deadlineMs('2026-05-06 23:59:59', 'PST'), Date.parse('2026-05-07T07:59:59Z'));
assert.equal(deadlineMs('2026-05-06 23:59:59', 'Asia/Seoul'), Date.parse('2026-05-06T14:59:59Z'));
assert.equal(roundOf('first round'), 'Round 1');
assert.equal(roundOf('Round 2 Paper Submission'), 'Round 2');

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
console.log('CCF deadline merge tests passed');
