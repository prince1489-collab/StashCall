import { inflate } from 'pako';

/**
 * Reads the text out of a PDF ticket or booking, on the phone, in plain
 * TypeScript: no native code, nothing uploaded.
 *
 * Airline and travel-site PDFs are made by software, so their words are
 * real text, not pictures of text. This handles what those generators use:
 * compressed streams (FlateDecode), objects packed into object streams,
 * fonts that map their codes to letters with a ToUnicode table (one or two
 * bytes per code), and positioned text, which is put back into lines from
 * top to bottom and left to right. A scanned PDF has no text to find; the
 * caller says so.
 */
export function pdfText(bytes: Uint8Array): string[] {
  const doc = parseObjects(bytes);
  const pages = [...doc.values()].filter((o) => /\/Type\s*\/Page\b/.test(o.dict));
  const out: string[] = [];
  for (const page of pages) {
    const lines = pageLines(doc, page);
    if (lines.length > 0) out.push(lines.join('\n'));
  }
  return out;
}

interface PdfObject {
  dict: string;
  /** Decoded stream content, if the object has a stream. */
  stream?: Uint8Array;
}

type Doc = Map<number, PdfObject>;

/** Bytes as a string, one character per byte. */
function latin1(b: Uint8Array, start = 0, end = b.length): string {
  let s = '';
  for (let i = start; i < end; i += 8192) s += String.fromCharCode(...b.subarray(i, Math.min(end, i + 8192)));
  return s;
}

function decodeStream(dict: string, raw: Uint8Array): Uint8Array | undefined {
  const filters = (/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)?.[1] ?? '').match(/\/\w+/g) ?? [];
  let data = raw;
  try {
    for (const f of filters) {
      if (f === '/FlateDecode' || f === '/Fl') data = inflate(data);
      else if (f === '/ASCII85Decode' || f === '/A85') data = ascii85(data);
      else if (f === '/ASCIIHexDecode' || f === '/AHx') data = asciiHex(data);
      // Images and the like: not text, skip.
      else return undefined;
    }
  } catch {
    return undefined;
  }
  return data;
}

function ascii85(b: Uint8Array): Uint8Array {
  const s = latin1(b).replace(/\s/g, '').replace(/^<~/, '').replace(/~>.*$/, '');
  const out: number[] = [];
  let group: number[] = [];
  const flush = (n: number) => {
    let v = 0;
    for (let k = 0; k < 5; k++) v = v * 85 + (group[k] ?? 84);
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n));
    group = [];
  };
  for (const ch of s) {
    if (ch === 'z' && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) flush(4);
  }
  if (group.length > 0) flush(group.length - 1);
  return new Uint8Array(out);
}

function asciiHex(b: Uint8Array): Uint8Array {
  const hex = latin1(b).replace(/[\s>].*$|\s/gs, '');
  const padded = hex.length % 2 ? `${hex}0` : hex;
  const out = new Uint8Array(padded.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function parseObjects(bytes: Uint8Array): Doc {
  const text = latin1(bytes);
  const doc: Doc = new Map();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const num = Number(m[1]);
    const start = m.index + m[0].length;
    const end = text.indexOf('endobj', start);
    if (end < 0) break;
    const body = text.slice(start, end);
    const s = body.indexOf('stream');
    if (s >= 0 && /^\s*<</.test(body)) {
      const dict = body.slice(0, s);
      let dataStart = start + s + 'stream'.length;
      if (text[dataStart] === '\r') dataStart++;
      if (text[dataStart] === '\n') dataStart++;
      const len = Number(/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict)?.[1]);
      const dataEnd = Number.isFinite(len) && len > 0 ? dataStart + len : text.lastIndexOf('endstream', end);
      doc.set(num, {
        dict,
        stream: decodeStream(dict, bytes.subarray(dataStart, dataEnd)),
      });
    } else {
      doc.set(num, { dict: body });
    }
    re.lastIndex = end;
  }
  // Objects packed inside object streams (PDF 1.5 and later).
  for (const o of [...doc.values()]) {
    if (!/\/Type\s*\/ObjStm\b/.test(o.dict) || !o.stream) continue;
    const n = Number(/\/N\s+(\d+)/.exec(o.dict)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(o.dict)?.[1] ?? 0);
    const s = latin1(o.stream);
    const nums = s.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = nums[i * 2];
      const from = first + nums[i * 2 + 1];
      const to = i + 1 < n ? first + nums[i * 2 + 3] : s.length;
      if (!doc.has(num)) doc.set(num, { dict: s.slice(from, to) });
    }
  }
  return doc;
}

/** Follows "12 0 R" to its object. */
function ref(doc: Doc, value: string | undefined): PdfObject | undefined {
  const m = value && /^\s*(\d+)\s+\d+\s+R/.exec(value);
  return m ? doc.get(Number(m[1])) : undefined;
}

