import { formatDateForDisplay, formatTimeForDisplay } from '../utils/dateFormatting';

function baseInputClasses() {
  return 'w-full rounded-2xl border border-pine/15 bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-ink/30 focus:border-pine/40 focus:ring-2 focus:ring-lime/40';
}

function EventEditorFields({ event, onDeleteEvent, onEventChange, compact = false, showDelete = true }) {
  const wrapperClass = compact ? 'grid gap-3' : 'grid gap-3 md:grid-cols-[minmax(0,1.3fr)_180px_180px_112px]';

  return (
    <div className={wrapperClass}>
      <label className="block">
        <span className="sr-only">Event name</span>
        <input
          type="text"
          value={event.name}
          onChange={(inputEvent) => onEventChange(event.id, 'name', inputEvent.target.value)}
          placeholder="Event name"
          className={baseInputClasses()}
        />
      </label>

      <label className="block">
        <span className="sr-only">Event date</span>
        <input
          type="date"
          value={event.date}
          onChange={(inputEvent) => onEventChange(event.id, 'date', inputEvent.target.value)}
          className={baseInputClasses()}
        />
      </label>

      <div className="flex items-start gap-2">
        <label className="block min-w-0 flex-1">
          <span className="sr-only">Event time</span>
          <input
            type="time"
            step="60"
            value={event.time === 'TBD' ? '' : event.time}
            onChange={(inputEvent) => onEventChange(event.id, 'time', inputEvent.target.value)}
            className={baseInputClasses()}
          />
        </label>

        <button
          type="button"
          onClick={() => onEventChange(event.id, 'time', 'TBD')}
          className="rounded-2xl border border-pine/15 bg-white px-3 py-3 text-xs font-semibold text-pine transition hover:border-pine/35 hover:bg-lime/20"
        >
          No time
        </button>
      </div>

      {showDelete ? (
        <button
          type="button"
          onClick={() => onDeleteEvent(event.id)}
          className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

function ResultsTable({
  events,
  onAddEvent,
  onDeleteEvent,
  onEventChange,
  onExport,
  onReset,
  canReset,
}) {
  const hasCompleteEvents = events.some((event) => event.name.trim() && event.date.trim());

  return (
    <section className="glass-panel p-6 sm:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="section-label">Review Events</p>
          <h3 className="mt-4 text-2xl font-bold text-ink sm:text-3xl">Check and edit the extracted deadlines before exporting</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70 sm:text-base">
            You can directly rename events, correct dates and times, remove rows, or add missing ones before downloading the calendar file.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onAddEvent}
            className="inline-flex items-center justify-center rounded-full border border-pine/15 bg-white px-5 py-3 text-sm font-semibold text-pine transition hover:-translate-y-0.5 hover:border-pine/35 hover:bg-lime/20"
          >
            Add Event
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            className="inline-flex items-center justify-center rounded-full border border-pine/15 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-pine/35 hover:bg-sand/50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Reset to Extracted
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!hasCompleteEvents}
            className="inline-flex items-center justify-center rounded-full bg-pine px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-pine/20 transition hover:-translate-y-0.5 hover:bg-ink disabled:cursor-not-allowed disabled:bg-pine/45 disabled:hover:translate-y-0"
          >
            Export to Calendar (.ics)
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-pine/10 bg-lime/10 px-4 py-4 text-sm leading-6 text-ink/75">
        Empty `time` fields export as `TBD`. Rows without both a name and a date are kept in the editor but skipped during export.
      </div>

      <div className="mt-8 hidden overflow-hidden rounded-3xl border border-pine/10 xl:block">
        <table className="min-w-full divide-y divide-pine/10 text-left">
          <thead className="bg-sand/70">
            <tr className="text-xs font-semibold uppercase tracking-[0.24em] text-pine/80">
              <th className="px-6 py-4">Event Name</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Time</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pine/10 bg-white/80">
            {events.length > 0 ? (
              events.map((event) => (
                <tr key={event.id} className="align-top transition hover:bg-lime/10">
                  <td className="px-6 py-5">
                    <input
                      type="text"
                      value={event.name}
                      onChange={(inputEvent) => onEventChange(event.id, 'name', inputEvent.target.value)}
                      placeholder="Event name"
                      className={baseInputClasses()}
                    />
                    <p className="mt-2 text-xs text-ink/45">Preview: {event.name.trim() || 'Untitled event'}</p>
                  </td>
                  <td className="px-6 py-5">
                    <input
                      type="date"
                      value={event.date}
                      onChange={(inputEvent) => onEventChange(event.id, 'date', inputEvent.target.value)}
                      className={baseInputClasses()}
                    />
                    <p className="mt-2 text-xs text-ink/45">{formatDateForDisplay(event.date)}</p>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-start gap-2">
                      <input
                        type="time"
                        step="60"
                        value={event.time === 'TBD' ? '' : event.time}
                        onChange={(inputEvent) => onEventChange(event.id, 'time', inputEvent.target.value)}
                        className={baseInputClasses()}
                      />
                      <button
                        type="button"
                        onClick={() => onEventChange(event.id, 'time', 'TBD')}
                        className="rounded-2xl border border-pine/15 bg-white px-3 py-3 text-xs font-semibold text-pine transition hover:border-pine/35 hover:bg-lime/20"
                      >
                        No time
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-ink/45">{formatTimeForDisplay(event.time)}</p>
                  </td>
                  <td className="px-6 py-5">
                    <button
                      type="button"
                      onClick={() => onDeleteEvent(event.id)}
                      className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="px-6 py-10 text-center text-sm text-ink/60">
                  No events are currently in the list. Add one manually or reset to the extracted results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-4 xl:hidden">
        {events.length > 0 ? (
          events.map((event) => (
            <article key={event.id} className="rounded-3xl border border-pine/10 bg-white/80 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-pine/70">Event</p>
                  <p className="mt-2 text-lg font-semibold text-ink">{event.name.trim() || 'Untitled event'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteEvent(event.id)}
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                >
                  Remove
                </button>
              </div>

              <div className="mt-5">
                <EventEditorFields
                  event={event}
                  onDeleteEvent={onDeleteEvent}
                  onEventChange={onEventChange}
                  compact
                  showDelete={false}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-sand/60 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-pine/70">Date Preview</p>
                  <p className="mt-2 font-medium text-ink/80">{formatDateForDisplay(event.date)}</p>
                </div>
                <div className="rounded-2xl bg-sand/60 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-pine/70">Time Preview</p>
                  <p className="mt-2 font-medium text-ink/80">{formatTimeForDisplay(event.time)}</p>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-3xl border border-pine/10 bg-white/80 px-5 py-8 text-center text-sm text-ink/60">
            No events are currently in the list. Add one manually or reset to the extracted results.
          </div>
        )}
      </div>
    </section>
  );
}

export default ResultsTable;
