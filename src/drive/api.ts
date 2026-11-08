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

// ---------- Arborescence : Kontrol / Sauvegardes, Kontrol / <chantier> / Photos ----------

export interface ElementDrive { id: string; name: string; mimeType: string; appProperties?: Record<string, string> }
type Proprietes = Record<string, string>;

const filtreProprietes = (p: Proprietes) =>
  Object.entries(p).map(([k, v]) => `appProperties has { key='${k}' and value='${v}' }`).join(' and ');

/** Contenu d'un dossier (toutes pages), éventuellement filtré (clause `q` supplémentaire). */
export async function listerDossier(jeton: string, parent: string, filtre = ''): Promise<ElementDrive[]> {
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false${filtre ? ` and ${filtre}` : ''}`);
  const sortie: ElementDrive[] = [];
  let page = '';
  do {
    const r = await appel<{ files: ElementDrive[]; nextPageToken?: string }>(jeton,
      `${API}/files?q=${q}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,appProperties)${page ? `&pageToken=${page}` : ''}`);
    sortie.push(...r.files);
    page = r.nextPageToken ?? '';
  } while (page);
  return sortie;
}

/**
 * Sous-dossier repéré par ses propriétés d'app (stable même si l'utilisateur le renomme côté app) ;
 * renommé si son nom a changé ; créé s'il n'existe pas (sauf `creer: false` → null).
 */
export async function sousDossier(jeton: string, parent: string, nom: string, cle: Proprietes, creer = true): Promise<string | null> {
  const [f] = await listerDossier(jeton, parent, `mimeType='${TYPE_DOSSIER}' and ${filtreProprietes(cle)}`);
  if (f) {
    if (f.name !== nom) await renommer(jeton, f.id, nom);
    return f.id;
  }
  if (!creer) return null;
  const cree = await appel<{ id: string }>(jeton, `${API}/files?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nom, mimeType: TYPE_DOSSIER, parents: [parent], appProperties: cle }),
  });
  return cree.id;
}

export const renommer = (jeton: string, id: string, nom: string) => appel<void>(jeton, `${API}/files/${id}?fields=id`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nom }),
});

/** Mise à la corbeille du Drive (récupérable 30 jours). */
export const corbeille = (jeton: string, id: string) => appel<void>(jeton, `${API}/files/${id}?fields=id`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
});

export const deplacer = (jeton: string, id: string, de: string, vers: string) =>
  appel<void>(jeton, `${API}/files/${id}?addParents=${vers}&removeParents=${de}&fields=id`, { method: 'PATCH' });

/**
 * Envoi d'un fichier : création (dans `parent`) ou remplacement du contenu d'un fichier existant (`id`),
 * en un seul appel (multipart) ; envoi reprenable au-delà de 4 Mo.
 */
export async function envoyer(jeton: string, o: { id?: string; parent: string; nom: string; type: string; blob: Blob; proprietes?: Proprietes }): Promise<string> {
  const meta: Record<string, unknown> = { name: o.nom, mimeType: o.type, ...(o.proprietes ? { appProperties: o.proprietes } : {}) };
  if (!o.id) meta.parents = [o.parent];
  const cible = `${UPLOAD}/files${o.id ? `/${o.id}` : ''}`;
  const methode = o.id ? 'PATCH' : 'POST';
  if (o.blob.size <= 4 * 1024 * 1024) {
    const limite = `kontrol-${Math.random().toString(36).slice(2)}`;
    const corps = new Blob([
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${limite}\r\nContent-Type: ${o.type}\r\n\r\n`, o.blob, `\r\n--${limite}--`,
    ]);
    const r = await appel<{ id: string }>(jeton, `${cible}?uploadType=multipart&fields=id`, {
      method: methode, headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: corps,
    });
    return r.id;
  }
  let r: Response;
  try {
    r = await fetch(`${cible}?uploadType=resumable&fields=id`, {
      method: methode,
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': o.type, 'X-Upload-Content-Length': String(o.blob.size) },
      body: JSON.stringify(meta),
    });
  } catch { throw new ErreurDrive('Réseau indisponible', 0); }
  if (!r.ok) throw new ErreurDrive(r.status === 401 ? 'Connexion Google expirée' : `Google Drive : envoi refusé (${r.status})`, r.status);
  const session = r.headers.get('location');
  if (!session) throw new ErreurDrive('Google Drive : session d’envoi absente', 500);
  const fin = await appel<{ id: string }>(jeton, session, { method: 'PUT', headers: { 'Content-Type': o.type }, body: o.blob });
  return fin.id;
}

/** Dossier « Sauvegardes » (ZIP de restauration) ; y range les sauvegardes déposées à la racine par les versions précédentes. */
export async function dossierSauvegardes(jeton: string, racine: string): Promise<string> {
  const id = (await sousDossier(jeton, racine, 'Sauvegardes', { kontrol: 'sauvegardes' }))!;
  const anciennes = await listerDossier(jeton, racine, `mimeType='application/zip'`);
  for (const f of anciennes) await deplacer(jeton, f.id, racine, id);
  return id;
}