/** The value after a key in a dictionary: a reference, a <<dictionary>>, an [array] or a token. */
function entry(dict: string, key: string): string | undefined {
  const i = dict.search(new RegExp(`/${key}(?![A-Za-z0-9])`));
  if (i < 0) return undefined;
  let j = i + key.length + 1;
  while (/\s/.test(dict[j] ?? '')) j++;
  if (dict.startsWith('<<', j)) return dict.slice(j, matchClose(dict, j, '<<', '>>'));
  if (dict[j] === '[') return dict.slice(j, matchClose(dict, j, '[', ']'));
  const r = /^\d+\s+\d+\s+R/.exec(dict.slice(j));
  if (r) return r[0];
  return /^[^\s/<>[\]]*|^\/[^\s/<>[\]]*/.exec(dict.slice(j))?.[0];
}

function matchClose(s: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s.startsWith(open, i)) {
      depth++;
      i += open.length - 1;
    } else if (s.startsWith(close, i)) {
      depth--;
      i += close.length - 1;
      if (depth === 0) return i + 1;
    }
  }
  return s.length;
}

/** A dictionary value, following a reference if it is one. */
function resolveDict(doc: Doc, value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().startsWith('<<') ? value : ref(doc, value)?.dict;
}

interface Font {
  /** Code → text, from the font's ToUnicode table. */
  map?: Map<number, string>;
  /** Bytes per character code: 2 for most embedded Unicode fonts. */
  bytes: 1 | 2;
  /** Glyph widths in thousandths of the font size, by code. */
  widths: Map<number, number>;
  /** Width of a code that isn't listed. */
  missing: number;
}

/** An array value, following a reference if it is one. */
function resolveArray(doc: Doc, value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().startsWith('[') ? value : ref(doc, value)?.dict.trim();
}

function loadFont(doc: Doc, fontDict: string): Font {
  const twoByte = /\/Subtype\s*\/Type0\b/.test(fontDict);
  const cmap = ref(doc, entry(fontDict, 'ToUnicode'))?.stream;
  const map = cmap ? parseCMap(latin1(cmap)) : undefined;
  const widths = new Map<number, number>();
  let missing = 500;
  if (twoByte) {
    // The widths live on the descendant CID font: /W [c [w w ...] c1 c2 w ...].
    const desc = resolveArray(doc, entry(fontDict, 'DescendantFonts'));
    const cid = resolveDict(doc, desc ? /\d+\s+\d+\s+R|<<[\s\S]*>>/.exec(desc)?.[0] : undefined) ?? '';
    missing = Number(entry(cid, 'DW') ?? 1000);
    const w = resolveArray(doc, entry(cid, 'W')) ?? '';
    const parts = w.slice(1, -1).match(/\[[^\]]*\]|[-\d.]+/g) ?? [];
    for (let i = 0; i < parts.length; ) {
      const c = Number(parts[i]);
      if (parts[i + 1]?.startsWith('[')) {
        parts[i + 1]
          .slice(1, -1)
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .forEach((x, k) => widths.set(c + k, Number(x)));
        i += 2;
      } else {
        const hi = Number(parts[i + 1]);
        const wd = Number(parts[i + 2]);
        for (let k = c; k <= hi && k - c < 0x10000; k++) widths.set(k, wd);
        i += 3;
      }
    }
  } else {
    const first = Number(entry(fontDict, 'FirstChar') ?? 0);
    const list = resolveArray(doc, entry(fontDict, 'Widths'))?.match(/[-\d.]+/g) ?? [];
    list.forEach((x, k) => widths.set(first + k, Number(x)));
    const avg = list.length
      ? list
          .map(Number)
          .filter((x) => x > 0)
          .reduce((a, b) => a + b, 0) / list.filter((x) => Number(x) > 0).length
      : 500;
    missing = Number.isFinite(avg) ? avg : 500;
  }
  return { map, bytes: twoByte ? 2 : 1, widths, missing };
}

function utf16(hex: string): string {
  let s = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  if (hex.length === 2) s = String.fromCharCode(parseInt(hex, 16));
  return s;
}

export function parseCMap(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of text.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const m of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(m[1], 16), utf16(m[2]));
  }
  for (const block of text.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const m of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (hi - lo > 0xffff) continue;
      if (m[3].startsWith('[')) {
        const list = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => utf16(x[1]));
        list.forEach((t, k) => map.set(lo + k, t));
      } else {
        const dst = m[3].slice(1, -1);
        const head = dst.slice(0, -4);
        const tail = parseInt(dst.slice(-4) || '0', 16);
        for (let c = lo; c <= hi; c++) map.set(c, utf16(head) + String.fromCharCode(tail + (c - lo)));
      }
    }
  }
  return map;
}

