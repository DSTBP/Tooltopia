(() => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const YIN_EPOCH_YEAR = 2000;
    const YIN_EPOCH_DAY_INDEX = Math.floor(Date.UTC(2000, 0, 6) / DAY_MS);
    const YIN_SYNODIC_MONTH_DAYS = 29.530588853;
    const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const LUNAR_MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
    const LUNAR_DAY_NAMES = [
        '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
        '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
        '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
    ];
    const TIME_ZONE_OPTIONS = [
        { value: 'UTC', label: 'UTC' },
        { value: 'Asia/Shanghai', label: '中国标准时间 (Asia/Shanghai)' },
        { value: 'Asia/Tokyo', label: '日本标准时间 (Asia/Tokyo)' },
        { value: 'Asia/Singapore', label: '新加坡时间 (Asia/Singapore)' },
        { value: 'Asia/Dubai', label: '迪拜时间 (Asia/Dubai)' },
        { value: 'Europe/London', label: '伦敦时间 (Europe/London)' },
        { value: 'Europe/Paris', label: '巴黎时间 (Europe/Paris)' },
        { value: 'America/New_York', label: '纽约时间 (America/New_York)' },
        { value: 'America/Chicago', label: '芝加哥时间 (America/Chicago)' },
        { value: 'America/Denver', label: '丹佛时间 (America/Denver)' },
        { value: 'America/Los_Angeles', label: '洛杉矶时间 (America/Los_Angeles)' },
        { value: 'Australia/Sydney', label: '悉尼时间 (Australia/Sydney)' },
        { value: 'Pacific/Auckland', label: '奥克兰时间 (Pacific/Auckland)' }
    ];

    const timeZonePartFormatterCache = new Map();
    const timeZoneDisplayFormatterCache = new Map();

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function modulo(value, divisor) {
        return ((value % divisor) + divisor) % divisor;
    }

    function createUtcDate(year, month, day) {
        return new Date(Date.UTC(year, month - 1, day));
    }

    function parseDateOnlyInput(input) {
        const normalized = (input || '').trim();
        const match = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (!match) {
            throw new Error('请输入有效日期 (YYYY-MM-DD)');
        }

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = createUtcDate(year, month, day);
        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            throw new Error('无效日期');
        }

        return date;
    }

    function formatDateOnly(date) {
        return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    }

    function getWeekdayName(date) {
        return WEEKDAY_NAMES[date.getUTCDay()];
    }

    function getSexagenaryName(stemIndex, branchIndex) {
        return `${HEAVENLY_STEMS[modulo(stemIndex, 10)]}${EARTHLY_BRANCHES[modulo(branchIndex, 12)]}`;
    }

    function formatSolarDisplay(date) {
        return `${formatDateOnly(date)}（${getWeekdayName(date)}）`;
    }

    function formatLocalDateInputValue(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    function formatLocalDateTimeInputValue(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }

    const lunarFormatter = (() => {
        try {
            const formatter = new Intl.DateTimeFormat('en-u-ca-chinese', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                timeZone: 'UTC'
            });
            return formatter.resolvedOptions().calendar === 'chinese' ? formatter : null;
        } catch (error) {
            return null;
        }
    })();

    function assertChineseLunarRange(date) {
        if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2100) {
            throw new Error('农历转换仅支持 1900-2100 年对应日期');
        }
    }

    function getLunarParts(date) {
        if (!lunarFormatter || typeof lunarFormatter.formatToParts !== 'function') {
            throw new Error('当前环境不支持农历转换');
        }

        assertChineseLunarRange(date);
        const parts = lunarFormatter.formatToParts(date);
        const yearText = parts.find((part) => part.type === 'relatedYear')?.value;
        const monthText = parts.find((part) => part.type === 'month')?.value;
        const dayText = parts.find((part) => part.type === 'day')?.value;
        if (!yearText || !monthText || !dayText) {
            throw new Error('无法解析农历日期');
        }

        const monthMatch = monthText.match(/\d+/);
        if (!monthMatch) {
            throw new Error('无法解析农历月份');
        }

        const year = Number(yearText);
        const month = Number(monthMatch[0]);
        const day = Number(dayText);
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
            throw new Error('无法解析农历日期');
        }

        return {
            year,
            month,
            day,
            isLeap: /bis|leap|闰/i.test(monthText)
        };
    }

    function findSolarDateFromLunar(year, month, day, isLeap) {
        if (!lunarFormatter) {
            throw new Error('当前环境不支持农历转换');
        }
        if (year < 1900 || year > 2100) {
            throw new Error('农历年份仅支持 1900-2100');
        }
        if (month < 1 || month > 12) {
            throw new Error('农历月份需在 1-12 之间');
        }
        if (day < 1 || day > 30) {
            throw new Error('农历日期需在 1-30 之间');
        }

        const startTimestamp = Math.max(
            createUtcDate(year - 1, 12, 1).getTime(),
            createUtcDate(1900, 1, 1).getTime()
        );
        const endTimestamp = Math.min(
            createUtcDate(year + 1, 3, 1).getTime(),
            createUtcDate(2100, 12, 31).getTime()
        );
        for (let ts = startTimestamp; ts <= endTimestamp; ts += DAY_MS) {
            const current = new Date(ts);
            const parts = getLunarParts(current);
            if (
                parts.year === year &&
                parts.month === month &&
                parts.day === day &&
                parts.isLeap === isLeap
            ) {
                return current;
            }
        }

        throw new Error('未找到对应公历日期，可能该年不存在闰月或日期无效');
    }

    function formatLunarDisplay(parts) {
        const monthLabel = LUNAR_MONTH_NAMES[parts.month - 1] || `${parts.month}月`;
        const dayLabel = LUNAR_DAY_NAMES[parts.day - 1] || `${parts.day}日`;
        return `${parts.year}年${parts.isLeap ? '闰' : ''}${monthLabel}${dayLabel}`;
    }

    function getYearGanzhiByLunarYear(lunarYear) {
        return getSexagenaryName(lunarYear - 4, lunarYear - 4);
    }

    function getMonthGanzhiByLunarParts(lunarParts) {
        const yearStemIndex = modulo(lunarParts.year - 4, 10);
        const firstMonthStemIndex = modulo((yearStemIndex % 5) * 2 + 2, 10);
        const monthStemIndex = modulo(firstMonthStemIndex + lunarParts.month - 1, 10);
        const monthBranchIndex = modulo(lunarParts.month + 1, 12);
        return getSexagenaryName(monthStemIndex, monthBranchIndex);
    }

    function getDayGanzhi(date) {
        let year = date.getUTCFullYear();
        let month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();

        if (month === 1 || month === 2) {
            month += 12;
            year -= 1;
        }

        const century = Math.floor(year / 100);
        const yearOfCentury = year % 100;
        const monthAdjustment = month % 2 === 0 ? 6 : 0;
        const stemIndex = modulo(
            4 * century +
            Math.floor(century / 4) +
            5 * yearOfCentury +
            Math.floor(yearOfCentury / 4) +
            Math.floor((3 * (month + 1)) / 5) +
            day - 4,
            10
        );
        const branchIndex = modulo(
            8 * century +
            Math.floor(century / 4) +
            5 * yearOfCentury +
            Math.floor(yearOfCentury / 4) +
            Math.floor((3 * (month + 1)) / 5) +
            day + 6 + monthAdjustment,
            12
        );

        return getSexagenaryName(stemIndex, branchIndex);
    }

    function getGanzhiInfo(date) {
        const lunarParts = getLunarParts(date);
        return {
            solar: formatSolarDisplay(date),
            lunar: formatLunarDisplay(lunarParts),
            yearGanzhi: getYearGanzhiByLunarYear(lunarParts.year),
            monthGanzhi: getMonthGanzhiByLunarParts(lunarParts),
            dayGanzhi: getDayGanzhi(date)
        };
    }

    function getYinMonthStartDayIndex(monthIndex) {
        return YIN_EPOCH_DAY_INDEX + Math.round(monthIndex * YIN_SYNODIC_MONTH_DAYS);
    }

    function getYinMonthLength(monthIndex) {
        return getYinMonthStartDayIndex(monthIndex + 1) - getYinMonthStartDayIndex(monthIndex);
    }

    function getYinPhaseName(day, monthLength) {
        const ratio = monthLength > 1 ? (day - 1) / (monthLength - 1) : 0;
        if (ratio < 0.08) return '新月';
        if (ratio < 0.22) return '娥眉月';
        if (ratio < 0.33) return '上弦月附近';
        if (ratio < 0.47) return '盈凸月';
        if (ratio < 0.58) return '满月附近';
        if (ratio < 0.72) return '亏凸月';
        if (ratio < 0.84) return '下弦月附近';
        return '残月';
    }

    function getYinParts(date) {
        const dayIndex = Math.floor(date.getTime() / DAY_MS);
        let monthIndex = Math.floor((dayIndex - YIN_EPOCH_DAY_INDEX) / YIN_SYNODIC_MONTH_DAYS);
        while (getYinMonthStartDayIndex(monthIndex + 1) <= dayIndex) {
            monthIndex += 1;
        }
        while (getYinMonthStartDayIndex(monthIndex) > dayIndex) {
            monthIndex -= 1;
        }

        const monthStartDayIndex = getYinMonthStartDayIndex(monthIndex);
        const monthLength = getYinMonthLength(monthIndex);
        const day = dayIndex - monthStartDayIndex + 1;
        return {
            year: YIN_EPOCH_YEAR + Math.floor(monthIndex / 12),
            month: modulo(monthIndex, 12) + 1,
            day,
            monthLength,
            phase: getYinPhaseName(day, monthLength)
        };
    }

    function convertYinToSolar(year, month, day) {
        if (!Number.isInteger(year) || year < 1 || year > 9999) {
            throw new Error('阴历年份需在 1-9999 之间');
        }
        if (!Number.isInteger(month) || month < 1 || month > 12) {
            throw new Error('阴历月份需在 1-12 之间');
        }
        if (!Number.isInteger(day) || day < 1 || day > 30) {
            throw new Error('阴历日期需在 1-30 之间');
        }

        const monthIndex = (year - YIN_EPOCH_YEAR) * 12 + (month - 1);
        const monthLength = getYinMonthLength(monthIndex);
        if (day > monthLength) {
            throw new Error(`该阴历月份只有 ${monthLength} 天`);
        }

        const dayIndex = getYinMonthStartDayIndex(monthIndex) + (day - 1);
        return new Date(dayIndex * DAY_MS);
    }

    function formatYinDisplay(parts) {
        return `${parts.year}年${parts.month}月${parts.day}日（月相：${parts.phase}，本月 ${parts.monthLength} 天，近似）`;
    }

    function createOptionFragment(items) {
        const fragment = document.createDocumentFragment();
        items.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            fragment.appendChild(option);
        });
        return fragment;
    }

    function parseDateTimeLocalInput(input) {
        const normalized = (input || '').trim();
        const match = normalized.match(
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
        );
        if (!match) {
            throw new Error('请输入有效日期时间');
        }

        const parts = {
            year: Number(match[1]),
            month: Number(match[2]),
            day: Number(match[3]),
            hour: Number(match[4]),
            minute: Number(match[5]),
            second: Number(match[6] || '0')
        };
        const testDate = new Date(Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second
        ));
        if (
            testDate.getUTCFullYear() !== parts.year ||
            testDate.getUTCMonth() !== parts.month - 1 ||
            testDate.getUTCDate() !== parts.day ||
            testDate.getUTCHours() !== parts.hour ||
            testDate.getUTCMinutes() !== parts.minute ||
            testDate.getUTCSeconds() !== parts.second
        ) {
            throw new Error('请输入有效日期时间');
        }

        return parts;
    }

    function getTimeZonePartFormatter(timeZone) {
        const cacheKey = `parts:${timeZone}`;
        if (!timeZonePartFormatterCache.has(cacheKey)) {
            timeZonePartFormatterCache.set(cacheKey, new Intl.DateTimeFormat('en-CA', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hourCycle: 'h23'
            }));
        }
        return timeZonePartFormatterCache.get(cacheKey);
    }

    function getTimeZoneDisplayFormatter(timeZone) {
        const cacheKey = `display:${timeZone}`;
        if (!timeZoneDisplayFormatterCache.has(cacheKey)) {
            timeZoneDisplayFormatterCache.set(cacheKey, new Intl.DateTimeFormat('zh-CN', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                weekday: 'long',
                timeZoneName: 'short',
                hourCycle: 'h23'
            }));
        }
        return timeZoneDisplayFormatterCache.get(cacheKey);
    }

    function getTimeZoneParts(timestamp, timeZone) {
        const parts = getTimeZonePartFormatter(timeZone).formatToParts(new Date(timestamp));
        const values = {};
        parts.forEach((part) => {
            if (part.type !== 'literal') {
                values[part.type] = part.value;
            }
        });

        return {
            year: Number(values.year),
            month: Number(values.month),
            day: Number(values.day),
            hour: Number(values.hour),
            minute: Number(values.minute),
            second: Number(values.second)
        };
    }

    function sameDateTimeParts(left, right) {
        return (
            left.year === right.year &&
            left.month === right.month &&
            left.day === right.day &&
            left.hour === right.hour &&
            left.minute === right.minute &&
            left.second === right.second
        );
    }

    function getTimeZoneOffsetMs(timeZone, timestamp) {
        const parts = getTimeZoneParts(timestamp, timeZone);
        const asUtc = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second
        );
        return asUtc - timestamp;
    }

    function zonedDateTimeToUtcDate(parts, timeZone) {
        const naiveUtc = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second
        );

        let timestamp = naiveUtc;
        for (let index = 0; index < 5; index += 1) {
            const offset = getTimeZoneOffsetMs(timeZone, timestamp);
            const nextTimestamp = naiveUtc - offset;
            if (Math.abs(nextTimestamp - timestamp) < 1) {
                timestamp = nextTimestamp;
                break;
            }
            timestamp = nextTimestamp;
        }

        const resolvedParts = getTimeZoneParts(timestamp, timeZone);
        if (!sameDateTimeParts(resolvedParts, parts)) {
            throw new Error('该时间在源时区无效，或遇到夏令时歧义');
        }

        return new Date(timestamp);
    }

    function formatTimeZoneDisplay(date, timeZone) {
        const parts = getTimeZoneDisplayFormatter(timeZone).formatToParts(date);
        const values = {};
        parts.forEach((part) => {
            if (part.type !== 'literal') {
                values[part.type] = part.value;
            }
        });

        return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}（${values.weekday}，${values.timeZoneName || timeZone}）`;
    }

    function buildTimeZoneOptions() {
        const options = TIME_ZONE_OPTIONS.slice();
        try {
            const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (browserZone && !options.some((item) => item.value === browserZone)) {
                options.splice(1, 0, {
                    value: browserZone,
                    label: `当前浏览器时区 (${browserZone})`
                });
            }
        } catch (error) {}
        return options;
    }

    function getCalendarLabel(calendarType) {
        switch (calendarType) {
            case 'solar':
                return '公历（阳历）';
            case 'lunar':
                return '农历';
            case 'yin':
                return '阴历（近似）';
            default:
                return calendarType;
        }
    }

    function convertSourceCalendarToSolar(calendarType, elements) {
        if (calendarType === 'solar') {
            return parseDateOnlyInput(elements.calendarSolarDateEl.value);
        }
        if (calendarType === 'lunar') {
            const year = Number(elements.calendarLunarYearEl.value);
            const month = Number(elements.calendarLunarMonthEl.value);
            const day = Number(elements.calendarLunarDayEl.value);
            if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
                throw new Error('请输入完整的农历年月日');
            }
            return findSolarDateFromLunar(year, month, day, Boolean(elements.calendarLunarLeapEl.checked));
        }
        if (calendarType === 'yin') {
            const year = Number(elements.calendarYinYearEl.value);
            const month = Number(elements.calendarYinMonthEl.value);
            const day = Number(elements.calendarYinDayEl.value);
            if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
                throw new Error('请输入完整的阴历年月日');
            }
            return convertYinToSolar(year, month, day);
        }
        throw new Error('不支持的源历法');
    }

    function formatCalendarFromSolar(calendarType, solarDate) {
        if (calendarType === 'solar') {
            return `${getCalendarLabel(calendarType)}：${formatSolarDisplay(solarDate)}`;
        }
        if (calendarType === 'lunar') {
            const lunarParts = getLunarParts(solarDate);
            return `${getCalendarLabel(calendarType)}：${formatLunarDisplay(lunarParts)}`;
        }
        if (calendarType === 'yin') {
            const yinParts = getYinParts(solarDate);
            return `${getCalendarLabel(calendarType)}：${formatYinDisplay(yinParts)}`;
        }
        throw new Error('不支持的目标历法');
    }

    function updateCalendarFieldVisibility(elements) {
        const sourceType = elements.calendarSourceEl.value;
        elements.calendarSolarFieldsEl.style.display = sourceType === 'solar' ? 'block' : 'none';
        elements.calendarLunarFieldsEl.style.display = sourceType === 'lunar' ? 'block' : 'none';
        elements.calendarYinFieldsEl.style.display = sourceType === 'yin' ? 'block' : 'none';
    }

    function init() {
        const elements = {
            dateDiffStartEl: document.getElementById('dateDiffStart'),
            dateDiffEndEl: document.getElementById('dateDiffEnd'),
            dateDiffBtn: document.getElementById('dateDiffBtn'),
            dateDiffResultEl: document.getElementById('dateDiffResult'),
            dateShiftBaseEl: document.getElementById('dateShiftBase'),
            dateShiftDaysEl: document.getElementById('dateShiftDays'),
            dateShiftBtn: document.getElementById('dateShiftBtn'),
            dateShiftResultEl: document.getElementById('dateShiftResult'),
            weekdayDateEl: document.getElementById('weekdayDate'),
            weekdayBtn: document.getElementById('weekdayBtn'),
            weekdayResultEl: document.getElementById('weekdayResult'),
            ganzhiDateEl: document.getElementById('ganzhiDate'),
            ganzhiBtn: document.getElementById('ganzhiBtn'),
            ganzhiResultEl: document.getElementById('ganzhiResult'),
            calendarSourceEl: document.getElementById('calendarSource'),
            calendarTargetEl: document.getElementById('calendarTarget'),
            calendarSolarFieldsEl: document.getElementById('calendarSolarFields'),
            calendarLunarFieldsEl: document.getElementById('calendarLunarFields'),
            calendarYinFieldsEl: document.getElementById('calendarYinFields'),
            calendarSolarDateEl: document.getElementById('calendarSolarDate'),
            calendarLunarYearEl: document.getElementById('calendarLunarYear'),
            calendarLunarMonthEl: document.getElementById('calendarLunarMonth'),
            calendarLunarDayEl: document.getElementById('calendarLunarDay'),
            calendarLunarLeapEl: document.getElementById('calendarLunarLeap'),
            calendarYinYearEl: document.getElementById('calendarYinYear'),
            calendarYinMonthEl: document.getElementById('calendarYinMonth'),
            calendarYinDayEl: document.getElementById('calendarYinDay'),
            calendarConvertBtn: document.getElementById('calendarConvertBtn'),
            calendarConvertResultEl: document.getElementById('calendarConvertResult'),
            timezoneDateTimeEl: document.getElementById('timezoneDateTime'),
            timezoneFromEl: document.getElementById('timezoneFrom'),
            timezoneToEl: document.getElementById('timezoneTo'),
            timezoneConvertBtn: document.getElementById('timezoneConvertBtn'),
            timezoneResultEl: document.getElementById('timezoneResult')
        };

        if (!elements.dateDiffBtn && !elements.calendarConvertBtn) {
            return;
        }

        const today = new Date();
        const tomorrow = new Date(today.getTime() + DAY_MS);
        if (elements.dateDiffStartEl) elements.dateDiffStartEl.value = formatLocalDateInputValue(today);
        if (elements.dateDiffEndEl) elements.dateDiffEndEl.value = formatLocalDateInputValue(tomorrow);
        if (elements.dateShiftBaseEl) elements.dateShiftBaseEl.value = formatLocalDateInputValue(today);
        if (elements.weekdayDateEl) elements.weekdayDateEl.value = formatLocalDateInputValue(today);
        if (elements.ganzhiDateEl) elements.ganzhiDateEl.value = formatLocalDateInputValue(today);
        if (elements.calendarSolarDateEl) elements.calendarSolarDateEl.value = formatLocalDateInputValue(today);
        if (elements.timezoneDateTimeEl) elements.timezoneDateTimeEl.value = formatLocalDateTimeInputValue(today);
        if (elements.dateShiftDaysEl && !elements.dateShiftDaysEl.value) elements.dateShiftDaysEl.value = '1';

        if (elements.calendarLunarYearEl) elements.calendarLunarYearEl.value = '2024';
        if (elements.calendarLunarMonthEl) elements.calendarLunarMonthEl.value = '1';
        if (elements.calendarLunarDayEl) elements.calendarLunarDayEl.value = '1';
        if (elements.calendarYinYearEl) elements.calendarYinYearEl.value = '2024';
        if (elements.calendarYinMonthEl) elements.calendarYinMonthEl.value = '1';
        if (elements.calendarYinDayEl) elements.calendarYinDayEl.value = '1';

        if (elements.dateDiffBtn) {
            elements.dateDiffBtn.addEventListener('click', () => {
                try {
                    const startDate = parseDateOnlyInput(elements.dateDiffStartEl?.value || '');
                    const endDate = parseDateOnlyInput(elements.dateDiffEndEl?.value || '');
                    const diff = Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
                    const absDiff = Math.abs(diff);
                    const relation = diff === 0
                        ? '同一天'
                        : diff > 0
                            ? `结束日期比开始日期晚 ${absDiff} 天`
                            : `结束日期比开始日期早 ${absDiff} 天`;
                    elements.dateDiffResultEl.innerText = `开始：${formatSolarDisplay(startDate)}；结束：${formatSolarDisplay(endDate)}；相差 ${absDiff} 天（${relation}）`;
                } catch (error) {
                    elements.dateDiffResultEl.innerText = '计算失败: ' + error.message;
                }
            });
        }

        if (elements.dateShiftBtn) {
            elements.dateShiftBtn.addEventListener('click', () => {
                try {
                    const baseDate = parseDateOnlyInput(elements.dateShiftBaseEl?.value || '');
                    const offset = Number((elements.dateShiftDaysEl?.value || '').trim());
                    if (!Number.isFinite(offset) || !Number.isInteger(offset)) {
                        throw new Error('天数需为整数');
                    }

                    const resultDate = new Date(baseDate.getTime() + offset * DAY_MS);
                    const sign = offset >= 0 ? '+' : '';
                    elements.dateShiftResultEl.innerText = `${formatSolarDisplay(baseDate)} ${sign}${offset} 天 = ${formatSolarDisplay(resultDate)}`;
                } catch (error) {
                    elements.dateShiftResultEl.innerText = '计算失败: ' + error.message;
                }
            });
        }

        if (elements.weekdayBtn) {
            elements.weekdayBtn.addEventListener('click', () => {
                try {
                    const date = parseDateOnlyInput(elements.weekdayDateEl?.value || '');
                    elements.weekdayResultEl.innerText = `${formatSolarDisplay(date)}`;
                } catch (error) {
                    elements.weekdayResultEl.innerText = '查询失败: ' + error.message;
                }
            });
        }

        if (elements.ganzhiBtn) {
            elements.ganzhiBtn.addEventListener('click', () => {
                try {
                    const date = parseDateOnlyInput(elements.ganzhiDateEl?.value || '');
                    const ganzhiInfo = getGanzhiInfo(date);
                    elements.ganzhiResultEl.innerText = `${ganzhiInfo.solar}；农历：${ganzhiInfo.lunar}；年柱：${ganzhiInfo.yearGanzhi}；月柱：${ganzhiInfo.monthGanzhi}；日柱：${ganzhiInfo.dayGanzhi}`;
                } catch (error) {
                    elements.ganzhiResultEl.innerText = '转换失败: ' + error.message;
                }
            });
        }

        if (elements.calendarSourceEl && elements.calendarTargetEl) {
            updateCalendarFieldVisibility(elements);
            elements.calendarSourceEl.addEventListener('change', () => {
                updateCalendarFieldVisibility(elements);
            });
        }

        if (elements.calendarConvertBtn) {
            elements.calendarConvertBtn.addEventListener('click', () => {
                try {
                    const sourceType = elements.calendarSourceEl.value;
                    const targetType = elements.calendarTargetEl.value;
                    const solarDate = convertSourceCalendarToSolar(sourceType, elements);
                    const sourceText = formatCalendarFromSolar(sourceType, solarDate);
                    const targetText = formatCalendarFromSolar(targetType, solarDate);
                    const relation = sourceType === targetType ? '（源历法与目标历法相同，以下为标准化显示）' : '';
                    elements.calendarConvertResultEl.innerText = `${sourceText} → ${targetText}${relation ? ` ${relation}` : ''}`;
                } catch (error) {
                    elements.calendarConvertResultEl.innerText = '转换失败: ' + error.message;
                }
            });
        }

        if (elements.timezoneFromEl && elements.timezoneToEl) {
            const zoneOptions = buildTimeZoneOptions();
            elements.timezoneFromEl.replaceChildren(createOptionFragment(zoneOptions));
            elements.timezoneToEl.replaceChildren(createOptionFragment(zoneOptions));

            let browserZone = 'Asia/Shanghai';
            try {
                browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || browserZone;
            } catch (error) {}
            elements.timezoneFromEl.value = zoneOptions.some((item) => item.value === browserZone) ? browserZone : 'Asia/Shanghai';
            elements.timezoneToEl.value = 'UTC';
        }

        if (elements.timezoneConvertBtn) {
            elements.timezoneConvertBtn.addEventListener('click', () => {
                try {
                    const dateTimeParts = parseDateTimeLocalInput(elements.timezoneDateTimeEl?.value || '');
                    const fromZone = elements.timezoneFromEl.value;
                    const toZone = elements.timezoneToEl.value;
                    const utcDate = zonedDateTimeToUtcDate(dateTimeParts, fromZone);
                    const sourceText = formatTimeZoneDisplay(utcDate, fromZone);
                    const targetText = formatTimeZoneDisplay(utcDate, toZone);
                    elements.timezoneResultEl.innerText = `${fromZone}：${sourceText} → ${toZone}：${targetText}`;
                } catch (error) {
                    elements.timezoneResultEl.innerText = '转换失败: ' + error.message;
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
