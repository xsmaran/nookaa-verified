import { bus, EVENTS } from './event-bus';

/**
 * Printing abstraction.
 *
 * Three targets are anticipated: a thermal receipt printer, a dedicated QR
 * label printer, and an ordinary office printer. The POS only ever asks for a
 * *document* to be printed; the adapter decides how. Nothing here is bound to a
 * printer model — see /docs/14-printing.md for the device-agent design.
 *
 * STATUS: the BrowserPrintAdapter is real (it opens the OS print dialog). The
 * thermal and label adapters are declared but require the local print agent.
 */
export type PrintDocument =
  | {
      kind: 'CUP_LABEL';
      cupId: string;
      orderNumber: string;
      customerName: string;
      /** This cup's own drink — one label per physical cup, not per order. */
      drinkName: string;
      drinkDetail: string;
      /** "2 of 3" — which cup this is, out of how many the order needs. */
      sequenceLabel: string;
      placedAtDate: string;
      placedAtTime: string;
      qrDataUrl: string;
    }
  | { kind: 'RECEIPT'; html: string };

export type PrinterStatus = 'READY' | 'OFFLINE' | 'NO_PAPER' | 'UNKNOWN';

export interface PrintAdapter {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  status(): Promise<PrinterStatus>;
  print(doc: PrintDocument): Promise<{ ok: boolean; error?: string }>;
}

class BrowserPrintAdapter implements PrintAdapter {
  readonly id = 'browser';
  readonly label = 'System printer';
  readonly available = true;

  async status(): Promise<PrinterStatus> {
    return typeof window === 'undefined' ? 'UNKNOWN' : 'READY';
  }

  async print(doc: PrintDocument): Promise<{ ok: boolean; error?: string }> {
    if (typeof window === 'undefined') return { ok: false, error: 'No window to print from' };
    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) return { ok: false, error: 'The browser blocked the print window. Allow pop-ups for this site.' };
    win.document.write(doc.kind === 'RECEIPT' ? doc.html : cupLabelHtml(doc));
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
    return { ok: true };
  }
}

class AgentPrintAdapter implements PrintAdapter {
  constructor(
    readonly id: string,
    readonly label: string,
  ) {}
  readonly available = false;
  async status(): Promise<PrinterStatus> {
    return 'OFFLINE';
  }
  async print(): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: 'BACKEND REQUIRED — install the NOOKAA print agent on this device.' };
  }
}

function cupLabelHtml(doc: Extract<PrintDocument, { kind: 'CUP_LABEL' }>): string {
  // 50 mm × 40 mm label. Deliberately plain: it has to survive condensation.
  // One of these prints per physical cup — the drink is what identifies this
  // specific label among however many the order needs; the order number, date
  // and time are what tie it back to the ticket if a customer asks.
  return `<!doctype html><html><head><meta charset="utf-8"><title>${doc.cupId}</title>
  <style>
    @page { size: 50mm 40mm; margin: 0 }
    body { margin:0; font-family: ui-monospace, monospace; width:50mm; height:40mm; padding:2mm; box-sizing:border-box }
    .row { display:flex; gap:2mm; align-items:flex-start }
    img { width:17mm; height:17mm }
    .no { font-size:12pt; font-weight:700; letter-spacing:.5px }
    .seq { font-size:7pt; font-weight:700 }
    .name { font-size:9pt; margin-top:1mm }
    .cup { font-size:7pt; margin-top:1mm }
    .meta { font-size:6.5pt; margin-top:0.5mm; color:#333 }
    .drink { font-size:8pt; font-weight:700; margin-top:1.5mm; line-height:1.2; border-top:.3mm solid #000; padding-top:1mm }
    .detail { font-size:7pt; margin-top:0.5mm; line-height:1.2 }
  </style></head><body>
  <div class="row">
    <img src="${doc.qrDataUrl}" alt="" />
    <div>
      <div class="no">${doc.orderNumber.split('-').pop()} <span class="seq">${doc.sequenceLabel}</span></div>
      <div class="name">${doc.customerName}</div>
      <div class="cup">${doc.cupId}</div>
      <div class="meta">${doc.placedAtDate} · ${doc.placedAtTime}</div>
    </div>
  </div>
  <div class="drink">${doc.drinkName}</div>
  ${doc.drinkDetail ? `<div class="detail">${doc.drinkDetail}</div>` : ''}
  </body></html>`;
}

const ADAPTERS: PrintAdapter[] = [
  new BrowserPrintAdapter(),
  new AgentPrintAdapter('thermal', 'Thermal receipt printer'),
  new AgentPrintAdapter('label', 'QR label printer'),
];

export const PrintService = {
  adapters: ADAPTERS,
  activeId: 'browser',

  adapter(): PrintAdapter {
    return ADAPTERS.find((a) => a.id === this.activeId) ?? ADAPTERS[0];
  },

  async print(doc: PrintDocument): Promise<{ ok: boolean; error?: string }> {
    const result = await this.adapter().print(doc);
    bus.emit(EVENTS.PRINT, { doc, result });
    return result;
  },
};
