import { useRef, useState } from 'react';

function isPdfFile(file) {
  return file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
}

function formatFileSize(bytes) {
  if (!bytes) {
    return '0 KB';
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(0)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

function FileDropzone({ file, isProcessing, onFileSelected }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handlePickedFile = (pickedFile) => {
    if (!isPdfFile(pickedFile) || isProcessing) {
      return;
    }

    onFileSelected(pickedFile);
    setIsDragging(false);
  };

  const handleInputChange = (event) => {
    handlePickedFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    handlePickedFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget)) {
          return;
        }

        setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={`glass-panel relative overflow-hidden border-2 border-dashed p-8 transition duration-300 sm:p-10 ${
        isDragging
          ? 'border-pine bg-pine/5 shadow-glow'
          : 'border-pine/20 hover:border-pine/40 hover:bg-white/90'
      } ${isProcessing ? 'pointer-events-none opacity-70' : ''}`}
    >
      <div className="absolute inset-0 bg-aurora opacity-70" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-pine text-white shadow-lg shadow-pine/20">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M7 3.75h7.5L19 8.25v12a.75.75 0 0 1-.75.75h-10.5A.75.75 0 0 1 7 20.25v-16.5A.75.75 0 0 1 7.75 3h6.75" />
            <path d="M14 3v5.25h5.25" />
            <path d="M12 11.5v5" />
            <path d="M9.5 14 12 16.5 14.5 14" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-ink sm:text-3xl">Drop your syllabus PDF here</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70 sm:text-base">
          Upload a course syllabus and let the app pull out exams, assignments, quizzes, and deadlines for calendar export.
        </p>

        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-pine"
          >
            Choose PDF
          </button>
          <span className="text-sm text-ink/55">or drag and drop your file into this area</span>
        </div>

        <div className="mt-6 rounded-2xl border border-pine/10 bg-white/75 px-4 py-3 text-sm text-ink/70">
          Supports `.pdf` files. Recommended: text-based syllabi exported from LMS or department websites.
        </div>

        {file ? (
          <div className="mt-7 w-full max-w-xl rounded-2xl border border-pine/15 bg-white/85 px-4 py-4 text-left shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine/70">Current File</p>
                <p className="mt-2 truncate text-base font-semibold text-ink">{file.name}</p>
              </div>
              <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-pine">
                {formatFileSize(file.size)}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}

export default FileDropzone;
