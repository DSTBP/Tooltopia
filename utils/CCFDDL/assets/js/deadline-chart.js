/* Pure data helpers for the optional CCFDDL conference timeline. */
window.CCFDeadlineChart = (() => {
    function seriesId(title) {
        return window.CCFDeadlineSupplement.key(title, 0).split('|')[0];
    }

    function latestSeries(conferences) {
        const latest = new Map();
        for (const conf of conferences) {
            const id = seriesId(conf.title);
            const year = Number(conf.confs?.[0]?.year) || 0;
            if (!id) continue;
            const previous = latest.get(id);
            if (!previous || year > Number(previous.confs?.[0]?.year || 0)) latest.set(id, conf);
        }
        return latest;
    }

    function selectedRows(filteredRows, conferences, mode, selectedIds) {
        if (mode === 'auto') return filteredRows.slice(0, 3).map(row => ({ conf: row.conf }));
        const latest = latestSeries(conferences);
        return selectedIds.map(id => ({ conf: latest.get(id) || null, id }));
    }

    function dayMs(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
        const ms = Date.parse(`${value}T12:00:00Z`);
        return Number.isFinite(ms) ? ms : null;
    }

    function eventMs(event) {
        return event.dateOnly ? dayMs(event.date)
            : Number.isFinite(event.deadlineMs) ? event.deadlineMs : null;
    }

    function localDay(now) {
        const current = new Date(now);
        return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    }

    function nextEvent(conf, now = Date.now(), todayForEvent = () => localDay(now)) {
        return (conf.confs?.[0]?.timeline || [])
            .map(event => ({ event, ms: eventMs(event) }))
            .filter(({ event, ms }) => ms !== null &&
                (event.dateOnly ? event.date >= todayForEvent(event) : ms > now))
            .sort((a, b) => a.ms - b.ms)[0] || null;
    }

    function daysUntil(value, now = Date.now(), today = localDay(now)) {
        const target = dayMs(value);
        return target === null ? null : Math.round((target - dayMs(today)) / 86400000);
    }

    function eventPeriods(timeline) {
        const entries = timeline.map((event, index) => ({ event, index, ms: eventMs(event) }))
            .filter(entry => entry.ms !== null);
        const used = new Set();
        const periods = [];
        const supplement = window.CCFDeadlineSupplement;
        const cycleOf = event => String(event.cycle || supplement.roundOf(event.comment) || '').trim().toLowerCase();

        for (const entry of entries) {
            if (used.has(entry.index)) continue;
            const endDate = dayMs(entry.event.endDate);
            if (endDate !== null && endDate > entry.ms) {
                periods.push({ start: entry.ms, end: endDate, startEvent: entry.event, endEvent: null });
                used.add(entry.index);
                continue;
            }
            if (supplement.typeOf(entry.event) !== 'rebuttal_start') continue;
            const cycle = cycleOf(entry.event);
            const end = entries.filter(candidate =>
                !used.has(candidate.index) &&
                supplement.typeOf(candidate.event) === 'rebuttal_end' &&
                cycleOf(candidate.event) === cycle && candidate.ms > entry.ms
            ).sort((a, b) => a.ms - b.ms)[0];
            if (!end) continue;
            periods.push({ start: entry.ms, end: end.ms, startEvent: entry.event, endEvent: end.event });
            used.add(entry.index);
            used.add(end.index);
        }
        return { periods, used };
    }

    function conferenceDates(conf) {
        const text = String(conf.confs?.[0]?.date || '').trim();
        const days = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
        if (days.length) return days.map(dayMs).filter(Number.isFinite).slice(0, 2);

        const english = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s*[-–—]\s*(?:([A-Za-z]+)\s+)?(\d{1,2}))?,?\s+(\d{4})$/);
        if (!english) return [];
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const startMonth = months.indexOf(english[1].toLowerCase());
        const endMonth = english[3] ? months.indexOf(english[3].toLowerCase()) : startMonth;
        if (startMonth < 0 || endMonth < 0) return [];
        const year = Number(english[5]);
        const date = (y, month, day) => {
            const ms = Date.UTC(y, month, Number(day), 12);
            const parsed = new Date(ms);
            return parsed.getUTCMonth() === month && parsed.getUTCDate() === Number(day) ? ms : null;
        };
        const start = date(year - (endMonth < startMonth ? 1 : 0), startMonth, english[2]);
        const end = english[4] ? date(year, endMonth, english[4]) : null;
        return [start, end].filter(Number.isFinite);
    }

    function monthStart(ms) {
        const date = new Date(ms);
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    }

    function shiftMonths(ms, count) {
        const date = new Date(ms);
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1);
    }

    function axisRange(rows, range, now = Date.now()) {
        if (range !== 'ALL') {
            const start = shiftMonths(monthStart(now), -1);
            return { start, end: shiftMonths(start, { '3M': 3, '6M': 6, '1Y': 12 }[range] || 12) };
        }
        const points = [];
        for (const { conf } of rows) {
            if (!conf) continue;
            for (const event of conf.confs?.[0]?.timeline || []) {
                const ms = eventMs(event);
                if (ms !== null) points.push(ms);
                const end = dayMs(event.endDate);
                if (end !== null) points.push(end);
            }
            points.push(...conferenceDates(conf));
        }
        if (!points.length) return axisRange(rows, '1Y', now);
        return {
            start: shiftMonths(monthStart(Math.min(...points)), -1),
            end: shiftMonths(monthStart(Math.max(...points)), 2)
        };
    }

    function panAxis(axis, pixels, width) {
        const offset = pixels / width * (axis.end - axis.start);
        return { start: axis.start - offset, end: axis.end - offset };
    }

    function centeredAxis(axis, range) {
        const months = { '3M': 3, '6M': 6, '1Y': 12 }[range];
        const center = (axis.start + axis.end) / 2;
        const month = monthStart(center);
        const span = shiftMonths(month, months) - month;
        return { start: center - span / 2, end: center + span / 2 };
    }

    function position(ms, axis) {
        return (ms - axis.start) / (axis.end - axis.start) * 100;
    }

    function monthTicks(axis) {
        const ticks = [];
        for (let ms = monthStart(axis.start); ms < axis.end; ms = shiftMonths(ms, 1)) {
            if (ms >= axis.start) ticks.push({ ms, percent: position(ms, axis) });
        }
        return ticks;
    }

    function yearBands(axis) {
        const bands = [];
        for (let ms = axis.start; ms < axis.end;) {
            const year = new Date(ms).getUTCFullYear();
            const next = Math.min(axis.end, Date.UTC(year + 1, 0, 1));
            bands.push({ year, percent: position(ms, axis), width: position(next, axis) - position(ms, axis) });
            ms = next;
        }
        return bands;
    }

    return { seriesId, latestSeries, selectedRows, nextEvent, daysUntil, dayMs, eventMs, eventPeriods, conferenceDates, axisRange, panAxis, centeredAxis, position, monthTicks, yearBands };
})();
