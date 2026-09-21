/* Merge the CCF calendar with live Hugging Face ai-deadlines entries. */
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
        return /截稿|投稿|submission|paper|(?:first|second|third)\s+round|round\s*\d+/i.test(label) ? 'paper' : 'other';
    }

    function roundOf(label) {
        const raw = String(label || '');
        const match = raw.match(/round\s*(\d+)|(?:first|second|third)\s+(?:round|cycle)|第[一二三四1234]轮/i);
        if (!match) return '';
        const words = { first: 1, second: 2, third: 3, '一': 1, '二': 2, '三': 3, '四': 4 };
        return `Round ${match[1] || words[match[0].split(/\s+/)[0].toLowerCase()] || words[match[0].charAt(1)] || match[0].match(/\d+/)?.[0]}`;
    }

    function eventMs(event) {
        return Number.isFinite(event.deadlineMs) ? event.deadlineMs : null;
    }

    function deadlineMs(dateText, timezone) {
        const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return null;
        const localMs = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0));
        const zone = String(timezone || 'AoE').trim();
        if (/^AoE$/i.test(zone)) return localMs + 12 * 3600000;
        if (/^(?:UTC|GMT)$/i.test(zone)) return localMs;
        if (/^PST$/i.test(zone)) return localMs + 8 * 3600000;
        if (/^PDT$/i.test(zone)) return localMs + 7 * 3600000;
        const fixed = zone.match(/^(?:UTC|GMT)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
        if (fixed) {
            const minutes = (+fixed[2] * 60 + +(fixed[3] || 0)) * (fixed[1] === '+' ? 1 : -1);
            return localMs - minutes * 60000;
        }
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
            });
            let utcMs = localMs;
            for (let attempt = 0; attempt < 2; attempt++) {
                const parts = Object.fromEntries(formatter.formatToParts(new Date(utcMs))
                    .filter(part => part.type !== 'literal')
                    .map(part => [part.type, Number(part.value)]));
                const shownMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
                utcMs += localMs - shownMs;
            }
            return utcMs;
        } catch (_) {
            return null;
        }
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
            if (candidates.length && Math.abs(eventMs(candidates[0].event) - eventMs(original)) <= 60000) {
                consumed.add(candidates[0].index);
            }
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

    function fromSource(record) {
        const events = (record.deadlines || []).map(event => ({
            type: event.type,
            comment: event.label || event.type,
            timezone: event.timezone || 'AoE',
            deadlineMs: deadlineMs(event.date, event.timezone),
            source: 'aideadlines'
        })).filter(event => Number.isFinite(event.deadlineMs));
        const legacy = [
            ['deadline', 'paper', '论文投稿', record.timezone || 'AoE'],
            ['abstract_deadline', 'abstract', '摘要截稿', record.timezone || 'AoE'],
            ['review_release_date', 'review_release', '审稿意见公布', 'UTC'],
            ['rebuttal_period_end', 'rebuttal_end', '答辩结束', 'UTC'],
            ['final_decision_date', 'notification', '结果通知', 'UTC']
        ];
        for (const [field, type, comment, timezone] of legacy) {
            if (!record[field] || events.some(event => typeOf(event) === type)) continue;
            const ms = deadlineMs(record[field], timezone);
            if (ms !== null) events.push({ type, comment, timezone, deadlineMs: ms, source: 'aideadlines' });
        }
        return {
            title: `${record.title} ${record.year}`,
            description: record.full_name || record.title,
            sub: 'EXT',
            rank: { ccf: 'N' },
            supplementOnly: true,
            confs: [{
                year: record.year,
                link: record.link || '#',
                timezone: 'UTC',
                date: record.date || [record.start, record.end].filter(Boolean).join(' — ') || 'TBA',
                place: [record.city, record.country].filter(Boolean).join(', ') || 'TBA',
                venue: record.venue || '',
                tags: record.tags || [],
                timeline: events
            }]
        };
    }

    function merge(base, records) {
        const output = base.map(entry => ({
            ...entry,
            confs: [{ ...entry.confs[0], timeline: [...(entry.confs[0].timeline || [])] }]
        }));
        const byKey = new Map(output.map((entry, index) => [key(entry.title, entry.confs[0].year), index]));
        for (const record of records) {
            if (!record.title || !record.year) continue;
            const supplement = fromSource(record);
            const match = byKey.get(key(record.title, record.year));
            if (match === undefined) {
                byKey.set(key(record.title, record.year), output.length);
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
            conf.tags = [...new Set([...(conf.tags || []), ...extra.tags])];
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

    return { key, merge, status, typeOf, roundOf, deadlineMs };
})();
