/**
 * Курсорная пагинация личной галереи. Курсор — пара `createdAt|id`:
 * так порядок остаётся устойчивым даже при одинаковых датах.
 */

export const GALLERY_PAGE_SIZE = 24;

export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return `${cursor.createdAt}|${cursor.id}`;
}

export function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  const separator = value.indexOf("|");
  if (separator <= 0 || separator === value.length - 1) return null;
  return {
    createdAt: value.slice(0, separator),
    id: value.slice(separator + 1),
  };
}
