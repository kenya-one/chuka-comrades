import type { User } from 'firebase/auth';

export const STUDY_LABS_API = import.meta.env.VITE_STUDY_LABS_API_URL || 'https://script.google.com/macros/s/AKfycbz5BsExPP61dy4qMCZ3oYJqYeKTkidFbQzSH0FAc4tyU6sFu05KL8SUlzjhnPwP3Kc/exec';

/** Every Notes / Past paper / Revision guide card uses this one image. Replace public/notes-cover.svg (or change this filename) to restyle all notes. */
export const NOTES_COVER = `${import.meta.env.BASE_URL}notes-cover.svg`;

export type StudyItem = Record<string, string | number | boolean | null | undefined>;
export type ApiResult<T = StudyItem> = { ok: boolean; items?: T[]; error?: string; [key: string]: unknown };

export function jsonp<T>(params: Record<string, string | number>): Promise<T> {
  return new Promise((resolve, reject) => {
    const callback = `studyLabsCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k,v]) => [k, String(v)])), callback });
    const cleanup = () => { delete (window as unknown as Record<string, unknown>)[callback]; script.remove(); };
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Study Labs server did not respond. Please try again.')); }, 15000);
    (window as unknown as Record<string, unknown>)[callback] = (data: T) => { window.clearTimeout(timeout); cleanup(); resolve(data); };
    script.onerror = () => { window.clearTimeout(timeout); cleanup(); reject(new Error('Could not connect to Study Labs. Check the Apps Script deployment access.')); };
    script.src = `${STUDY_LABS_API}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

export async function listStudyItems(table: string, q = '') {
  const result = await jsonp<ApiResult>({ action: 'list', table, limit: 50, ...(q ? { q } : {}) });
  if (!result.ok) throw new Error(result.error || 'Unable to load items.');
  return result.items || [];
}

export async function bootstrapStudyLabs() {
  const result = await jsonp<ApiResult>({ action: 'bootstrap' });
  if (!result.ok) throw new Error(result.error || 'Unable to connect to Study Labs.');
  return result;
}

export async function postStudyAction(user: User, payload: Record<string, unknown>) {
  const idToken = await user.getIdToken();
  const response = await fetch(STUDY_LABS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, idToken }),
  });
  if (!response.ok) throw new Error(`Study Labs request failed (${response.status}).`);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

export async function fileToBase64(file: File) {
  if (file.size > 12 * 1024 * 1024) throw new Error('Please choose a file smaller than 12 MB.');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsDataURL(file);
  });
}

/** Shrinks a cover image in the browser (max 900px wide, JPEG) so uploads stay small. */
export async function imageToBase64(file: File, maxWidth = 900) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Cover must be a JPG, PNG or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Cover image is too large.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process this image.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { base64: dataUrl.split(',')[1] || '', mime: 'image/jpeg' };
}

/** Opens the blank tab first so mobile browsers do not block the download link. */
export async function openDownload(getUrl: () => Promise<string>) {
  const tab = window.open('', '_blank');
  try { const url = await getUrl(); if (tab) tab.location.href = url; else window.location.href = url; }
  catch (e) { tab?.close(); throw e; }
}

export const shortDate = (v: unknown) => { const d = new Date(String(v || '')); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }); };
export const str = (item: StudyItem, ...keys: string[]) => { for (const key of keys) if (item[key] !== undefined && item[key] !== null && String(item[key])) return String(item[key]); return ''; };