/** WinAnsi codes that differ from Latin-1. */
const WIN_ANSI: Record<number, string> = {
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x80: '€',
};

/** The text of a string, and how far it moves along, in thousandths of the font size. */
function decodeText(raw: string, font: Font | undefined): { text: string; advance: number; spaces: number } {
  if (!font)
    return {
      text: raw,
      advance: raw.length * 500,
      spaces: (raw.match(/ /g) ?? []).length,
    };
  let text = '';
  let advance = 0;
  let spaces = 0;
  const step = font.bytes;
  for (let i = 0; i + step <= raw.length; i += step) {
    const code = step === 2 ? (raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1) : raw.charCodeAt(i);
    const t = font.map?.get(code);
    text += t ?? (step === 1 ? (WIN_ANSI[code] ?? String.fromCharCode(code)) : '');
    advance += font.widths.get(code) ?? font.missing;
    if (step === 1 && code === 32) spaces++;
  }
  return { text, advance, spaces };
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

interface Piece {
  x: number;
  y: number;
  /** Where the piece ends, to tell "QP" "1111" (one word) from "QP" "1111" (two). */
  end: number;
  size: number;
  text: string;
}

/** Splits a content stream into operands and operators. */
function* tokens(s: string): Generator<{
  op?: string;
  value?: string;
  kind?: 'str' | 'hex' | 'num' | 'name' | 'arr';
}> {
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '%') {
      while (i < n && s[i] !== '\n' && s[i] !== '\r') i++;
    } else if (c === '(') {
      let depth = 1;
      let out = '';
      i++;
      while (i < n && depth > 0) {
        const ch = s[i];
        if (ch === '\\') {
          const nx = s[i + 1];
          const esc: Record<string, string> = {
            n: '\n',
            r: '\r',
            t: '\t',
            b: '\b',
            f: '\f',
            '(': '(',
            ')': ')',
            '\\': '\\',
          };
          if (nx in esc) {
            out += esc[nx];
            i += 2;
          } else if (/[0-7]/.test(nx)) {
            const oct = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4))![0];
            out += String.fromCharCode(parseInt(oct, 8));
            i += 1 + oct.length;
          } else if (nx === '\r' || nx === '\n') {
            i += nx === '\r' && s[i + 2] === '\n' ? 3 : 2;
          } else {
            out += nx ?? '';
            i += 2;
          }
          continue;
        }
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (depth > 0) out += ch;
        i++;
      }
      yield { value: out, kind: 'str' };
    } else if (c === '<' && s[i + 1] === '<') {
      const end = matchClose(s, i, '<<', '>>');
      i = end;
    } else if (c === '<') {
      const end = s.indexOf('>', i);
      const hex = s.slice(i + 1, end < 0 ? n : end).replace(/\s/g, '');
      const padded = hex.length % 2 ? `${hex}0` : hex;
      let out = '';
      for (let k = 0; k < padded.length; k += 2) out += String.fromCharCode(parseInt(padded.slice(k, k + 2), 16));
      yield { value: out, kind: 'hex' };
      i = end < 0 ? n : end + 1;
    } else if (c === '[') {
      yield { op: '[' };
      i++;
    } else if (c === ']') {
      yield { op: ']' };
      i++;
    } else if (c === '/') {
      const m = /^\/[^\s/<>[\]()%]*/.exec(s.slice(i, i + 128))![0];
      yield { value: m.slice(1), kind: 'name' };
      i += m.length;
    } else if (/[-+.\d]/.test(c)) {
      const m = /^[-+]?(\d+\.?\d*|\.\d+)/.exec(s.slice(i, i + 32));
      if (!m) {
        i++;
        continue;
      }
      yield { value: m[0], kind: 'num' };
      i += m[0].length;
    } else {
      const m = /^[^\s/<>[\]()%]+/.exec(s.slice(i, i + 32));
      if (!m) {
        i++;
        continue;
      }
      // Inline images carry binary data up to "EI": skip it.
      if (m[0] === 'ID') {
        const end = s.indexOf('EI', i + 2);
        i = end < 0 ? n : end + 2;
        continue;
      }
      yield { op: m[0] };
      i += m[0].length;
    }
  }
}

