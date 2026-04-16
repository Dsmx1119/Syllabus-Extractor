import fs from 'node:fs/promises';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MONTH_DATE_REGEX =
  /\b(?:jan(?:uary)?\.?|feb(?:ruary)?\.?|mar(?:ch)?\.?|apr(?:il)?\.?|may\.?|jun(?:e)?\.?|jul(?:y)?\.?|aug(?:ust)?\.?|sep(?:t|tember)?\.?|oct(?:ober)?\.?|nov(?:ember)?\.?|dec(?:ember)?\.?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?/i;
const NUMERIC_DATE_REGEX = /(?<![:.\dA-Za-z])\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?![:.\dA-Za-z])/i;
const ASSESSMENT_KEYWORD_REGEX =
  /\b(exam|midterm|final|quiz|assignment|project|lab|paper|presentation|deadline|due|test|homework|report|deliverable)\b/i;
const DATE_REGEX = new RegExp(`${MONTH_DATE_REGEX.source}|${NUMERIC_DATE_REGEX.source}`, 'i');
const DAYS_IN_WEEK = 7;
const WEEK_ROW_REGEX = /^\s*week\s+(\d{1,2})\b/i;
const NUMERIC_WEEK_ROW_REGEX = /^\s*(\d{1,2})\s*\(([^)]+)\)/i;
const WEEK_RANGE_REGEX = /\bweeks?\s+(\d{1,2})\s*-\s*(\d{1,2})\b/i;
const READING_WEEK_REGEX = /reading week/i;
const WEEKDAY_REGEX =
  /\b(mon(?:day|days)?|tue(?:s)?(?:day|days)?|wed(?:nesday|nesdays)?|thu(?:rs?)?(?:day|days)?|fri(?:day|days)?|sat(?:urday|urdays)?|sun(?:day|days)?)\b/i;
const IMPORTANT_HEADING_REGEX =
  /^(important dates?|course schedule|schedule|tentative schedule|assessment(?:s)?|deliverables|grading|evaluation|major dates?)$/i;
const NON_ASSESSMENT_LINE_REGEX =
  /^(lectures?:|lab and practical:|office hours?|prerequisites?:|instructor:|ta contact info:|course meetings|course contacts|course overview|course description|course structure|learning objectives|refer to acorn)/i;

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

