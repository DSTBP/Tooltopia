const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '../../utils/CCFDDL/assets/js/deadline-supplement.js'),
    'utf8'
);
const context = { window: {} };
vm.runInNewContext(source, context);
const { merge, status, key } = context.window.CCFDeadlineSupplement;

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
const supplement = { results: [{
    short_name: 'NeurIPS',
    year: 2026,
    name: 'NeurIPS 2026',
    location: 'Sydney, Australia',
    deadlines: [
        { type: 'paper', label: 'Paper submission deadline', deadline_at: '2026-05-07T11:59:59Z', timezone: 'AoE' },
        { type: 'review_release', label: 'Reviews released', deadline_at: '2026-07-23T11:59:59Z', timezone: 'AoE' },
        { type: 'rebuttal_start', label: 'Rebuttal starts', deadline_at: '2026-07-27T12:00:00Z', timezone: 'AoE' },
        { type: 'notification', label: 'Author notification', deadline_at: '2026-09-25T11:59:59Z', timezone: 'AoE' }
    ]
}, {
    short_name: 'RLC',
    year: 2026,
    name: 'RLC 2026',
    deadlines: [
        { type: 'registration', label: 'Round 1 Paper Registration', deadline_at: '2026-10-01T11:59:59Z', timezone: 'AoE' },
        { type: 'submission', label: 'Round 1 Paper Submission', deadline_at: '2026-10-08T11:59:59Z', timezone: 'AoE' },
        { type: 'submission', label: 'Round 2 Paper Submission', deadline_at: '2026-11-08T11:59:59Z', timezone: 'AoE' }
    ]
}] };

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
assert.equal(status(result[1], Date.parse('2026-10-09T00:00:00Z')).comment, 'Round 2 Paper Submission');
console.log('CCF deadline merge tests passed');
