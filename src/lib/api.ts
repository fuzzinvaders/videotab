export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || `Erreur ${res.status}`)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

export function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

/**
 * L'envoi d'un fichier : corps brut, nom en paramètre d'URL.
 *
 * Volontairement à côté de `request` plutôt que dedans : tout le reste de l'API échange du
 * JSON, et mélanger les deux obligerait chaque appel à dire de quoi il s'agit. Le suivi de
 * progression passe par XMLHttpRequest, seul moyen aujourd'hui de connaître l'avancement
 * d'un envoi — `fetch` ne le rapporte pas.
 */
export function envoyerFichier<T>(
  method: 'POST' | 'PUT',
  path: string,
  data: Blob | ArrayBuffer,
  onProgression?: (part: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, path, true)
    xhr.withCredentials = true
    xhr.responseType = 'text'

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgression?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      const body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T)
      reject(new ApiError(xhr.status, (body && body.error) || `Erreur ${xhr.status}`))
    }
    xhr.onerror = () => reject(new ApiError(0, 'Envoi interrompu.'))
    xhr.send(data as XMLHttpRequestBodyInit)
  })
}