function normalizeFragment(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeLineItems(items) {
  const sortedItems = [...items].sort((left, right) => {
    return left.x === right.x ? left.order - right.order : left.x - right.x;
  });

  let lineText = '';
  let previousRightEdge = null;

  sortedItems.forEach((item) => {
    const text = normalizeFragment(item.text);

    if (!text) {
      return;
    }

    const gap = previousRightEdge === null ? 0 : item.x - previousRightEdge;
    const needsSpace =
      previousRightEdge !== null &&
      gap > 2.5 &&
      !/^[,.;:!?)]/.test(text) &&
      !/[(\[]$/.test(lineText);

    lineText += `${needsSpace ? ' ' : ''}${text}`;
    previousRightEdge = item.x + item.width;
  });

  return lineText
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([(\[])\s+/g, '$1')
    .trim();
}

function groupTextItemsIntoLines(items) {
  const rows = [];
  const yTolerance = 2.5;

  items.forEach((item, index) => {
    if (!('str' in item)) {
      return;
    }

    const text = normalizeFragment(item.str);

    if (!text) {
      return;
    }

    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const width = item.width ?? 0;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= yTolerance);

    if (!row) {
      row = { y, order: index, items: [] };
      rows.push(row);
    }

    row.items.push({
      text: item.str,
      x,
      width,
      order: index,
    });
  });

  return rows
    .sort((left, right) => {
      const yDifference = right.y - left.y;
      return Math.abs(yDifference) > yTolerance ? yDifference : left.order - right.order;
    })
    .map((row) => mergeLineItems(row.items))
    .filter(Boolean);
}

function splitTextIntoLines(rawText) {
  return String(rawText || '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
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
    const hasDate = Boolean(extractDateToken(line));
    const hasKeyword = ASSESSMENT_KEYWORD_REGEX.test(line);
    const nearbyDate =
      Boolean(extractDateToken(previousLine)) ||
      Boolean(extractDateToken(nextLine)) ||
      Boolean(extractDateToken(nextTwoLines));
    const nearbyKeyword =
      ASSESSMENT_KEYWORD_REGEX.test(previousLine) ||
      ASSESSMENT_KEYWORD_REGEX.test(nextLine) ||
      ASSESSMENT_KEYWORD_REGEX.test(previousTwoLines) ||
      ASSESSMENT_KEYWORD_REGEX.test(nextTwoLines);

    if (IMPORTANT_HEADING_REGEX.test(line)) {
      includeRange(index, index + 12);
      return;
    }

    if ((hasDate && hasKeyword) || (hasKeyword && nearbyDate) || (hasDate && nearbyKeyword)) {
      includeRange(index - 1, index + 2);
    }
  });

  return [...selectedIndexes]
    .sort((left, right) => left - right)
    .map((index) => `L${index + 1}: ${lines[index]}`);
}

function normalizeDate(dateString) {
  const trimmed = String(dateString || '').trim();

  if (!trimmed) {
    return '';
  }

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

  const numericMatch = trimmed.match(NUMERIC_DATE_REGEX);

  if (numericMatch) {
    const [monthToken, dayToken, yearToken] = numericMatch[0].split(/[/-]/);
    const month = String(Number(monthToken)).padStart(2, '0');
    const day = String(Number(dayToken)).padStart(2, '0');
    const year = yearToken ? (yearToken.length === 2 ? `20${yearToken}` : yearToken) : String(new Date().getFullYear());
    return `${year}-${month}-${day}`;
  }

  return '';
}

function normalizeTime(timeString) {
  const trimmed = String(timeString || '').trim();

  if (!trimmed) {
    return 'TBD';
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

  const dateToken = extractDateToken(trimmed);
  return (dateToken ? trimmed.split(dateToken)[0]?.trim() : trimmed) || 'Course Event';
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
      timeline.push({
        type: 'break',
        line,
        explicitDate: findLastParentheticalText(line),
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

  const normalizedDate = normalizeDate(extractDateToken(item.line));

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

    const scheduling = resolveSchedulingDetails(line, meetingSlots);

    if (!scheduling.weekday) {
      return;
    }

    const startWeek = Number(rangeMatch[1]);
    const endWeek = Number(rangeMatch[2]);
    const baseName = inferEventNameFromLine(line);

    for (let weekNumber = startWeek; weekNumber <= endWeek; weekNumber += 1) {
      const event = buildEventFromWeek(
        weekCalendar.get(weekNumber),
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
    const scheduling = resolveSchedulingDetails(line, meetingSlots);

    if (!explicitDate && /\bA\d+\s+due\b/i.test(line)) {
      const event = buildEventFromWeek(
        weekStartDate,
        assignmentTemplate?.weekday,
        assignmentTemplate?.time,
        inferEventNameFromLine(line),
        `${line} [assignment template]`,
      );

      if (event) {
        detectedEvents.push(event);
      }

      return;
    }

    if (!explicitDate) {
      return;
    }

    detectedEvents.push({
      name: inferEventNameFromLine(line),
      date: explicitDate,
      time: scheduling.time,
      evidence: line,
    });
  });

  return detectedEvents;
}

function extractRuleBasedEvents(rawText) {
  const lines = splitTextIntoLines(rawText);
  const meetingSlots = parseMeetingSlots(rawText);
  const weekCalendar = buildWeekCalendar(rawText);

  return [
    ...lines
      .filter((line) => isAssessmentCandidateLine(line))
      .map((line) => {
        const normalizedDate = normalizeDate(extractDateToken(line));
        const scheduling = resolveSchedulingDetails(line, meetingSlots);

        return {
          name: inferEventNameFromLine(line),
          date: normalizedDate,
          time: scheduling.time,
          evidence: line,
        };
      })
      .filter((event) => event.date),
    ...extractRecurringRangeEvents(rawText, weekCalendar, meetingSlots),
    ...extractAssignmentRangeFallbackEvents(rawText, weekCalendar, meetingSlots),
    ...extractWeekOccurrenceEvents(rawText, weekCalendar, meetingSlots),
  ];
}

async function extractTextFromPdfFile(pdfPath) {
  const pdfData = new Uint8Array(await fs.readFile(pdfPath));
  const loadingTask = getDocument({ data: pdfData, useWorkerFetch: false, isEvalSupported: false });
  const pdf = await loadingTask.promise;

  try {
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageLines = groupTextItemsIntoLines(textContent.items);
      pages.push(`[Page ${pageNumber}]\n${pageLines.join('\n')}`);
    }

    return pages.join('\n\n').trim();
  } finally {
    pdf.cleanup();
    await loadingTask.destroy();
  }
}

async function main() {
  const inputPaths = process.argv.slice(2);

  if (inputPaths.length === 0) {
    console.error('Usage: node scripts/debug_extract_pdf.mjs <pdf-path> [pdf-path...]');
    process.exit(1);
  }

  for (const inputPath of inputPaths) {
    const absolutePath = path.resolve(inputPath);
    const rawText = await extractTextFromPdfFile(absolutePath);
    const candidateLines = buildCandidateContext(rawText);
    const weekCalendar = buildWeekCalendar(rawText);
    const meetingSlots = parseMeetingSlots(rawText);
    const templates = buildAssessmentTemplates(rawText, meetingSlots);

    console.log(`\n===== FILE: ${absolutePath} =====`);
    console.log('\n----- RAW TEXT PREVIEW (first 220 lines) -----');
    console.log(splitTextIntoLines(rawText).slice(0, 220).join('\n'));
    console.log('\n----- CANDIDATE LINES -----');
    console.log(candidateLines.join('\n') || '[No candidate lines selected]');
    console.log('\n----- WEEK CALENDAR -----');
    console.log(
      [...weekCalendar.entries()]
        .map(([weekNumber, isoDate]) => `Week ${weekNumber} => ${isoDate}`)
        .join('\n') || '[No week calendar inferred]',
    );
    console.log('\n----- TEMPLATES -----');
    console.log(JSON.stringify(templates, null, 2));
    console.log('\n----- RULE-BASED EVENTS -----');
    console.log(
      extractRuleBasedEvents(rawText)
        .map((event) => `${event.name} | ${event.date} | ${event.time} | ${event.evidence}`)
        .join('\n') || '[No rule-based events detected]',
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
