export type ServiceAccountLoadStatus =
  | 'ready'
  | 'missing'
  | 'invalid_json'
  | 'invalid_shape'
  | 'init_failed';

export interface ServiceAccountLoadResult {
  status: ServiceAccountLoadStatus;
  message: string;
  serviceAccount?: Record<string, unknown>;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function decodeBase64Json(raw: string): string | null {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
    return decoded || null;
  } catch {
    return null;
  }
}

export function loadServiceAccountFromEnv(): ServiceAccountLoadResult {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();

  if (!rawJson && !rawBase64) {
    return {
      status: 'missing',
      message:
        'Set FIREBASE_SERVICE_ACCOUNT_JSON (full JSON file) or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 in Netlify Functions env, then redeploy.',
    };
  }

  let parsed: Record<string, unknown> | null = null;

  if (rawJson) {
    parsed = tryParseJson(rawJson);
    if (!parsed) {
      return {
        status: 'invalid_json',
        message:
          'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON. Paste the entire downloaded service-account file, or use FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 instead.',
      };
    }
  } else if (rawBase64) {
    const decoded = decodeBase64Json(rawBase64);
    if (!decoded) {
      return {
        status: 'invalid_json',
        message: 'FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is set but could not be decoded.',
      };
    }
    parsed = tryParseJson(decoded);
    if (!parsed) {
      return {
        status: 'invalid_json',
        message:
          'FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 decoded successfully but the result is not valid JSON.',
      };
    }
  }

  const projectId = parsed?.project_id;
  const clientEmail = parsed?.client_email;
  const privateKey = parsed?.private_key;

  if (
    typeof projectId !== 'string' ||
    typeof clientEmail !== 'string' ||
    typeof privateKey !== 'string' ||
    !privateKey.includes('BEGIN PRIVATE KEY')
  ) {
    return {
      status: 'invalid_shape',
      message:
        'Service account JSON is missing project_id, client_email, or private_key. Paste the full Firebase key file — not just the private key alone.',
    };
  }

  return {
    status: 'ready',
    message: 'Firebase Admin service account loaded.',
    serviceAccount: parsed,
  };
}
