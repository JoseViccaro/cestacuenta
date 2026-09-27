import { ShoppingSession } from '../entities/ShoppingSession.js';
import { CartItem } from '../entities/CartItem.js';

export const CSV_HEADER =
  'Fecha,Tienda,Código,Producto,Tipo,Cantidad,Precio Unitario (€),Descuento (€),Subtotal (€)';

/**
 * Escapes a single CSV field following RFC 4180:
 * - If the field contains comma, quote, or newline, it is enclosed in double quotes.
 * - Any double quote inside the field is escaped with another double quote ("").
 */
export function escapeCsvCell(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a CartItem into a CSV row given its parent session.
 */
function itemToCsvRow(session: ShoppingSession, item: CartItem): string {
  const startedAtDate =
    session.startedAt instanceof Date && !isNaN(session.startedAt.getTime())
      ? session.startedAt
      : new Date(session.startedAt);
  const dateStr = startedAtDate.toISOString();

  const storeName = session.storeName ?? '';
  const barcode = item.barcode ?? '';
  const name = item.name;
  const itemType = item.isBulk ? 'Granel' : 'Unidad';
  const quantity = item.quantity;
  const unitPrice = item.unitPrice.toDecimalString();
  const discount = item.discount.toDecimalString();
  const subtotal = item.subtotal().toDecimalString();

  const cells = [
    escapeCsvCell(dateStr),
    escapeCsvCell(storeName),
    escapeCsvCell(barcode),
    escapeCsvCell(name),
    escapeCsvCell(itemType),
    escapeCsvCell(quantity),
    escapeCsvCell(unitPrice),
    escapeCsvCell(discount),
    escapeCsvCell(subtotal),
  ];

  return cells.join(',');
}

/**
 * Exports a single ShoppingSession to CSV (RFC 4180).
 */
export function sessionToCsv(session: ShoppingSession): string {
  const rows: string[] = [CSV_HEADER];

  for (const item of session.items) {
    rows.push(itemToCsvRow(session, item));
  }

  return rows.join('\r\n');
}

/**
 * Exports multiple ShoppingSessions to CSV, listing all items in chronological order.
 */
export function historyToCsv(sessions: ShoppingSession[]): string {
  const rows: string[] = [CSV_HEADER];

  for (const session of sessions) {
    for (const item of session.items) {
      rows.push(itemToCsvRow(session, item));
    }
  }

  return rows.join('\r\n');
}

export interface SerializedExportItem {
  id: string;
  barcode?: string;
  name: string;
  quantity: number;
  isBulk: boolean;
  unitPriceCents: number;
  unitPriceDecimal: string;
  unitPriceFormatted: string;
  discountCents: number;
  discountDecimal: string;
  discountFormatted: string;
  subtotalCents: number;
  subtotalDecimal: string;
  subtotalFormatted: string;
}

export interface SerializedExportSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  storeName?: string;
  totalCents: number;
  totalDecimal: string;
  totalFormatted: string;
  totalItemCount: number;
  itemCount: number;
  items: SerializedExportItem[];
}

function sessionToExportObject(session: ShoppingSession): SerializedExportSession {
  const startedAtDate =
    session.startedAt instanceof Date && !isNaN(session.startedAt.getTime())
      ? session.startedAt
      : new Date(session.startedAt);

  const endedAtDate = session.endedAt
    ? session.endedAt instanceof Date && !isNaN(session.endedAt.getTime())
      ? session.endedAt
      : new Date(session.endedAt)
    : undefined;

  const total = session.total();

  return {
    id: session.id,
    startedAt: startedAtDate.toISOString(),
    endedAt: endedAtDate?.toISOString(),
    status: session.status,
    storeName: session.storeName,
    totalCents: total.cents,
    totalDecimal: total.toDecimalString(),
    totalFormatted: total.toFormattedString(),
    totalItemCount: session.totalItemCount(),
    itemCount: session.items.length,
    items: session.items.map((item) => ({
      id: item.id,
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      isBulk: item.isBulk,
      unitPriceCents: item.unitPrice.cents,
      unitPriceDecimal: item.unitPrice.toDecimalString(),
      unitPriceFormatted: item.unitPrice.toFormattedString(),
      discountCents: item.discount.cents,
      discountDecimal: item.discount.toDecimalString(),
      discountFormatted: item.discount.toFormattedString(),
      subtotalCents: item.subtotal().cents,
      subtotalDecimal: item.subtotal().toDecimalString(),
      subtotalFormatted: item.subtotal().toFormattedString(),
    })),
  };
}

/**
 * Exports a single ShoppingSession to formatted JSON string.
 */
export function sessionToJson(session: ShoppingSession): string {
  return JSON.stringify(sessionToExportObject(session), null, 2);
}

/**
 * Exports multiple ShoppingSessions to formatted JSON string.
 */
export function historyToJson(sessions: ShoppingSession[]): string {
  return JSON.stringify(sessions.map(sessionToExportObject), null, 2);
}

/**
 * Triggers a file download in the browser using Blob and an invisible <a> link.
 * Safe to call in non-browser environments (no-op).
 */
export function downloadBlob(
  content: string,
  filename: string,
  mimeType = 'text/csv;charset=utf-8;'
): void {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export const ExportService = {
  sessionToCsv,
  historyToCsv,
  sessionToJson,
  historyToJson,
  downloadBlob,
  escapeCsvCell,
  CSV_HEADER,
};
