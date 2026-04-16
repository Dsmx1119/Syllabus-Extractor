import { createServer } from 'node:http';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || '8787');
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:1.5b';
const MAX_TEXT_LENGTH = 90000;
const MAX_CONTEXT_LINES = 140;
const DAYS_IN_WEEK = 7;
const MONTH_DATE_REGEX =
  /\b(?:jan(?:uary)?\.?|feb(?:ruary)?\.?|mar(?:ch)?\.?|apr(?:il)?\.?|may\.?|jun(?:e)?\.?|jul(?:y)?\.?|aug(?:ust)?\.?|sep(?:t|tember)?\.?|oct(?:ober)?\.?|nov(?:ember)?\.?|dec(?:ember)?\.?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?/i;
const NUMERIC_DATE_REGEX = /(?<![:.\dA-Za-z])\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?![:.\dA-Za-z])/i;
const ASSESSMENT_KEYWORD_REGEX =
  /\b(exam|midterm|final|quiz|assignment|project|lab|paper|presentation|deadline|due|test|homework|report|deliverable)\b/i;
const DATE_REGEX = new RegExp(`${MONTH_DATE_REGEX.source}|${NUMERIC_DATE_REGEX.source}`, 'i');
const WEEK_ROW_REGEX = /^\s*week\s+(\d{1,2})\b/i;
const NUMERIC_WEEK_ROW_REGEX = /^\s*(\d{1,2})\s*\(([^)]+)\)/i;
const WEEK_RANGE_REGEX = /\bweeks?\s+(\d{1,2})\s*-\s*(\d{1,2})\b/i;
const WEEK_SINGLE_REGEX = /\bweek\s+(\d{1,2})\b/i;
const READING_WEEK_REGEX = /reading week/i;
const WEEKDAY_REGEX =
  /\b(mon(?:day|days)?|tue(?:s)?(?:day|days)?|wed(?:nesday|nesdays)?|thu(?:rs?)?(?:day|days)?|fri(?:day|days)?|sat(?:urday|urdays)?|sun(?:day|days)?)\b/i;
const IMPORTANT_HEADING_REGEX =
  /^(important dates?|course schedule|schedule|tentative schedule|assessment(?:s)?|deliverables|grading|evaluation|major dates?)$/i;
const NON_ASSESSMENT_LINE_REGEX =
  /^(lectures?:|lab and practical:|office hours?|prerequisites?:|instructor:|ta contact info:|course meetings|course contacts|course overview|course description|course structure|learning objectives|refer to acorn)/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const eventResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['name', 'date', 'time', 'evidence'],
      },
    },
  },
  required: ['events'],
};

