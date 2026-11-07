// Appels REST Google Drive v3 (sans bibliothèque). Portée drive.file : l'app ne voit que ses propres fichiers.

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const NOM_DOSSIER = 'Kontrol';
const TYPE_DOSSIER = 'application/vnd.google-apps.folder';

export class ErreurDrive extends Error {
  constructor(message: string, public statut: number) { super(message); }
  get authentification() { return this.statut === 401; }
}

async function appel<T>(jeton: string, url: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${jeton}`, ...(init.headers ?? {}) } });
  } catch {
    throw new ErreurDrive('Réseau indisponible', 0);
  }
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json())?.error?.message ?? ''; } catch { /* corps vide */ }
    throw new ErreurDrive(r.status === 401 ? 'Connexion Google expirée' : `Google Drive : ${detail || r.statusText || r.status}`, r.status);
  }
  return (r.status === 204 ? undefined : r.headers.get('content-type')?.includes('json') ? await r.json() : await r.blob()) as T;
}

export interface FichierDrive { id: string; name: string; size?: string; createdTime: string }

export async function compte(jeton: string): Promise<{ email: string; nom: string }> {
  const r = await appel<{ user: { emailAddress: string; displayName: string } }>(jeton, `${API}/about?fields=user(emailAddress,displayName)`);
  return { email: r.user.emailAddress, nom: r.user.displayName };
}

/** Dossier « Kontrol » de l'app : celui mémorisé s'il existe encore, sinon retrouvé, sinon créé. */
export async function dossier(jeton: string, connu?: string): Promise<string> {
  if (connu) {
    try {
      const f = await appel<{ id: string; trashed: boolean }>(jeton, `${API}/files/${connu}?fields=id,trashed`);
      if (!f.trashed) return f.id;
    } catch (e) { if ((e as ErreurDrive).authentification) throw e; }
  }
  const q = encodeURIComponent(`name='${NOM_DOSSIER}' and mimeType='${TYPE_DOSSIER}' and trashed=false`);
  const liste = await appel<{ files: { id: string }[] }>(jeton, `${API}/files?q=${q}&fields=files(id)&spaces=drive`);
  if (liste.files[0]) return liste.files[0].id;
  const cree = await appel<{ id: string }>(jeton, `${API}/files?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: NOM_DOSSIER, mimeType: TYPE_DOSSIER }),
  });
  return cree.id;
}

/** Téléversement « reprenable » (session + envoi du fichier), avec progression. */
export async function televerser(jeton: string, parent: string, nom: string, blob: Blob, onProgres?: (x: number) => void): Promise<FichierDrive> {
  let r: Response;
  try {
    r = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=id,name,size,createdTime`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': blob.type || 'application/zip', 'X-Upload-Content-Length': String(blob.size),
      },
      body: JSON.stringify({ name: nom, parents: [parent], mimeType: 'application/zip' }),
    });
  } catch { throw new ErreurDrive('Réseau indisponible', 0); }
  if (!r.ok) throw new ErreurDrive(r.status === 401 ? 'Connexion Google expirée' : `Google Drive : envoi refusé (${r.status})`, r.status);
  const session = r.headers.get('location');
  if (!session) throw new ErreurDrive('Google Drive : session d’envoi absente', 500);

  // XMLHttpRequest pour suivre la progression de l'envoi (fetch ne la fournit pas)
  return new Promise((ok, ko) => {
    const x = new XMLHttpRequest();
    x.open('PUT', session);
    x.setRequestHeader('Content-Type', blob.type || 'application/zip');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgres?.(e.loaded / e.total); };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) ok(JSON.parse(x.responseText));
      else ko(new ErreurDrive(`Google Drive : envoi interrompu (${x.status})`, x.status));
    };
    x.onerror = () => ko(new ErreurDrive('Réseau interrompu pendant l’envoi', 0));
    x.send(blob);
  });
}

export async function lister(jeton: string, parent: string): Promise<FichierDrive[]> {
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false and mimeType='application/zip'`);
  const r = await appel<{ files: FichierDrive[] }>(jeton, `${API}/files?q=${q}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,size,createdTime)`);
  return r.files;
}

export const supprimer = (jeton: string, id: string) => appel<void>(jeton, `${API}/files/${id}`, { method: 'DELETE' });

export const telecharger = (jeton: string, id: string) => appel<Blob>(jeton, `${API}/files/${id}?alt=media`);
