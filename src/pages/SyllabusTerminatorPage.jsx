import { useEffect, useState } from 'react';
import FileDropzone from '../components/FileDropzone';
import LoadingState from '../components/LoadingState';
import ResultsTable from '../components/ResultsTable';
import { formatDateForDisplay } from '../utils/dateFormatting';
import { downloadEventsAsIcs } from '../utils/exportEventsToIcs';
import { extractTextFromPdf } from '../utils/extractTextFromPdf';
import {
  extractEventsWithLocalModel,
  fetchLocalAiHealth,
  getDefaultLocalModelName,
} from '../utils/localModelApi';

function buildEditableEventId(index = 0) {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `event-${Date.now()}-${index}-${Math.round(Math.random() * 100000)}`;
}

function hydrateEditableEvents(rawEvents = []) {
  return rawEvents.map((event, index) => ({
    id: event.id || buildEditableEventId(index),
    name: event.name || '',
    date: event.date || '',
    time: event.time || 'TBD',
  }));
}

function cloneEvents(events = []) {
  return events.map((event) => ({ ...event }));
}

function createEmptyEvent() {
  return {
    id: buildEditableEventId(),
    name: '',
    date: '',
    time: 'TBD',
  };
}

function buildBackendStatus(health) {
  if (health?.ollamaReachable && health?.modelInstalled) {
    return {
      tone: 'success',
      title: 'Local AI ready',
      message: `${health.model} is installed and ready through Ollama.`,
      model: health.model,
    };
  }

  if (health?.ollamaReachable) {
    return {
      tone: 'warning',
      title: 'Model missing',
      message: `Ollama is running, but ${health?.model || getDefaultLocalModelName()} is not installed yet. Run ollama pull ${health?.model || getDefaultLocalModelName()}.`,
      model: health?.model || getDefaultLocalModelName(),
    };
  }

  return {
    tone: 'danger',
    title: 'Ollama offline',
    message: `Start Ollama on your machine, then run npm run server. The app expects ${health?.model || getDefaultLocalModelName()} by default.`,
    model: health?.model || getDefaultLocalModelName(),
  };
}

function getStatusCardClasses(tone) {
  if (tone === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }

  if (tone === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }

  return 'border-red-200 bg-red-50 text-red-700';
}

function SyllabusTerminatorPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [events, setEvents] = useState([]);
  const [extractedEventsSnapshot, setExtractedEventsSnapshot] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState({
    tone: 'warning',
    title: 'Checking local AI',
    message: 'Trying to reach your local Ollama backend.',
    model: getDefaultLocalModelName(),
  });

  const refreshBackendStatus = async () => {
    try {
      const health = await fetchLocalAiHealth();
      setBackendStatus(buildBackendStatus(health));
    } catch (error) {
      setBackendStatus({
        tone: 'danger',
        title: 'Backend unavailable',
        message:
          error.message ||
          `Could not reach the local AI server. Start it with npm run server, then make sure Ollama is running.`,
        model: getDefaultLocalModelName(),
      });
    }
  };

  useEffect(() => {
    refreshBackendStatus();
  }, []);

  const processSyllabusFile = async (file) => {
    setSelectedFile(file);
    setEvents([]);
    setExtractedEventsSnapshot([]);
    setErrorMessage('');
    setStatusMessage('');
    setIsProcessing(true);

    try {
      const rawText = await extractTextFromPdf(file);
      const extractionResult = await extractEventsWithLocalModel(rawText, file.name);
      const extractedEvents = hydrateEditableEvents(extractionResult.events || []);

      setEvents(extractedEvents);
      setExtractedEventsSnapshot(cloneEvents(extractedEvents));
      setBackendStatus((previousStatus) => ({
        ...previousStatus,
        tone: 'success',
        title: 'Last extraction complete',
        message: `${extractionResult.model || previousStatus.model} handled the latest syllabus parse.`,
        model: extractionResult.model || previousStatus.model,
      }));

      if (extractedEvents.length === 0) {
        setStatusMessage('The local model did not find any concrete dated events in this PDF. Try a more text-based syllabus or a stronger local model size.');
        return;
      }

      setStatusMessage(
        `Detected ${extractedEvents.length} event${extractedEvents.length > 1 ? 's' : ''} from ${file.name} using ${extractionResult.model || getDefaultLocalModelName()}.`,
      );
    } catch (error) {
      setErrorMessage(error.message || 'Something went wrong while processing the PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEventChange = (eventId, field, value) => {
    setEvents((currentEvents) =>
      currentEvents.map((event) => {
        if (event.id !== eventId) {
          return event;
        }

        return {
          ...event,
          [field]: field === 'time' ? value || 'TBD' : value,
        };
      }),
    );
  };

  const handleAddEvent = () => {
    setEvents((currentEvents) => [...currentEvents, createEmptyEvent()]);
    setStatusMessage('Added a blank event row. You can fill it in before exporting.');
    setErrorMessage('');
  };

  const handleDeleteEvent = (eventId) => {
    setEvents((currentEvents) => currentEvents.filter((event) => event.id !== eventId));
    setStatusMessage('Removed that event from the export list.');
    setErrorMessage('');
  };

  const handleResetEvents = () => {
    setEvents(cloneEvents(extractedEventsSnapshot));
    setStatusMessage('Reverted the table back to the latest extracted results.');
    setErrorMessage('');
  };

  const handleExport = async () => {
    try {
      const preparedEvents = events
        .map((event) => ({
          ...event,
          name: event.name.trim(),
          date: event.date.trim(),
          time: event.time || 'TBD',
        }))
        .filter((event) => event.name && event.date);

      if (preparedEvents.length === 0) {
        throw new Error('Add at least one event with both a name and a date before exporting.');
      }

      await downloadEventsAsIcs(preparedEvents, selectedFile?.name);

      const skippedCount = events.length - preparedEvents.length;
      setStatusMessage(
        skippedCount > 0
          ? `Calendar file generated successfully. Exported ${preparedEvents.length} completed event${preparedEvents.length > 1 ? 's' : ''} and skipped ${skippedCount} incomplete row${skippedCount > 1 ? 's' : ''}.`
          : 'Calendar file generated successfully. Import the downloaded .ics into Google Calendar.',
      );
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error.message || 'Unable to generate the calendar file.');
    }
  };

  const hasReviewTable = Boolean(selectedFile) && !isProcessing;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <section className="glass-panel relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10 lg:px-10">
        <div className="absolute inset-0 bg-aurora opacity-80" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-end">
          <div>
            <p className="section-label">Syllabus Terminator</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-extrabold tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Turn a messy syllabus PDF into calendar-ready deadlines.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-ink/75 sm:text-lg">
              Upload once, let the parser extract raw text, run a local DeepSeek model through Ollama, then review and export an `.ics` file for Google Calendar.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-[24px] border border-white/70 bg-white/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-pine/70">Step 1</p>
              <p className="mt-3 text-lg font-semibold text-ink">Upload PDF</p>
              <p className="mt-2 text-sm leading-6 text-ink/65">Drag in a course outline or select it from disk.</p>
            </div>
            <div className="rounded-[24px] border border-white/70 bg-white/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-pine/70">Step 2</p>
              <p className="mt-3 text-lg font-semibold text-ink">Review events</p>
              <p className="mt-2 text-sm leading-6 text-ink/65">Check assignments, tests, and final exam timing.</p>
            </div>
            <div className="rounded-[24px] border border-white/70 bg-white/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-pine/70">Step 3</p>
              <p className="mt-3 text-lg font-semibold text-ink">Export .ics</p>
              <p className="mt-2 text-sm leading-6 text-ink/65">Download a calendar file that can be imported into Google Calendar.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <FileDropzone file={selectedFile} isProcessing={isProcessing} onFileSelected={processSyllabusFile} />

        <aside className="glass-panel p-6 sm:p-7">
          <p className="section-label">Pipeline</p>
          <div className="mt-5 space-y-4">
            <div className="rounded-3xl bg-sand/65 p-4">
              <p className="text-sm font-semibold text-ink">1. PDF text extraction</p>
              <p className="mt-2 text-sm leading-6 text-ink/65">
                `pdfjs-dist` reads the uploaded syllabus and combines text content page by page.
              </p>
            </div>
            <div className="rounded-3xl bg-sand/65 p-4">
              <p className="text-sm font-semibold text-ink">2. Local DeepSeek formatting</p>
              <p className="mt-2 text-sm leading-6 text-ink/65">
                A local Node server sends extracted syllabus text to Ollama, which runs `deepseek-r1` and returns structured events.
              </p>
            </div>
            <div className="rounded-3xl bg-sand/65 p-4">
              <p className="text-sm font-semibold text-ink">3. ICS generation</p>
              <p className="mt-2 text-sm leading-6 text-ink/65">
                The `ics` utility converts reviewed items into a downloadable calendar file.
              </p>
            </div>
          </div>

          <div className={`mt-6 rounded-3xl border p-4 ${getStatusCardClasses(backendStatus.tone)}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em]">Local AI Status</p>
                <p className="mt-3 text-base font-semibold">{backendStatus.title}</p>
              </div>
              <button
                type="button"
                onClick={refreshBackendStatus}
                className="rounded-full border border-current/20 px-3 py-1 text-xs font-semibold transition hover:bg-white/40"
              >
                Refresh
              </button>
            </div>
            <p className="mt-3 text-sm leading-6">{backendStatus.message}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] opacity-70">Default model: {backendStatus.model}</p>
          </div>

          <div className="mt-6 rounded-3xl border border-pine/10 bg-white/75 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine/70">Quick Setup</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-ink/70">
              <p>1. Install and open Ollama.</p>
              <p>2. Run `ollama pull deepseek-r1:1.5b`.</p>
              <p>3. Run `npm run server` in this project.</p>
              <p>4. Run `npm run build` and `npm run preview -- --host 127.0.0.1`.</p>
            </div>
          </div>

          {selectedFile ? (
            <div className="mt-6 rounded-3xl border border-pine/10 bg-white/75 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine/70">Latest Upload</p>
              <p className="mt-3 text-base font-semibold text-ink">{selectedFile.name}</p>
              {events[0] ? (
                <p className="mt-2 text-sm text-ink/65">First detected date: {formatDateForDisplay(events[0].date)}</p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </section>

      {isProcessing ? (
        <section className="mt-6">
          <LoadingState />
        </section>
      ) : null}

      {errorMessage ? (
        <section className="mt-6 rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          {errorMessage}
        </section>
      ) : null}

      {statusMessage ? (
        <section className="mt-6 rounded-[28px] border border-pine/10 bg-white/80 px-5 py-4 text-sm text-ink/75 shadow-sm">
          {statusMessage}
        </section>
      ) : null}

      {hasReviewTable ? (
        <section className="mt-6">
          <ResultsTable
            events={events}
            onAddEvent={handleAddEvent}
            onDeleteEvent={handleDeleteEvent}
            onEventChange={handleEventChange}
            onExport={handleExport}
            onReset={handleResetEvents}
            canReset={extractedEventsSnapshot.length > 0}
          />
        </section>
      ) : null}
    </main>
  );
}

export default SyllabusTerminatorPage;
