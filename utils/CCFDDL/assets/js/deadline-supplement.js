/* Data-only merge logic for the CCF calendar and the Papers with Code snapshot. */
window.CCFDeadlineSupplement = (() => {
    const submissionTypes = new Set(['abstract', 'paper', 'registration', 'commitment_deadline']);

    function key(name, year) {
        return `${String(name || '').replace(/\s+\d{4}$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase()}|${year}`;
    }

    function typeOf(event) {
        const type = String(event.type || '').toLowerCase().replace(/-/g, '_');
        if (type === 'submission') return 'paper';
        if (type) return type;
        const label = String(event.comment || '');
        if (/摘要|abstract/i.test(label)) return 'abstract';
        if (/注册|registration/i.test(label)) return 'registration';
        return /截稿|投稿|submission|paper/i.test(label) ? 'paper' : 'other';
    }

    function roundOf(label) {
        const match = String(label || '').match(/round\s*\d+|(?:first|second|third)\s+cycle|第[一二三四1234]轮/i);
        return match ? match[0] : '';
    }

    function eventMs(event) {
        return Number.isFinite(event.deadlineMs) ? event.deadlineMs : null;
    }

    function mergeTimeline(base, additions) {
        const result = [...base];
        const consumed = new Set();
        for (const original of base) {
            const originalType = typeOf(original);
            if (!submissionTypes.has(originalType) || eventMs(original) === null) continue;
            const candidates = additions
                .map((event, index) => ({ event, index }))
                .filter(({ event, index }) =>
                    !consumed.has(index) &&
                    typeOf(event) === originalType &&
                    (!roundOf(original.comment) || roundOf(original.comment).toLowerCase() === roundOf(event.comment).toLowerCase())
                )
                .sort((a, b) =>
                    Math.abs(eventMs(a.event) - eventMs(original)) -
                    Math.abs(eventMs(b.event) - eventMs(original))
                );
            if (candidates.length) consumed.add(candidates[0].index);
        }
        additions.forEach((event, index) => {
            if (consumed.has(index)) return;
            const duplicate = result.some(existing =>
                typeOf(existing) === typeOf(event) &&
                roundOf(existing.comment).toLowerCase() === roundOf(event.comment).toLowerCase() &&
                eventMs(existing) === eventMs(event) &&
                existing.comment === event.comment
            );
            if (!duplicate) result.push(event);
        });
        return result;
    }

    function fromApi(record) {
        const events = (record.deadlines || []).map(event => ({
            type: event.type,
            comment: event.label || event.type,
            timezone: event.timezone || 'UTC',
            deadlineMs: Date.parse(event.deadline_at),
            source: 'paperswithcode'
        })).filter(event => Number.isFinite(event.deadlineMs));
        return {
            title: `${record.short_name} ${record.year}`,
            description: record.name || record.short_name,
            sub: 'EXT',
            rank: { ccf: 'N' },
            supplementOnly: true,
            confs: [{
                year: record.year,
                link: record.url || '#',
                timezone: 'UTC',
                date: [record.start_date, record.end_date].filter(Boolean).join(' — ') || 'TBA',
                place: record.location || 'TBA',
                venue: record.venue || '',
                tags: record.tags || [],
                timeline: events
            }]
        };
    }

    function merge(base, snapshot) {
        const output = base.map(entry => ({
            ...entry,
            confs: [{ ...entry.confs[0], timeline: [...(entry.confs[0].timeline || [])] }]
        }));
        const byKey = new Map(output.map((entry, index) => [key(entry.title, entry.confs[0].year), index]));
        for (const record of snapshot.results) {
            const supplement = fromApi(record);
            const match = byKey.get(key(record.short_name, record.year));
            if (match === undefined) {
                byKey.set(key(record.short_name, record.year), output.length);
                output.push(supplement);
                continue;
            }
            const entry = output[match];
            const conf = entry.confs[0];
            const extra = supplement.confs[0];
            if (!entry.description || entry.description === 'TBA') entry.description = supplement.description;
            if (!conf.link || conf.link === '#') conf.link = extra.link;
            if (!conf.date || conf.date === 'TBA') conf.date = extra.date;
            if (!conf.place || conf.place === 'TBA') conf.place = extra.place;
            conf.venue = extra.venue || conf.venue || '';
            conf.tags = extra.tags;
            conf.timeline = mergeTimeline(conf.timeline, extra.timeline);
            entry.enriched = true;
        }
        return output;
    }

    function status(entry, now = Date.now()) {
        const events = (entry.confs[0]?.timeline || [])
            .filter(event => submissionTypes.has(typeOf(event)) && eventMs(event) !== null)
            .sort((a, b) => eventMs(a) - eventMs(b));
        const next = events.find(event => eventMs(event) > now);
        if (next) {
            const diff = eventMs(next) - now;
            return {
                ms: eventMs(next),
                event: next,
                comment: next.comment,
                isUrgent: diff <= 30 * 24 * 60 * 60 * 1000,
                state: diff <= 30 * 24 * 60 * 60 * 1000 ? 'upcoming' : 'open'
            };
        }
        const last = events.at(-1);
        return last
            ? { ms: eventMs(last), event: last, comment: last.comment, isUrgent: false, state: 'passed' }
            : { ms: null, event: null, comment: '', isUrgent: false, state: 'tbd' };
    }

    return { key, merge, status, typeOf, roundOf };
})();
