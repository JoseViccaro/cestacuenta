import { describe, it, expect, vi } from 'vitest';
import {
  ShoppingSession,
  Money,
  ExportService,
  sessionToCsv,
  historyToCsv,
  sessionToJson,
  historyToJson,
  escapeCsvCell,
  downloadBlob,
  CSV_HEADER,
} from '../../src/domain/index.js';

describe('ExportService', () => {
  describe('escapeCsvCell', () => {
    it('returns empty string for null and undefined', () => {
      expect(escapeCsvCell(null)).toBe('');
      expect(escapeCsvCell(undefined)).toBe('');
    });

    it('returns simple strings and numbers without quotes', () => {
      expect(escapeCsvCell('Leche')).toBe('Leche');
      expect(escapeCsvCell(42)).toBe('42');
      expect(escapeCsvCell('8410123456789')).toBe('8410123456789');
    });

    it('encloses values containing commas in double quotes', () => {
      expect(escapeCsvCell('Mercadona, S.A.')).toBe('"Mercadona, S.A."');
      expect(escapeCsvCell('1,45')).toBe('"1,45"');
    });

    it('escapes double quotes by doubling them according to RFC 4180', () => {
      expect(escapeCsvCell('Atún "Calvo"')).toBe('"Atún ""Calvo"""');
    });

    it('encloses values containing newlines in double quotes', () => {
      expect(escapeCsvCell('Línea 1\nLínea 2')).toBe('"Línea 1\nLínea 2"');
      expect(escapeCsvCell('Línea 1\r\nLínea 2')).toBe('"Línea 1\r\nLínea 2"');
    });

    it('handles values containing both quotes and commas', () => {
      expect(escapeCsvCell('Queso "Viejo", Reserva Especial')).toBe(
        '"Queso ""Viejo"", Reserva Especial"'
      );
    });
  });

  describe('sessionToCsv', () => {
    it('generates header-only CSV for an empty session', () => {
      const session = ShoppingSession.create({ storeName: 'Mercadona' });
      const csv = sessionToCsv(session);

      expect(csv).toBe(CSV_HEADER);
    });

    it('generates valid RFC 4180 CSV with monetary euro format and exact decimals', () => {
      const fixedDate = new Date('2026-09-27T15:30:00.000Z');
      const session = new ShoppingSession({
        id: 'sess-123',
        startedAt: fixedDate,
        storeName: 'Carrefour, Centro',
        status: 'ACTIVE',
      });

      // Item 1: standard packaged item
      session.addItem({
        name: 'Leche Entera 1L',
        barcode: '8410123456789',
        unitPrice: Money.fromCents(145), // 1,45 €
        quantity: 2,
        isBulk: false,
      });

      // Item 2: bulk item with special characters and quotes
      session.addItem({
        name: 'Manzanas "Fuji", Granel',
        unitPrice: Money.fromCents(280), // 2,80 €
        quantity: 1,
        isBulk: true,
      });

      // Item 3: item with line discount
      session.addItem({
        name: 'Pack Café',
        barcode: '8410987654321',
        unitPrice: Money.fromCents(450), // 4,50 €
        quantity: 1,
        isBulk: false,
        discount: Money.fromCents(50), // 0,50 € discount -> subtotal 4,00 €
      });

      const csv = sessionToCsv(session);
      const lines = csv.split('\r\n');

      expect(lines.length).toBe(4);
      expect(lines[0]).toBe(CSV_HEADER);

      // Verify line 1 (Leche Entera)
      // Columns: Fecha, Tienda, Código, Producto, Tipo, Cantidad, Precio Unitario (€), Descuento (€), Subtotal (€)
      const line1 = lines[1];
      expect(line1).toContain('2026-09-27T15:30:00.000Z');
      expect(line1).toContain('"Carrefour, Centro"');
      expect(line1).toContain('8410123456789');
      expect(line1).toContain('Leche Entera 1L');
      expect(line1).toContain('Unidad');
      expect(line1).toContain('2');
      expect(line1).toContain('"1,45"'); // Unit price
      expect(line1).toContain('"0,00"'); // Discount
      expect(line1).toContain('"2,90"'); // Subtotal: 1.45 * 2 = 2.90

      // Verify line 2 (Manzanas Fuji - Granel and escaped quotes/commas)
      const line2 = lines[2];
      expect(line2).toContain('"Manzanas ""Fuji"", Granel"');
      expect(line2).toContain('Granel');
      expect(line2).toContain('"2,80"');

      // Verify line 3 (Pack Café with discount)
      const line3 = lines[3];
      expect(line3).toContain('Pack Café');
      expect(line3).toContain('"4,50"');
      expect(line3).toContain('"0,50"'); // Discount
      expect(line3).toContain('"4,00"'); // Subtotal: 4.50 - 0.50 = 4.00
    });

    it('formats 0 cent values properly as "0,00"', () => {
      const session = ShoppingSession.create();
      session.addItem({
        name: 'Muestra Gratuita',
        unitPrice: Money.fromCents(0),
        quantity: 1,
      });

      const csv = sessionToCsv(session);
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain('"0,00"');
    });
  });

  describe('historyToCsv', () => {
    it('generates header-only CSV for empty sessions list', () => {
      const csv = historyToCsv([]);
      expect(csv).toBe(CSV_HEADER);
    });

    it('combines items from multiple sessions into one CSV breakdown', () => {
      const sessionA = new ShoppingSession({
        id: 'session-a',
        startedAt: new Date('2026-09-20T10:00:00.000Z'),
        storeName: 'Lidl',
      });
      sessionA.addItem({
        name: 'Pan de Molde',
        unitPrice: Money.fromCents(120),
        quantity: 1,
      });

      const sessionB = new ShoppingSession({
        id: 'session-b',
        startedAt: new Date('2026-09-27T18:00:00.000Z'),
        storeName: 'Dia',
      });
      sessionB.addItem({
        name: 'Yogur Natural',
        unitPrice: Money.fromCents(95),
        quantity: 4,
      });

      const csv = historyToCsv([sessionA, sessionB]);
      const lines = csv.split('\r\n');

      expect(lines.length).toBe(3);
      expect(lines[0]).toBe(CSV_HEADER);
      expect(lines[1]).toContain('Lidl');
      expect(lines[1]).toContain('Pan de Molde');
      expect(lines[1]).toContain('"1,20"');

      expect(lines[2]).toContain('Dia');
      expect(lines[2]).toContain('Yogur Natural');
      expect(lines[2]).toContain('"0,95"');
      expect(lines[2]).toContain('"3,80"'); // 0.95 * 4 = 3.80
    });
  });

  describe('sessionToJson and historyToJson', () => {
    it('produces valid JSON with exact monetary precision and item details', () => {
      const fixedDate = new Date('2026-09-27T12:00:00.000Z');
      const session = new ShoppingSession({
        id: 'test-json-session',
        startedAt: fixedDate,
        storeName: 'Mercadona',
        status: 'ACTIVE',
      });

      session.addItem({
        name: 'Aceite de Oliva 1L',
        barcode: '840000000001',
        unitPrice: Money.fromCents(895), // 8.95 €
        quantity: 2,
        isBulk: false,
      });

      const jsonString = sessionToJson(session);
      const parsed = JSON.parse(jsonString);

      expect(parsed.id).toBe('test-json-session');
      expect(parsed.storeName).toBe('Mercadona');
      expect(parsed.status).toBe('ACTIVE');
      expect(parsed.startedAt).toBe('2026-09-27T12:00:00.000Z');
      expect(parsed.totalCents).toBe(1790); // 895 * 2
      expect(parsed.totalDecimal).toBe('17,90');
      expect(parsed.totalFormatted).toBe('17,90 €');
      expect(parsed.totalItemCount).toBe(2);
      expect(parsed.items).toHaveLength(1);

      const item = parsed.items[0];
      expect(item.name).toBe('Aceite de Oliva 1L');
      expect(item.barcode).toBe('840000000001');
      expect(item.unitPriceCents).toBe(895);
      expect(item.unitPriceDecimal).toBe('8,95');
      expect(item.subtotalCents).toBe(1790);
      expect(item.subtotalDecimal).toBe('17,90');
    });

    it('historyToJson formats multiple sessions into a JSON array', () => {
      const session1 = ShoppingSession.create({ storeName: 'Tienda 1' });
      const session2 = ShoppingSession.create({ storeName: 'Tienda 2' });

      const jsonString = historyToJson([session1, session2]);
      const parsed = JSON.parse(jsonString);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].storeName).toBe('Tienda 1');
      expect(parsed[1].storeName).toBe('Tienda 2');
    });
  });

  describe('downloadBlob', () => {
    it('does not throw when executed in a non-browser environment', () => {
      expect(() => {
        downloadBlob('col1,col2\nval1,val2', 'test.csv', 'text/csv');
      }).not.toThrow();
    });

    it('creates object URL and triggers download click when browser globals are available', () => {
      const mockClick = vi.fn();
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();

      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;
      const originalURL = globalThis.URL;

      // Mock DOM environment
      const mockElement = {
        href: '',
        style: {},
        setAttribute: vi.fn(),
        click: mockClick,
      };

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: vi.fn().mockReturnValue(mockElement),
        body: {
          appendChild: mockAppendChild,
          removeChild: mockRemoveChild,
        },
      } as unknown as Document;

      globalThis.URL = {
        createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/test-uuid'),
        revokeObjectURL: vi.fn(),
      } as unknown as typeof URL;

      try {
        downloadBlob('col1,col2', 'export.csv', 'text/csv');

        expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
        expect(mockElement.setAttribute).toHaveBeenCalledWith('download', 'export.csv');
        expect(mockAppendChild).toHaveBeenCalledWith(mockElement);
        expect(mockClick).toHaveBeenCalled();
        expect(mockRemoveChild).toHaveBeenCalledWith(mockElement);
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
        globalThis.URL = originalURL;
      }
    });
  });

  describe('ExportService Object Export', () => {
    it('exposes all methods via ExportService object', () => {
      expect(typeof ExportService.sessionToCsv).toBe('function');
      expect(typeof ExportService.historyToCsv).toBe('function');
      expect(typeof ExportService.sessionToJson).toBe('function');
      expect(typeof ExportService.historyToJson).toBe('function');
      expect(typeof ExportService.downloadBlob).toBe('function');
      expect(typeof ExportService.escapeCsvCell).toBe('function');
      expect(ExportService.CSV_HEADER).toBe(CSV_HEADER);
    });
  });
});
