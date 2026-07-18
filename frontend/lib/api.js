export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getApiUrl(endpoint) {
  const isLocalBrowser = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  if (isLocalBrowser) return `/api${endpoint}`;

  const configured = API_URL.replace(/\/$/, '');
  const base = configured && !/^https?:\/\//i.test(configured) && !configured.startsWith('/')
    ? `https://${configured}`
    : configured;

  if (!base) return `/api${endpoint}`;
  return base.endsWith('/api') ? `${base}${endpoint}` : `${base}/api${endpoint}`;
}

export const fetchAPI = async (endpoint, options = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = getApiUrl(endpoint);

  const res = await fetch(url, {
    ...options,
    headers
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json()
    : { error: await res.text() || 'API request failed' };

  if (!res.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
};

export const api = {
  get: (endpoint) => fetchAPI(endpoint, { method: 'GET' }),
  post: (endpoint, body) => fetchAPI(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => fetchAPI(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => fetchAPI(endpoint, { method: 'DELETE' }),
  upload: (endpoint, formData) => fetchAPI(endpoint, { method: 'POST', body: formData })
};
