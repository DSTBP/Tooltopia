/* Merge CCF calendar editions with conference supplement sources. */
window.CCFDeadlineSupplement = (() => {
    const submissionTypes = new Set(['abstract', 'paper', 'registration', 'commitment_deadline']);
    const acronymAliases = { atc: 'sigopsatc', usenixatc: 'sigopsatc', cgo: 'ieeeacmcgo' };
    // CCFDDL remains authoritative. The three middle sources are reserved until imported.
    const sourcePriority = {
        ccfddl: 0, ccfcycle: 1, aideadlines: 2, paperswithcode: 2,
        suanlab: 3, 'mpc-deadlines': 4, c01dkit: 5, jiajun: 6
    };

    function sourceOf(event) {
        return event.source || 'ccfddl';
    }

    function priorityOf(event) {
        return sourcePriority[sourceOf(event)] ?? 7;
    }

    function key(name, year) {
        const acronym = String(name || '').replace(/\s+\d{4}$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        return `${acronymAliases[acronym] || acronym}|${year}`;
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
        const match = raw.match(/round\s*(\d+)|(?:first|second|third)\s+(?:round|cycle|submission)|第[一二三四1234]轮/i);
        if (!match) return '';
        const words = { first: 1, second: 2, third: 3, '一': 1, '二': 2, '三': 3, '四': 4 };
        return `Round ${match[1] || words[match[0].split(/\s+/)[0].toLowerCase()] || words[match[0].charAt(1)] || match[0].match(/\d+/)?.[0]}`;
    }

    function eventMs(event) {
        return Number.isFinite(event.deadlineMs) ? event.deadlineMs : null;
    }

    function cycleOf(event) {
        return String(event.cycle || roundOf(event.comment) || '').trim().toLowerCase();
    }

    function eventDay(event) {
        if (event.dateOnly) return event.date;
        if (event.localDate) return event.localDate;
        const fromDeadline = String(event.deadline || '').match(/^(\d{4}-\d{2}-\d{2})/);
        if (fromDeadline) return fromDeadline[1];
        const ms = eventMs(event);
        if (ms === null) return '';
        const zone = String(event.timezone || 'UTC');
        if (zone.includes('/')) {
            try {
                const parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
                }).formatToParts(new Date(ms));
                const part = type => parts.find(item => item.type === type)?.value || '';
                return `${part('year')}-${part('month')}-${part('day')}`;
            } catch (_) { /* Use the fixed-offset path below. */ }
        }
        let offset = /^AoE$/i.test(zone) ? -12 * 60 : /^PST$/i.test(zone) ? -8 * 60 : /^PDT$/i.test(zone) ? -7 * 60 : 0;
        const match = zone.match(/^(?:UTC|GMT)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
        if (match) offset = (Number(match[2]) * 60 + Number(match[3] || 0)) * (match[1] === '+' ? 1 : -1);
        return new Date(ms + offset * 60000).toISOString().slice(0, 10);
    }

    function sameEvent(a, b) {
        if (typeOf(a) !== typeOf(b)) return false;
        if (typeOf(a) === 'milestone' && a.comment !== b.comment) return false;
        const aCycle = cycleOf(a);
        const bCycle = cycleOf(b);
        if (aCycle && bCycle && aCycle !== bCycle) return false;
        const aMs = eventMs(a);
        const bMs = eventMs(b);
        if (aMs !== null && bMs !== null) return Math.abs(aMs - bMs) <= 60000;
        return Boolean(eventDay(a) && eventDay(a) === eventDay(b));
    }

    function sameTimePoint(a, b) {
        const aMs = eventMs(a);
        const bMs = eventMs(b);
        if (aMs !== null && bMs !== null) return Math.abs(aMs - bMs) <= 60000;
        // A date-only event identifies a calendar day, not a fabricated midnight instant.
        return Boolean((a.dateOnly || b.dateOnly) && eventDay(a) && eventDay(a) === eventDay(b));
    }

    function sameStage(a, b, existingEvents) {
        if (typeOf(a) !== typeOf(b)) return false;
        if (typeOf(a) === 'milestone' && a.comment !== b.comment) return false;
        const aCycle = cycleOf(a);
        const bCycle = cycleOf(b);
        if (aCycle === bCycle) return true;
        // A source with one unlabelled submission usually means the first round.
        const labelled = aCycle || bCycle;
        return (!aCycle || !bCycle) && labelled === 'round 1' &&
            !existingEvents.some(event => typeOf(event) === typeOf(a) && cycleOf(event) === 'round 1');
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
        for (const event of additions) {
            const conflicts = result.filter(existing => sameEvent(existing, event) ||
                (sourceOf(existing) !== sourceOf(event) &&
                    (sameTimePoint(existing, event) ||
                        (base.includes(existing) && sameStage(existing, event, base)))));
            if (conflicts.some(existing => priorityOf(existing) <= priorityOf(event))) continue;
            for (const conflict of conflicts) result.splice(result.indexOf(conflict), 1);
            result.push(event);
        }
        return result;
    }

    function fromJiajun(record) {
        const labels = {
            abstract: '摘要截稿', paper: '论文投稿', notification: '结果通知',
            camera_ready: '终稿', review_release: '审稿意见公布',
            rebuttal: '答辩', revision_due: '修订截止', milestone: '时间节点'
        };
        const events = (record.events || []).map(event => {
            const ms = event.at ? Date.parse(event.at) : null;
            const offset = String(event.at || '').match(/(Z|[+-]\d{2}:\d{2})$/);
            const timezone = event.timezone === 'AoE' ? 'AoE'
                : offset ? (offset[1] === 'Z' ? 'UTC+0' : `UTC${offset[1]}`)
                    : (event.timezone || 'UTC');
            const cycle = String(event.cycle || '').trim();
            const label = String(event.label || labels[event.type] || event.type || '时间节点').trim();
            return {
                type: event.type,
                comment: cycle ? `${cycle} · ${label}` : label,
                cycle,
                timezone,
                deadlineMs: Number.isFinite(ms) ? ms : null,
                dateOnly: !Number.isFinite(ms),
                date: event.date || '',
                endDate: event.endDate || '',
                localDate: event.at ? event.at.slice(0, 10) : event.date || '',
                source: 'jiajun'
            };
        }).filter(event => event.deadlineMs !== null || event.date);
        const conferenceDate = [record.conferenceStart, record.conferenceEnd].filter(Boolean).join(' — ') || 'TBA';
        return {
            title: `${record.acronym} ${record.year}`,
            description: record.acronym,
            sub: 'EXT',
            rank: { ccf: 'N' },
            supplementOnly: true,
            jiajunOnly: true,
            confs: [{
                year: record.year, link: '#', timezone: 'UTC',
                date: conferenceDate, place: 'TBA', tags: [], timeline: events
            }]
        };
    }

    function mergeJiajun(base, records) {
        const output = base.map(entry => ({
            ...entry,
            confs: [{ ...entry.confs[0], timeline: [...(entry.confs[0].timeline || [])] }]
        }));
        const byKey = new Map(output.map((entry, index) => [key(entry.title, entry.confs[0].year), index]));
        for (const record of records) {
            if (!record.acronym || !record.year || !Array.isArray(record.events)) continue;
            const supplement = fromJiajun(record);
            const identity = key(record.acronym, record.year);
            const match = byKey.get(identity);
            if (match === undefined) {
                byKey.set(identity, output.length);
                output.push(supplement);
                continue;
            }
            const entry = output[match];
            const conf = entry.confs[0];
            const extra = supplement.confs[0];
            if (!conf.date || conf.date === 'TBA') conf.date = extra.date;
            conf.timeline = mergeTimeline(conf.timeline || [], extra.timeline);
            entry.jiajunEnriched = true;
        }
        return output;
    }

    function fromSource(record, source = 'aideadlines') {
        const events = (record.deadlines || []).map(event => ({
            type: event.type,
            comment: event.label || event.type,
            timezone: event.timezone || (source === 'paperswithcode' ? 'UTC' : 'AoE'),
            deadlineMs: source === 'paperswithcode'
                ? Date.parse(event.deadline_at) : deadlineMs(event.date, event.timezone),
            source
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
            if (ms !== null) events.push({ type, comment, timezone, deadlineMs: ms, source });
        }
        const acronym = record.title || record.short_name;
        return {
            title: `${acronym} ${record.year}`,
            description: record.full_name || record.name || acronym,
            sub: 'EXT',
            rank: { ccf: 'N' },
            supplementOnly: true,
            aiOnly: source === 'aideadlines',
            pwcOnly: source === 'paperswithcode',
            confs: [{
                year: record.year,
                link: record.link || record.url || '#',
                timezone: 'UTC',
                date: record.date || [record.start || record.start_date, record.end || record.end_date].filter(Boolean).join(' — ') || 'TBA',
                place: record.location || [record.city, record.country].filter(Boolean).join(', ') || 'TBA',
                venue: record.venue || '',
                tags: record.tags || [],
                timeline: events
            }]
        };
    }

    function merge(base, records, source = 'aideadlines') {
        const output = base.map(entry => ({
            ...entry,
            confs: [{ ...entry.confs[0], timeline: [...(entry.confs[0].timeline || [])] }]
        }));
        const byKey = new Map(output.map((entry, index) => [key(entry.title, entry.confs[0].year), index]));
        for (const record of records) {
            const acronym = record.title || record.short_name;
            if (!acronym || !record.year) continue;
            const supplement = fromSource(record, source);
            const match = byKey.get(key(acronym, record.year));
            if (match === undefined) {
                byKey.set(key(acronym, record.year), output.length);
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
            if (source === 'paperswithcode') entry.pwcEnriched = true;
            else entry.enriched = true;
        }
        return output;
    }

    function fromCycle(record) {
        const labels = {
            abstract: '摘要截稿', paper: '论文投稿', review_release: '审稿意见公布',
            rebuttal_start: '答辩开始', rebuttal_end: '答辩结束',
            notification: '结果通知', camera_ready: '终稿'
        };
        const events = (record.events || []).map(event => {
            const ms = event.at ? Date.parse(event.at) : null;
            const cycle = String(event.cycle || '').trim();
            const label = labels[event.type] || event.type || '时间节点';
            return {
                type: event.type, comment: cycle ? `${cycle} · ${label}` : label,
                cycle, timezone: 'UTC', deadlineMs: Number.isFinite(ms) ? ms : null,
                dateOnly: !Number.isFinite(ms), date: event.date || '',
                localDate: event.at ? event.at.slice(0, 10) : event.date || '',
                source: 'ccfcycle'
            };
        }).filter(event => event.deadlineMs !== null || event.date);
        return {
            title: `${record.acronym} ${record.year}`,
            description: record.acronym, sub: 'EXT', rank: { ccf: 'N' },
            supplementOnly: true, cycleOnly: true,
            confs: [{
                year: record.year, link: record.websiteUrl || '#', timezone: 'UTC',
                date: [record.conferenceStart, record.conferenceEnd].filter(Boolean).join(' — ') || 'TBA',
                place: 'TBA', tags: [], timeline: events,
                cfpUrl: record.cfpUrl || '', dblpUrl: record.dblpUrl || '',
                yearChanges: Array.isArray(record.changes) ? record.changes : []
            }]
        };
    }

    function mergeCycle(base, records) {
        const output = base.map(entry => ({
            ...entry,
            confs: [{ ...entry.confs[0], timeline: [...(entry.confs[0].timeline || [])] }]
        }));
        const byKey = new Map(output.map((entry, index) => [key(entry.title, entry.confs[0].year), index]));
        for (const record of records) {
            if (!record.acronym || !record.year || !Array.isArray(record.events)) continue;
            const supplement = fromCycle(record);
            const identity = key(record.acronym, record.year);
            const match = byKey.get(identity);
            if (match === undefined) {
                byKey.set(identity, output.length);
                output.push(supplement);
                continue;
            }
            const entry = output[match];
            const conf = entry.confs[0];
            const extra = supplement.confs[0];
            if (!conf.link || conf.link === '#') conf.link = extra.link;
            if (!conf.date || conf.date === 'TBA') conf.date = extra.date;
            conf.cfpUrl = conf.cfpUrl || extra.cfpUrl;
            conf.dblpUrl = conf.dblpUrl || extra.dblpUrl;
            conf.yearChanges = extra.yearChanges;
            conf.timeline = mergeTimeline(conf.timeline || [], extra.timeline);
            entry.cycleEnriched = true;
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

    return { key, merge, mergeJiajun, mergeCycle, status, typeOf, roundOf, deadlineMs };
})();