function pageLines(doc: Doc, page: PdfObject): string[] {
  const resources = resolveDict(doc, entry(page.dict, 'Resources')) ?? '';
  const fontsDict = resolveDict(doc, entry(resources, 'Font')) ?? '';
  const fonts = new Map<string, Font>();
  for (const m of fontsDict.matchAll(/\/([^\s/<>[\]]+)\s+(\d+\s+\d+\s+R)/g)) {
    const f = ref(doc, m[2]);
    if (f) fonts.set(m[1], loadFont(doc, f.dict));
  }

  const contents = entry(page.dict, 'Contents') ?? '';
  const streams = [...contents.matchAll(/(\d+)\s+\d+\s+R/g)]
    .map((m) => doc.get(Number(m[1])))
    .flatMap((o) => (o?.stream ? [latin1(o.stream)] : []));
  const pieces: Piece[] = [];

  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let font: Font | undefined;
  let size = 10;
  let leading = 0;
  let charSpacing = 0;
  let wordSpacing = 0;
  let hscale = 1;
  let operands: { value?: string; kind?: string }[] = [];
  let array: { value?: string; kind?: string }[] | null = null;

  const show = (parts: { value?: string; kind?: string }[]) => {
    // Each string is its own piece, placed where it really starts, so gaps
    // between words and columns can be measured.
    for (const p of parts) {
      if (p.kind === 'num') {
        tm = mul([1, 0, 0, 1, (-Number(p.value) / 1000) * size * hscale, 0], tm);
        continue;
      }
      if (p.value === undefined) continue;
      const d = decodeText(p.value, font);
      const tx = ((d.advance / 1000) * size + charSpacing * (p.value.length / (font?.bytes ?? 1)) + wordSpacing * d.spaces) * hscale;
      const m = mul(tm, ctm);
      const after = mul(mul([1, 0, 0, 1, tx, 0], tm), ctm);
      const scale = Math.hypot(m[2], m[3]) || 1;
      if (d.text)
        pieces.push({
          x: m[4],
          y: m[5],
          end: after[4],
          size: size * scale,
          text: d.text,
        });
      tm = mul([1, 0, 0, 1, tx, 0], tm);
    }
  };
  const num = (k: number) => Number(operands[operands.length - k]?.value ?? 0);
  const nextLine = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };

  for (const content of streams) {
    for (const t of tokens(content)) {
      if (t.op === '[') {
        array = [];
        continue;
      }
      if (t.op === ']') {
        operands.push({ kind: 'arr' });
        (operands[operands.length - 1] as { parts?: typeof array }).parts = array;
        array = null;
        continue;
      }
      if (!t.op) {
        (array ?? operands).push(t);
        continue;
      }
      switch (t.op) {
        case 'q':
          stack.push(ctm);
          break;
        case 'Q':
          ctm = stack.pop() ?? IDENTITY;
          break;
        case 'cm':
          ctm = mul([num(6), num(5), num(4), num(3), num(2), num(1)], ctm);
          break;
        case 'BT':
          tm = tlm = IDENTITY;
          break;
        case 'Tf':
          font = fonts.get(operands[operands.length - 2]?.value ?? '');
          size = num(1) || size;
          break;
        case 'TL':
          leading = num(1);
          break;
        case 'Tc':
          charSpacing = num(1);
          break;
        case 'Tw':
          wordSpacing = num(1);
          break;
        case 'Tz':
          hscale = num(1) / 100;
          break;
        case 'Td':
          nextLine(num(2), num(1));
          break;
        case 'TD':
          leading = -num(1);
          nextLine(num(2), num(1));
          break;
        case 'Tm':
          tlm = tm = [num(6), num(5), num(4), num(3), num(2), num(1)];
          break;
        case 'T*':
          nextLine(0, -leading);
          break;
        case 'Tj':
          show(operands.slice(-1));
          break;
        case "'":
          nextLine(0, -leading);
          show(operands.slice(-1));
          break;
        case '"':
          wordSpacing = num(3);
          charSpacing = num(2);
          nextLine(0, -leading);
          show(operands.slice(-1));
          break;
        case 'TJ': {
          const last = operands[operands.length - 1] as {
            parts?: { value?: string; kind?: string }[];
          };
          show(last?.parts ?? []);
          break;
        }
      }
      operands = [];
    }
  }
  return toLines(pieces);
}

/** Pieces of text back into lines: top to bottom, then left to right. */
function toLines(pieces: Piece[]): string[] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Piece[][] = [];
  for (const p of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - p.y) <= Math.max(2, r[0].size * 0.35));
    if (row) row.push(p);
    else rows.push([p]);
  }
  rows.sort((a, b) => b[0].y - a[0].y);
  return rows
    .map((row) => {
      row.sort((a, b) => a.x - b.x);
      let line = '';
      let end = -Infinity;
      for (const p of row) {
        const gap = p.x - end;
        // A gap wider than a fifth of the letter size is a space.
        if (line && !line.endsWith(' ') && !p.text.startsWith(' ') && gap > p.size * 0.2) line += ' ';
        line += p.text;
        end = Math.max(end, p.end);
      }
      return line.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}
