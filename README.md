# Syllabus Terminator

[English](./README.md) | [简体中文](./README.zh-CN.md)

Turn a course syllabus PDF into reviewable, calendar-ready deadlines.

Syllabus Terminator extracts important academic events such as assignments, quizzes, midterms, and exams from a syllabus PDF, lets users manually review and edit the results, and exports everything as an `.ics` file for Google Calendar or other calendar apps.

This repository is currently the local MVP of the project. The long-term goal is to turn it into a hosted web app where users do not need to install a local model.

## Current status

- Current milestone: `v0.1.0`
- Local MVP is working
- PDF text extraction is handled in the browser
- Event extraction uses a local Node backend plus Ollama
- Results can be manually edited before export
- Calendar export works via `.ics`

## Next Step
- Make this available for public so no local model needs to be implemented

## What it does

- Upload a syllabus PDF
- Extract raw text with `pdfjs-dist`
- Parse deadlines and assessments with a hybrid rule-based plus LLM pipeline
- Review and manually edit event name, date, and time
- Add or remove events before export
- Export the final result as an `.ics` calendar file

## Why this project exists

Course syllabi often contain important due dates, but those dates are buried in grading tables, weekly schedules, or long PDF documents. This project tries to reduce that friction by turning unstructured syllabus text into something students can actually use in their calendars.

## Tech stack

- React
- Vite
- Tailwind CSS
- `pdfjs-dist`
- `ics`
- Node.js backend
- Ollama for local model inference

## How it works

1. The user uploads a PDF in the browser.
2. The frontend extracts raw text from the PDF with `pdfjs-dist`.
3. The frontend sends extracted text to the backend.
4. The backend combines rule-based parsing with a local LLM call through Ollama.
5. The app returns structured events.
6. The user reviews and edits the extracted events.
7. The final reviewed events are exported as an `.ics` file.

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Install and start Ollama

Install Ollama from:

https://ollama.com/download

Then pull a model.

Default lightweight option:

```bash
ollama pull deepseek-r1:1.5b
```

Recommended stronger local option:

```bash
ollama pull qwen2.5:14b
```

### 3. Start the backend

Default model:

```bash
npm run server
```

Using a stronger model:

```bash
OLLAMA_MODEL=qwen2.5:14b npm run server
```

Windows PowerShell example:

```powershell
$env:OLLAMA_MODEL='qwen2.5:14b'
npm.cmd run server
```

### 4. Start the frontend

Development:

```bash
npm run dev
```

Or build and preview:

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

## Project structure

```text
src/
  components/       UI components
  pages/            page-level React views
  utils/            PDF extraction, API client, ICS export helpers

server/
  index.mjs         local extraction backend and parsing logic

scripts/
  debug_extract_pdf.mjs   PDF debugging utility for extraction tuning
```

## What is already working well

- Editable review flow before export
- Better handling of grading tables and weekly schedule patterns
- Expansion of recurring items such as weekly quizzes and assignments when the syllabus gives enough structure
- Practical extraction for real course PDFs tested during development

## Known limitations

- This version is still optimized for local use
- Users currently need Ollama and a local model installed
- Accuracy depends on syllabus formatting quality
- Scanned-image PDFs may still require OCR for better results
- The hosted web version is not finished yet

## Roadmap

- Hosted web deployment so end users do not need local models
- Better OCR support for scanned syllabi
- Stronger multi-model backend support
- Drag-and-drop event reordering
- Better validation and conflict detection before export
- Cleaner public landing page and demo experience

## Ideal use cases

- Students who want quick calendar import from a syllabus
- Class project demos
- Portfolio demonstration of PDF parsing + AI-assisted structuring
- Prototyping productivity tools for academic workflows

## Contributing

Issues, ideas, and feedback are welcome.

If you want to contribute, a good place to start is:

- improving extraction quality on more syllabus formats
- polishing the hosted deployment architecture
- improving the editing workflow
- adding tests and validation

## License

No license has been added yet.

If this repository is meant to be open for reuse or contribution, adding a license should be one of the next steps.
