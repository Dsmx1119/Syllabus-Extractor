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
      row = {
        y,
        order: index,
        items: [],
      };

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

export async function extractTextFromPdf(file) {
  const [{ GlobalWorkerOptions, getDocument }, { default: pdfWorker }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);

  GlobalWorkerOptions.workerSrc = pdfWorker;

  const pdfData = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;

  try {
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageLines = groupTextItemsIntoLines(textContent.items);
      const pageText = [`[Page ${pageNumber}]`, ...pageLines].join('\n').trim();

      pages.push(pageText);
    }

    return pages.join('\n\n').trim();
  } finally {
    pdf.cleanup();
    await loadingTask.destroy();
  }
}