const WEEKDAY_INDEX_LOOKUP = {
  mon: 0,
  monday: 0,
  mondays: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  tuesdays: 1,
  wed: 2,
  wednesday: 2,
  wednesdays: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  thursdays: 3,
  fri: 4,
  friday: 4,
  fridays: 4,
  sat: 5,
  saturday: 5,
  saturdays: 5,
  sun: 6,
  sunday: 6,
  sundays: 6,
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  });

  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    ...corsHeaders,
    'Content-Type': 'text/plain; charset=utf-8',
  });

  response.end(payload);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toUtcDate(isoDate) {
  const [year, month, day] = String(isoDate || '')
    .split('-')
    .map((token) => Number(token));

  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function addDaysToIsoDate(isoDate, dayOffset) {
  const date = toUtcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return formatUtcDate(date);
}

function normalizeWeekdayToken(token) {
  const normalized = String(token || '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .trim();

  return WEEKDAY_INDEX_LOOKUP[normalized] !== undefined ? normalized : '';
}

function extractWeekdayToken(text) {
  const weekdayMatch = String(text || '').match(WEEKDAY_REGEX);
  return normalizeWeekdayToken(weekdayMatch?.[0] || '');
}

function getWeekdayOffset(weekdayToken) {
  const normalized = normalizeWeekdayToken(weekdayToken);
  return normalized ? WEEKDAY_INDEX_LOOKUP[normalized] : null;
}

function findLastParentheticalText(line) {
  const matches = [...String(line || '').matchAll(/\(([^)]+)\)/g)];
  return matches.length > 0 ? matches[matches.length - 1][1].trim() : '';
}

function isBlockedNumericDateToken(line, token) {
  const escapedToken = escapeRegExp(token);
  return (
    new RegExp(`\\bweeks?\\s+${escapedToken}\\b`, 'i').test(line) ||
    new RegExp(`\\bweeks?\\s+\\d+\\s*-\\s*\\d+\\b`, 'i').test(line) ||
    new RegExp(`\\bweek\\s+${escapedToken}\\b`, 'i').test(line)
  );
}

function normalizeDate(dateString) {
  if (!dateString) {
    return '';
  }

  const trimmed = String(dateString).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const monthLookup = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const monthMatch = trimmed.match(
    /\b(jan(?:uary)?\.?|feb(?:ruary)?\.?|mar(?:ch)?\.?|apr(?:il)?\.?|may\.?|jun(?:e)?\.?|jul(?:y)?\.?|aug(?:ust)?\.?|sep(?:t|tember)?\.?|oct(?:ober)?\.?|nov(?:ember)?\.?|dec(?:ember)?\.?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i,
  );

  if (monthMatch) {
    const month = monthLookup[monthMatch[1].toLowerCase().replace(/\./g, '')];
    const day = String(Number(monthMatch[2])).padStart(2, '0');
    const year = monthMatch[3] || String(new Date().getFullYear());
    return `${year}-${String(month).padStart(2, '0')}-${day}`;
  }

  const numericMatch = trimmed.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);

  if (numericMatch) {
    const month = String(Number(numericMatch[1])).padStart(2, '0');
    const day = String(Number(numericMatch[2])).padStart(2, '0');
    const yearToken = numericMatch[3];
    let year = new Date().getFullYear();

    if (yearToken) {
      const parsedYear = Number(yearToken);
      year = String(parsedYear).length === 2 ? 2000 + parsedYear : parsedYear;
    }

    return `${year}-${month}-${day}`;
  }

  return '';
}

function normalizeTime(timeString) {
  if (!timeString) {
    return 'TBD';
  }

  const trimmed = String(timeString).trim();

  if (!trimmed || /^tbd$/i.test(trimmed)) {
    return 'TBD';
  }

  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const militaryRangeMatch = trimmed.match(/\b(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\b/);

  if (militaryRangeMatch) {
    return `${String(Number(militaryRangeMatch[1])).padStart(2, '0')}:${militaryRangeMatch[2]}`;
  }

  const rangeMatch = trimmed.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m?\.?|p\.?m?\.?)\b/i,
  );

  if (rangeMatch) {
    let hours = Number(rangeMatch[1]);
    const minutes = Number(rangeMatch[2] || '0');
    const meridiem = rangeMatch[5].toLowerCase();

    if (meridiem.startsWith('p') && hours < 12) {
      hours += 12;
    }

    if (meridiem.startsWith('a') && hours === 12) {
      hours = 0;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const amPmMatch = trimmed.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m?\.?|p\.?m?\.?)\b/i);

  if (amPmMatch) {
    let hours = Number(amPmMatch[1]);
    const minutes = Number(amPmMatch[2] || '0');
    const meridiem = amPmMatch[3].toLowerCase();

    if (meridiem.startsWith('p') && hours < 12) {
      hours += 12;
    }

    if (meridiem.startsWith('a') && hours === 12) {
      hours = 0;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const militaryTimeMatch = trimmed.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  if (militaryTimeMatch) {
    return `${String(Number(militaryTimeMatch[1])).padStart(2, '0')}:${militaryTimeMatch[2]}`;
  }

  return 'TBD';
}

function normalizeEventName(name) {
  const normalized = String(name || '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || 'Course Event';
}

function extractDateToken(line) {
  const trimmed = String(line || '').trim();
  const monthMatch = trimmed.match(MONTH_DATE_REGEX);

  if (monthMatch) {
    return monthMatch[0];
  }

  const numericMatches = [...trimmed.matchAll(new RegExp(NUMERIC_DATE_REGEX.source, 'gi'))];

  for (const numericMatch of numericMatches) {
    if (!isBlockedNumericDateToken(trimmed, numericMatch[0])) {
      return numericMatch[0];
    }
  }

  return '';
}

function inferEventNameFromLine(line) {
  const trimmed = String(line || '').trim();

  const assignmentCodeMatch = trimmed.match(/\bA(\d+)\s+due\b/i);

  if (assignmentCodeMatch) {
    return `Assignment ${assignmentCodeMatch[1]}`;
  }

  const midtermNumberMatch = trimmed.match(/\bmidterm\s*(\d+)\b/i);

  if (midtermNumberMatch) {
    return `Midterm ${midtermNumberMatch[1]}`;
  }

  if (/\bmidterm exam\b/i.test(trimmed)) {
    return 'Midterm Exam';
  }

  if (/\bfinal exam\b/i.test(trimmed)) {
    return 'Final Exam';
  }

  if (/\bquiz(?:zes)?\b/i.test(trimmed)) {
    return 'Quiz';
  }

  if (/\bassignments?\b/i.test(trimmed)) {
    return 'Assignment';
  }

  if (/\bproject\b/i.test(trimmed)) {
    return 'Project';
  }

  if (/\bpresentation\b/i.test(trimmed)) {
    return 'Presentation';
  }

  const dateToken = extractDateToken(trimmed);
  const beforeDate = dateToken ? trimmed.split(dateToken)[0]?.trim() : trimmed;

  if (beforeDate) {
    return beforeDate.replace(/\s{2,}/g, ' ');
  }

  return 'Course Event';
}

function resolveTimeFromContext(contextHint, preferredWeekday, meetingSlots) {
  if (!contextHint) {
    return null;
  }

  const contextKey = contextHint === 'lab' ? 'lab' : 'lecture';
  const preferredOffset = getWeekdayOffset(preferredWeekday);
  const slots = meetingSlots[contextKey] || [];
  const matchingSlot =
    slots.find((slot) => preferredOffset !== null && slot.weekdayOffset === preferredOffset) || slots[0] || null;

  return matchingSlot
    ? {
        weekday: matchingSlot.weekday,
        time: matchingSlot.time,
      }
    : null;
}

function parseMeetingSlots(rawText) {
  const meetingSlots = {
    lecture: [],
    lab: [],
  };

  splitTextIntoLines(rawText).forEach((line) => {
    let bucket = null;

    if (/^lectures?:/i.test(line)) {
      bucket = 'lecture';
    } else if (/^(?:lab and practical|labs?|tutorials?):/i.test(line)) {
      bucket = /tutorial/i.test(line) ? 'lecture' : 'lab';
    }

    if (!bucket) {
      return;
    }

    const matches = [
      ...line.matchAll(
        /(mon(?:day|days)?|tue(?:s(?:day|sdays)?)?|wed(?:nesday|nesdays)?|thu(?:r(?:sday|sdays)?)?|fri(?:day|days)?|sat(?:urday|urdays)?|sun(?:day|days)?)\.?,?\s+([0-2]?\d:\d{2}(?:\s*(?:a\.?m?\.?|p\.?m?\.?))?)\s*[-–]\s*([0-2]?\d:\d{2}(?:\s*(?:a\.?m?\.?|p\.?m?\.?))?)/gi,
      ),
    ];

    matches.forEach((match) => {
      const weekday = extractWeekdayToken(match[1]);
      const weekdayOffset = getWeekdayOffset(weekday);

      if (weekdayOffset === null) {
        return;
      }

      meetingSlots[bucket].push({
        weekday,
        weekdayOffset,
        time: normalizeTime(`${match[2]}-${match[3]}`),
        source: line,
      });
    });
  });

  return meetingSlots;
}

function resolveSchedulingDetails(line, meetingSlots) {
  const weekday = extractWeekdayToken(line);
  const directTime = normalizeTime(line);

  if (weekday && directTime !== 'TBD') {
    return { weekday, time: directTime };
  }

  if (weekday && directTime === 'TBD') {
    const classSlot = resolveTimeFromContext('class', weekday, meetingSlots);

    if (classSlot?.time) {
      return {
        weekday,
        time: classSlot.time,
      };
    }
  }

  if (/\bin lab\b/i.test(line)) {
    const labSlot = resolveTimeFromContext('lab', weekday, meetingSlots);

    if (labSlot) {
      return {
        weekday: weekday || labSlot.weekday,
        time: directTime !== 'TBD' ? directTime : labSlot.time,
      };
    }
  }

  if (/\bin class\b/i.test(line)) {
    const lectureSlot = resolveTimeFromContext('class', weekday, meetingSlots);

    if (lectureSlot) {
      return {
        weekday: weekday || lectureSlot.weekday,
        time: directTime !== 'TBD' ? directTime : lectureSlot.time,
      };
    }
  }

  return {
    weekday,
    time: directTime,
  };
}

function inferWeekdayFromRelatedLine(line, allLines) {
  const normalizedDate = normalizeDate(extractDateToken(line));
  const eventName = inferEventNameFromLine(line).toLowerCase();

  if (!normalizedDate || !eventName || eventName === 'course event') {
    return '';
  }

  const matchingLine = allLines.find((candidateLine) => {
    if (candidateLine === line) {
      return false;
    }

    return (
      normalizeDate(extractDateToken(candidateLine)) === normalizedDate &&
      candidateLine.toLowerCase().includes(eventName) &&
      Boolean(extractWeekdayToken(candidateLine))
    );
  });

  return extractWeekdayToken(matchingLine || '');
}

function parseInstructionalTimeline(rawText) {
  const timeline = [];

  splitTextIntoLines(rawText).forEach((line) => {
    const numericWeekMatch = line.match(NUMERIC_WEEK_ROW_REGEX);

    if (numericWeekMatch) {
      timeline.push({
        type: 'week',
        weekNumber: Number(numericWeekMatch[1]),
        line,
        explicitDate: numericWeekMatch[2],
      });
      return;
    }

    if (READING_WEEK_REGEX.test(line) && !ASSESSMENT_KEYWORD_REGEX.test(line)) {
      const breakDate = findLastParentheticalText(line);
      timeline.push({
        type: 'break',
        line,
        explicitDate: breakDate,
      });
      return;
    }

    const weekMatch = line.match(WEEK_ROW_REGEX);

    if (weekMatch) {
      timeline.push({
        type: 'week',
        weekNumber: Number(weekMatch[1]),
        line,
        explicitDate: '',
      });
    }
  });

  return timeline;
}

function getInstructionalAnchorDate(item, allLines) {
  if (item.explicitDate) {
    const explicitIso = normalizeDate(item.explicitDate);

    if (explicitIso) {
      return explicitIso;
    }
  }

  if (item.type !== 'week') {
    return '';
  }

  const dateToken = extractDateToken(item.line);
  const normalizedDate = normalizeDate(dateToken);

  if (!normalizedDate) {
    return '';
  }

  const weekday = extractWeekdayToken(item.line) || inferWeekdayFromRelatedLine(item.line, allLines);
  const weekdayOffset = getWeekdayOffset(weekday);

  if (weekdayOffset === null) {
    return '';
  }

  return addDaysToIsoDate(normalizedDate, -weekdayOffset);
}

function buildWeekCalendar(rawText) {
  const allLines = splitTextIntoLines(rawText);
  const timeline = parseInstructionalTimeline(rawText);

  if (timeline.length === 0) {
    return new Map();
  }

  const anchors = timeline
    .map((item, position) => ({
      position,
      isoDate: getInstructionalAnchorDate(item, allLines),
    }))
    .filter((anchor) => anchor.isoDate)
    .sort((left, right) => left.position - right.position);

  if (anchors.length === 0) {
    return new Map();
  }

  const dateByPosition = new Map();

  anchors.forEach((anchor) => {
    dateByPosition.set(anchor.position, anchor.isoDate);
  });

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const currentAnchor = anchors[index];
    const nextAnchor = anchors[index + 1];

    for (let position = currentAnchor.position + 1; position < nextAnchor.position; position += 1) {
      dateByPosition.set(position, addDaysToIsoDate(currentAnchor.isoDate, (position - currentAnchor.position) * DAYS_IN_WEEK));
    }
  }

  const firstAnchor = anchors[0];

  for (let position = firstAnchor.position - 1; position >= 0; position -= 1) {
    dateByPosition.set(position, addDaysToIsoDate(firstAnchor.isoDate, (position - firstAnchor.position) * DAYS_IN_WEEK));
  }

  const lastAnchor = anchors[anchors.length - 1];

  for (let position = lastAnchor.position + 1; position < timeline.length; position += 1) {
    dateByPosition.set(position, addDaysToIsoDate(lastAnchor.isoDate, (position - lastAnchor.position) * DAYS_IN_WEEK));
  }

  const weekCalendar = new Map();

  timeline.forEach((item, position) => {
    if (item.type === 'week' && dateByPosition.has(position)) {
      weekCalendar.set(item.weekNumber, dateByPosition.get(position));
    }
  });

  return weekCalendar;
}

function buildAssessmentTemplates(rawText, meetingSlots) {
  const templates = {};

  splitTextIntoLines(rawText).forEach((line) => {
    if (!ASSESSMENT_KEYWORD_REGEX.test(line)) {
      return;
    }

    const scheduling = resolveSchedulingDetails(line, meetingSlots);
    const looksLikeRecurringAssignmentRule =
      /\bselect\b/i.test(line) || WEEK_RANGE_REGEX.test(line) || Boolean(extractWeekdayToken(line));
    const looksLikeRecurringQuizRule =
      WEEK_RANGE_REGEX.test(line) || /\bin (?:lab|class)\b/i.test(line) || Boolean(extractWeekdayToken(line));

    if (/\bassignments?\b/i.test(line) && looksLikeRecurringAssignmentRule && (scheduling.weekday || scheduling.time !== 'TBD')) {
      templates.assignment = {
        weekday: scheduling.weekday,
        time: scheduling.time,
      };
    }

    if (/\bquizzes?\b/i.test(line) && looksLikeRecurringQuizRule) {
      templates.quiz = {
        weekday: scheduling.weekday,
        time: scheduling.time,
      };
    }
  });

  return templates;
}

function buildAssignmentTemplate(rawText, meetingSlots) {
  const assignmentLine = splitTextIntoLines(rawText).find((line) => {
    return /\bassignments?\b/i.test(line) && /\bselect\b/i.test(line);
  });

  if (!assignmentLine) {
    return null;
  }

  const scheduling = resolveSchedulingDetails(assignmentLine, meetingSlots);

  return scheduling.weekday || scheduling.time !== 'TBD'
    ? {
        weekday: scheduling.weekday,
        time: scheduling.time,
      }
    : null;
}

function buildEventFromWeek(weekStartDate, weekdayToken, time, name, evidence) {
  const weekdayOffset = getWeekdayOffset(weekdayToken);

  if (!weekStartDate || weekdayOffset === null) {
    return null;
  }

  return {
    name,
    date: addDaysToIsoDate(weekStartDate, weekdayOffset),
    time: normalizeTime(time),
    evidence,
  };
}

function extractRecurringRangeEvents(rawText, weekCalendar, meetingSlots) {
  const detectedEvents = [];

  splitTextIntoLines(rawText).forEach((line) => {
    if (!isAssessmentCandidateLine(line)) {
      return;
    }

    const rangeMatch = line.match(WEEK_RANGE_REGEX);

    if (!rangeMatch) {
      return;
    }

    const startWeek = Number(rangeMatch[1]);
    const endWeek = Number(rangeMatch[2]);
    const scheduling = resolveSchedulingDetails(line, meetingSlots);

    if (!scheduling.weekday) {
      return;
    }

    const baseName = inferEventNameFromLine(line);

    for (let weekNumber = startWeek; weekNumber <= endWeek; weekNumber += 1) {
      const weekStartDate = weekCalendar.get(weekNumber);
      const event = buildEventFromWeek(
        weekStartDate,
        scheduling.weekday,
        scheduling.time,
        `${baseName} ${weekNumber - startWeek + 1}`,
        `${line} [week ${weekNumber}]`,
      );

      if (event) {
        detectedEvents.push(event);
      }
    }
  });

  return detectedEvents;
}

function extractAssignmentRangeFallbackEvents(rawText, weekCalendar, meetingSlots) {
  const assignmentLine = splitTextIntoLines(rawText).find((line) => {
    return /\bassignments?\b/i.test(line) && WEEK_RANGE_REGEX.test(line);
  });

  if (!assignmentLine) {
    return [];
  }

  const rangeMatch = assignmentLine.match(WEEK_RANGE_REGEX);
  const scheduling = resolveSchedulingDetails(assignmentLine, meetingSlots);

  if (!rangeMatch || !scheduling.weekday) {
    return [];
  }

  const startWeek = Number(rangeMatch[1]);
  const endWeek = Number(rangeMatch[2]);
  const events = [];

  for (let weekNumber = startWeek; weekNumber <= endWeek; weekNumber += 1) {
    const event = buildEventFromWeek(
      weekCalendar.get(weekNumber),
      scheduling.weekday,
      scheduling.time,
      `Assignment ${weekNumber - startWeek + 1}`,
      `${assignmentLine} [week ${weekNumber}]`,
    );

    if (event) {
      events.push(event);
    }
  }

  return events;
}

function extractWeekOccurrenceEvents(rawText, weekCalendar, meetingSlots) {
  const templates = buildAssessmentTemplates(rawText, meetingSlots);
  const assignmentTemplate = templates.assignment || buildAssignmentTemplate(rawText, meetingSlots);
  const detectedEvents = [];

  splitTextIntoLines(rawText).forEach((line) => {
    const weekMatch = line.match(WEEK_ROW_REGEX);

    if (!weekMatch || !isAssessmentCandidateLine(line)) {
      return;
    }

    const weekNumber = Number(weekMatch[1]);
    const weekStartDate = weekCalendar.get(weekNumber);
    const explicitDate = normalizeDate(extractDateToken(line));
    const baseScheduling = resolveSchedulingDetails(line, meetingSlots);
    let date = explicitDate;
    let time = baseScheduling.time;

    if (!date && /\bA\d+\s+due\b/i.test(line)) {
      const inferredEvent = buildEventFromWeek(
        weekStartDate,
        assignmentTemplate?.weekday,
        assignmentTemplate?.time,
        inferEventNameFromLine(line),
        `${line} [assignment template]`,
      );

      if (inferredEvent) {
        detectedEvents.push(inferredEvent);
      }

      return;
    }

    if (!date) {
      return;
    }

    if (time === 'TBD' && /\bin (?:lab|class)\b/i.test(line)) {
      time = baseScheduling.time;
    }

    detectedEvents.push({
      name: inferEventNameFromLine(line),
      date,
      time,
      evidence: line,
    });
  });

  return detectedEvents;
}

function isAssessmentCandidateLine(line) {
  const trimmed = String(line || '').trim();

  if (!trimmed || NON_ASSESSMENT_LINE_REGEX.test(trimmed)) {
    return false;
  }

  if (/^week\s+\d+\s*\(/i.test(trimmed) && !ASSESSMENT_KEYWORD_REGEX.test(trimmed)) {
    return false;
  }

  return ASSESSMENT_KEYWORD_REGEX.test(trimmed) || /\bA\d+\s+due\b/i.test(trimmed);
}

function extractRuleBasedEvents(rawText) {
  const lines = splitTextIntoLines(rawText);
  const meetingSlots = parseMeetingSlots(rawText);
  const weekCalendar = buildWeekCalendar(rawText);
  const detectedEvents = [];

  lines.forEach((line) => {
    if (!isAssessmentCandidateLine(line)) {
      return;
    }

    const dateToken = extractDateToken(line);
    const normalizedDate = normalizeDate(dateToken);

    if (!normalizedDate) {
      return;
    }

    const scheduling = resolveSchedulingDetails(line, meetingSlots);

    detectedEvents.push({
      name: inferEventNameFromLine(line),
      date: normalizedDate,
      time: scheduling.time,
      evidence: line,
    });
  });

  return [
    ...detectedEvents,
    ...extractRecurringRangeEvents(rawText, weekCalendar, meetingSlots),
    ...extractAssignmentRangeFallbackEvents(rawText, weekCalendar, meetingSlots),
    ...extractWeekOccurrenceEvents(rawText, weekCalendar, meetingSlots),
  ];
}

function mergeEventEvidence(events) {
  const mergedByKey = new Map();

  events.forEach((event, index) => {
    const key = `${normalizeEventName(event.name)}|${normalizeDate(event.date)}`;
    const existing = mergedByKey.get(key);

    if (!existing) {
      mergedByKey.set(key, {
        ...event,
        _index: index,
      });
      return;
    }

    if ((existing.time === 'TBD' || !existing.time) && event.time && event.time !== 'TBD') {
      existing.time = event.time;
    }

    if (!existing.evidence && event.evidence) {
      existing.evidence = event.evidence;
    }

    if (event.evidence && existing.evidence && event.evidence.length > existing.evidence.length) {
      existing.evidence = event.evidence;
    }
  });

  return [...mergedByKey.values()]
    .sort((left, right) => left._index - right._index)
    .map(({ _index, ...event }) => event);
}

function normalizeEvents(events) {
  const eventList = Array.isArray(events) ? events : [];

  const normalized = eventList
    .map((event, index) => {
      const name = normalizeEventName(event.name);
      const date = normalizeDate(event.date);
      const time = normalizeTime(event.time);

      if (!date) {
        return null;
      }

      return {
        id: `${name}-${date}-${time}-${index}`
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/-+/g, '-'),
        name,
        date,
        time,
      };
    })
    .filter(Boolean);

  const uniqueEvents = normalized.filter((event, index, allEvents) => {
    return (
      allEvents.findIndex((candidate) => {
        return candidate.name === event.name && candidate.date === event.date && candidate.time === event.time;
      }) === index
    );
  });

  return uniqueEvents.sort((left, right) => {
    const leftKey = `${left.date}T${left.time === 'TBD' ? '23:59' : left.time}`;
    const rightKey = `${right.date}T${right.time === 'TBD' ? '23:59' : right.time}`;
    return leftKey.localeCompare(rightKey);
  });
}

function splitTextIntoLines(rawText) {
  return String(rawText || '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function lineHasDate(line) {
  return Boolean(extractDateToken(line));
}

function lineHasAssessmentKeyword(line) {
  return ASSESSMENT_KEYWORD_REGEX.test(line);
}

function buildCandidateContext(rawText) {
  const lines = splitTextIntoLines(rawText);
  const selectedIndexes = new Set();

  const includeRange = (startIndex, endIndex) => {
    for (let index = Math.max(0, startIndex); index <= Math.min(lines.length - 1, endIndex); index += 1) {
      selectedIndexes.add(index);
    }
  };

  lines.forEach((line, index) => {
    if (NON_ASSESSMENT_LINE_REGEX.test(line)) {
      return;
    }

    const previousLine = lines[index - 1] || '';
    const nextLine = lines[index + 1] || '';
    const previousTwoLines = `${lines[index - 2] || ''} ${previousLine}`.trim();
    const nextTwoLines = `${nextLine} ${lines[index + 2] || ''}`.trim();
    const hasDate = lineHasDate(line);
    const hasKeyword = lineHasAssessmentKeyword(line);
    const nearbyDate = lineHasDate(previousLine) || lineHasDate(nextLine) || lineHasDate(nextTwoLines);
    const nearbyKeyword =
      lineHasAssessmentKeyword(previousLine) ||
      lineHasAssessmentKeyword(nextLine) ||
      lineHasAssessmentKeyword(previousTwoLines) ||
      lineHasAssessmentKeyword(nextTwoLines);

    if (IMPORTANT_HEADING_REGEX.test(line)) {
      includeRange(index, index + 12);
      return;
    }

    if ((hasDate && hasKeyword) || (hasKeyword && nearbyDate) || (hasDate && nearbyKeyword)) {
      includeRange(index - 1, index + 2);
    }
  });

  const selectedLines = [...selectedIndexes]
    .sort((left, right) => left - right)
    .slice(0, MAX_CONTEXT_LINES)
    .map((index) => `L${index + 1}: ${lines[index]}`);

  const fallbackLines =
    selectedLines.length > 0
      ? selectedLines
      : lines.slice(0, MAX_CONTEXT_LINES).map((line, index) => `L${index + 1}: ${line}`);

  return {
    totalLines: lines.length,
    selectedCount: selectedLines.length,
    contextText: fallbackLines.join('\n'),
  };
}

function buildExtractionPrompt(rawText, fileName) {
  const candidateContext = buildCandidateContext(rawText);
  const ruleBasedEvents = mergeEventEvidence(extractRuleBasedEvents(rawText));
  const ruleBasedHints =
    ruleBasedEvents.length > 0
      ? ruleBasedEvents
          .map((event) => {
            return `- ${event.name} | ${event.date} | ${event.time} | evidence: ${event.evidence}`;
          })
          .join('\n')
      : '- none';

  return `
You are extracting assessed calendar events from a university course syllabus.

File name: ${fileName}
Total source lines: ${candidateContext.totalLines}
Selected candidate lines: ${candidateContext.selectedCount}

Requirements:
- Return only JSON that matches the schema.
- Extract only events with a concrete calendar date.
- Include exams, quizzes, tests, assignments, projects, labs, papers, presentations, and deadlines.
- Use only the source lines below. If an event is not directly supported by those lines, omit it.
- Never create events from lecture times, office hours, course titles, meeting patterns, or catalog metadata.
- Prefer concrete assessment deadlines over generic class schedule items.
- Use YYYY-MM-DD for every date.
- Use 24-hour HH:MM only when an exact time is explicitly provided.
- If no exact time is provided, use "TBD".
- Keep event names concise and student-friendly.
- Ignore weekly readings unless they include a due date or assessment date.
- Deduplicate repeated events.
- If the syllabus mentions a month/day without a year, infer the most likely year from context. If still unclear, use the current year.
- Add a short "evidence" string copied from the source lines for every event.
- If you are unsure, return fewer events instead of hallucinating.

High-confidence parser hints:
${ruleBasedHints}

Candidate source lines:
${candidateContext.contextText.slice(0, MAX_TEXT_LENGTH)}
`.trim();
}

function eventLooksGrounded(event, rawText) {
  const evidence = String(event.evidence || '').trim();
  const haystack = String(rawText || '').toLowerCase();
  const normalizedName = normalizeEventName(event.name).toLowerCase();
  const normalizedDate = normalizeDate(event.date);

  if (evidence && !haystack.includes(evidence.toLowerCase())) {
    return false;
  }

  if (normalizedDate && !haystack.includes(normalizedDate.toLowerCase())) {
    const compactDate = normalizedDate.replace(/-/g, '/');
    const [year, month, day] = normalizedDate.split('-');
    const shortDate = `${month}/${day}`;

    if (!haystack.includes(compactDate.toLowerCase()) && !haystack.includes(shortDate.toLowerCase())) {
      return false;
    }
  }

  const importantNameTokens = normalizedName
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length >= 4);

  if (importantNameTokens.length === 0) {
    return true;
  }

  return importantNameTokens.some((token) => haystack.includes(token));
}

function extractJsonContent(messageContent) {
  const trimmed = String(messageContent || '').trim();

  if (!trimmed) {
    return { events: [] };
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```([\s\S]*?)```/);

    if (fencedMatch) {
      return JSON.parse(fencedMatch[1].trim());
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('The local model returned an invalid JSON payload.');
  }
}

async function fetchOllamaTags() {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);

  if (!response.ok) {
    throw new Error(`Ollama responded with ${response.status}.`);
  }

  return response.json();
}

async function handleHealth(response) {
  try {
    const data = await fetchOllamaTags();
    const availableModels = Array.isArray(data.models) ? data.models.map((model) => model.name) : [];
    const modelInstalled = availableModels.some((modelName) => modelName === OLLAMA_MODEL || modelName.startsWith(`${OLLAMA_MODEL}:`));

    sendJson(response, 200, {
      ok: true,
      ollamaReachable: true,
      model: OLLAMA_MODEL,
      modelInstalled,
      availableModels,
    });
  } catch (error) {
    sendJson(response, 200, {
      ok: false,
      ollamaReachable: false,
      model: OLLAMA_MODEL,
      modelInstalled: false,
      availableModels: [],
      error: error.message,
    });
  }
}

async function handleExtraction(request, response) {
  const body = await readJsonBody(request);
  const rawText = String(body.rawText || '').trim();
  const fileName = String(body.fileName || 'syllabus.pdf').trim() || 'syllabus.pdf';

  if (!rawText) {
    sendJson(response, 400, {
      error: 'No syllabus text was provided to the local model backend.',
    });
    return;
  }

  let ollamaResponse;

  try {
    ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        think: false,
        keep_alive: '10m',
        format: eventResponseSchema,
        options: {
          temperature: 0,
        },
        messages: [
          {
            role: 'system',
            content:
              'You extract structured syllabus deadlines for students. Return strict JSON only, following the provided schema exactly.',
          },
          {
            role: 'user',
            content: buildExtractionPrompt(rawText, fileName),
          },
        ],
      }),
    });
  } catch {
    sendJson(response, 503, {
      error:
        'Could not reach Ollama on your machine. Start Ollama first, then make sure it is listening on http://127.0.0.1:11434.',
    });
    return;
  }

  if (!ollamaResponse.ok) {
    let details = `Local model request failed with status ${ollamaResponse.status}.`;

    try {
      const errorPayload = await ollamaResponse.json();
      if (errorPayload.error) {
        details = errorPayload.error;
      }
    } catch {
      // Ignore secondary parsing errors and keep the generic message.
    }

    sendJson(response, 502, {
      error: details,
      model: OLLAMA_MODEL,
    });
    return;
  }

  const ollamaPayload = await ollamaResponse.json();
  const parsedContent = extractJsonContent(ollamaPayload.message?.content);
  const ruleBasedEvents = mergeEventEvidence(extractRuleBasedEvents(rawText));
  const groundedEvents = (Array.isArray(parsedContent.events) ? parsedContent.events : []).filter((event) => {
    return eventLooksGrounded(event, rawText);
  });
  const normalizedEvents = normalizeEvents(mergeEventEvidence([...ruleBasedEvents, ...groundedEvents]));

  sendJson(response, 200, {
    events: normalizedEvents,
    model: OLLAMA_MODEL,
  });
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    await handleHealth(response);
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/extract-events') {
    try {
      await handleExtraction(request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || 'Unexpected local model server error.',
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/') {
    sendText(
      response,
      200,
      `Syllabus Terminator local AI server is running.\nModel: ${OLLAMA_MODEL}\nBase URL: ${OLLAMA_BASE_URL}\n`,
    );
    return;
  }

  sendJson(response, 404, {
    error: 'Route not found.',
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Local AI server listening on http://${HOST}:${PORT}`);
  console.log(`Using Ollama at ${OLLAMA_BASE_URL} with model ${OLLAMA_MODEL}`);
});
