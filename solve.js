// Fast drop-in for csv-reader 1.0.0.
//
// The whole per-record parse lives in one module-level function, parseRecord(), so V8 tiers it
// up after a few hundred records instead of waiting for run() (called once per case) to be
// optimized. Each call loads the shared state into locals, parses one record, and writes it
// back; the hot field loops never touch a property.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

let mText = '';
let mN = 0;
let mPos = 0;
let mLine = 1;
let mErrors = null;
let mRows = null;
let mWidth = -1;
let mHeader = false;
let mColumns = null;

function parseRecord() {
  const text = mText;
  const n = mN;
  const errors = mErrors;
  const rows = mRows;
  const header = mHeader;
  const columns = mColumns;
  let pos = mPos;
  let line = mLine;
  const recordLine = line;
  const recordRow = header && columns === null ? null : rows.length;

  const fields = [];
  let quoted = false;
  let ended = END;

  field: for (;;) {
    let value;
    let mode; // 0 plain unquoted, 1 unterminated re-read, 2 junk, 3 already ended

    if (pos < n && text.charCodeAt(pos) === 34) {
      quoted = true;
      const open = pos;
      const openLine = line;
      let p = open + 1;
      let segStart = p;
      let acc = null;
      let closed = false;
      while (p < n) {
        const c = text.charCodeAt(p);
        if (c === 34) {
          if (p + 1 < n && text.charCodeAt(p + 1) === 34) {
            if (acc === null) acc = text.substring(segStart, p);
            else acc += text.substring(segStart, p);
            acc += '"';
            p += 2;
            segStart = p;
            continue;
          }
          closed = true;
          p += 1;
          break;
        }
        if (c === 13) {
          if (acc === null) acc = text.substring(segStart, p);
          else acc += text.substring(segStart, p);
          acc += '\n';
          line += 1;
          p += p + 1 < n && text.charCodeAt(p + 1) === 10 ? 2 : 1;
          segStart = p;
          continue;
        }
        if (c === 10) {
          line += 1;
          p += 1;
          continue;
        }
        p += 1;
      }
      if (!closed) {
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        value = '"';
        mode = 1;
      } else {
        value = acc === null ? text.substring(segStart, p - 1) : acc + text.substring(segStart, p - 1);
        if (p >= n) {
          pos = n;
          ended = END;
          mode = 3;
        } else {
          const c2 = text.charCodeAt(p);
          if (c2 === 44) {
            pos = p + 1;
            ended = COMMA;
            mode = 3;
          } else if (c2 === 10) {
            line += 1;
            pos = p + 1;
            ended = LINE_BREAK;
            mode = 3;
          } else if (c2 === 13 && p + 1 < n && text.charCodeAt(p + 1) === 10) {
            line += 1;
            pos = p + 2;
            ended = LINE_BREAK;
            mode = 3;
          } else {
            pos = p;
            mode = 2;
          }
        }
      }
    } else {
      quoted = false;
      value = '';
      mode = 0;
    }

    if (mode === 3) {
      fields.push(value);
      if (ended !== COMMA) break field;
      continue;
    }

    // Unquoted read from pos, appended to `value` (the prefix).
    let q = pos;
    let segStart = q;
    let acc = null;
    let atEnd = true;
    while (q < n) {
      const c = text.charCodeAt(q);
      if (c === 44) {
        ended = COMMA;
        pos = q + 1;
        atEnd = false;
        break;
      }
      if (c === 10) {
        line += 1;
        ended = LINE_BREAK;
        pos = q + 1;
        atEnd = false;
        break;
      }
      if (c === 13) {
        if (q + 1 < n && text.charCodeAt(q + 1) === 10) {
          line += 1;
          ended = LINE_BREAK;
          pos = q + 2;
          atEnd = false;
          break;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (acc === null) acc = text.substring(segStart, q);
        else acc += text.substring(segStart, q);
        q += 1;
        segStart = q;
        continue;
      }
      q += 1;
    }
    if (atEnd) {
      ended = END;
      pos = n;
    }
    const body = acc === null ? text.substring(segStart, q) : acc + text.substring(segStart, q);
    if (mode === 2) {
      if (body.length > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      fields.push(value + body);
    } else if (mode === 1) {
      fields.push('"' + body);
    } else {
      fields.push(body);
    }
    if (ended !== COMMA) break field;
  }

  mPos = pos;
  mLine = line;

  // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
  if (fields.length === 1 && fields[0] === '' && !quoted) return;

  let width = mWidth;
  if (width < 0) width = fields.length;
  if (header && columns === null) {
    mWidth = width;
    mColumns = fields;
    return;
  }
  if (fields.length < width) {
    errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
    while (fields.length < width) fields.push('');
  } else if (fields.length > width) {
    errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
  }
  mWidth = width;
  rows.push(fields);
}

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const n = text.length;
  const errors = [];
  const rows = [];
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  mText = text;
  mN = n;
  mErrors = errors;
  mRows = rows;
  mWidth = -1;
  mHeader = input.header === true;
  mColumns = null;
  mPos = pos;
  mLine = line;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;
    mPos = pos;
    mLine = line;
    parseRecord();
    pos = mPos;
    line = mLine;
  }

  return { columns: mHeader ? (mColumns ?? []) : null, rows, errors };
}

/**
 * Answers are identical whether or not this runs; it only warms V8 on short head and tail
 * slices of the cases so the first full parse is not spent in the interpreter.
 */
export function warmup(inputs) {
  const slices = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const text = String(input.text);
    if (text.length <= 20000) continue;
    const header = input.header === true;
    slices.push({ text: text.substring(0, 8000), header });
    slices.push({ text: text.substring(text.length - 8000), header });
  }
  for (let r = 0; r < 4; r++) for (let i = 0; i < slices.length; i++) run(slices[i]);
}
