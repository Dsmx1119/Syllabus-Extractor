const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787';

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return { error: await response.text() };
}

function buildRequestError(message, payload) {
  const error = new Error(message);
  error.payload = payload;
  return error;
}

export async function fetchLocalAiHealth() {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/health`);
  } catch {
    throw buildRequestError(
      `Could not reach the local AI server at ${API_BASE_URL}. Start it with npm run server.`,
    );
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    throw buildRequestError(payload.error || 'Unable to reach the local AI health endpoint.', payload);
  }

  return payload;
}

export async function extractEventsWithLocalModel(rawText, fileName) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/extract-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rawText,
        fileName,
      }),
    });
  } catch {
    throw buildRequestError(
      `Could not reach the local AI server at ${API_BASE_URL}. Start it with npm run server, then make sure Ollama is running.`,
    );
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    throw buildRequestError(payload.error || 'The local AI extraction request failed.', payload);
  }

  return payload;
}

export function getDefaultLocalModelName() {
  return 'deepseek-r1:1.5b';
}
