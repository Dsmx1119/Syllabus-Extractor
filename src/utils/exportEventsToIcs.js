function buildDownloadName(sourceName) {
  const safeName = (sourceName || 'syllabus-calendar')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `${safeName || 'syllabus-calendar'}.ics`;
}

function normalizeEventForIcs(event) {
  const [year, month, day] = event.date.split('-').map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid event date for "${event.name}".`);
  }

  if (!event.time || event.time === 'TBD') {
    return {
      title: event.name,
      start: [year, month, day],
      duration: { days: 1 },
      description: 'Generated and reviewed in Syllabus Terminator.',
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
    };
  }

  const [hour, minute] = event.time.split(':').map(Number);

  return {
    title: event.name,
    start: [year, month, day, hour, minute],
    duration: { hours: 1 },
    description: 'Generated and reviewed in Syllabus Terminator.',
    startOutputType: 'local',
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
  };
}

export async function downloadEventsAsIcs(events, sourceName) {
  const { createEvents } = await import('ics');
  const preparedEvents = events.map(normalizeEventForIcs);
  const { error, value } = createEvents(preparedEvents);

  if (error) {
    throw error;
  }

  const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildDownloadName(sourceName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
