let csrfToken: string | null = null;

export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/csrf-token', {
    credentials: 'include',
  });
  const data = await response.json();
  const token: string = data.csrfToken;
  csrfToken = token;
  return token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function getCsrfHeaders(): Record<string, string> {
  return csrfToken ? { 'x-csrf-token': csrfToken } : {};
}
