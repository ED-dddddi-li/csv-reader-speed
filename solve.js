// Fast CSV parser - drop-in replacement for csv-reader 1.0.0
// Optimized single-pass implementation with exact reference semantics

const COMMA_CODE = 44;      // ','
const QUOTE_CODE = 34;      // '"'
const LF_CODE = 10;         // '\n'
const CR_CODE = 13;         // '\r'
const BOM_CODE = 0xFEFF;    // U+FEFF

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0;
  let line = 1;

  // Drop BOM at start
  if (text.charCodeAt(0) === BOM_CODE) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  function addError(code, extraData) {
    const err = { code, line: recordLine, row: recordRow };
    if (extraData) Object.assign(err, extraData);
    errors.push(err);
  }

  // Read unquoted field - optimized with minimal allocations
  function readUnquoted(start) {
    let i = start;
    let valueStart = start;
    let parts = null; // Only allocate if we have stray CRs

    while (i < len) {
      const code = text.charCodeAt(i);

      if (code === COMMA_CODE) {
        const value = parts !== null ? parts + text.slice(valueStart, i) : text.slice(start, i);
        return { value, pos: i + 1, ended: 'comma', added: parts !== null ? value.length : i - start };
      }

      if (code === LF_CODE) {
        line++;
        const value = parts !== null ? parts + text.slice(valueStart, i) : text.slice(start, i);
        return { value, pos: i + 1, ended: 'line_break', added: parts !== null ? value.length : i - start };
      }

      if (code === CR_CODE) {
        if (i + 1 < len && text.charCodeAt(i + 1) === LF_CODE) {
          line++;
          const value = parts !== null ? parts + text.slice(valueStart, i) : text.slice(start, i);
          return { value, pos: i + 2, ended: 'line_break', added: parts !== null ? value.length : i - start };
        }
        // Stray CR - accumulate and skip
        addError('stray_cr');
        parts = (parts || '') + text.slice(valueStart, i);
        i++;
        valueStart = i;
        continue;
      }

      i++;
    }

    const value = parts !== null ? parts + text.slice(valueStart, i) : text.slice(start, i);
    return { value, pos: i, ended: 'end', added: parts !== null ? value.length : i - start };
  }

  // Read quoted field - optimized with array accumulation
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let parts = [];
    let valueStart = pos + 1;
    let i = pos + 1;

    while (i < len) {
      const code = text.charCodeAt(i);

      if (code === QUOTE_CODE) {
        if (i + 1 < len && text.charCodeAt(i + 1) === QUOTE_CODE) {
          // Escaped quote - save up to and including one quote
          parts.push(text.slice(valueStart, i + 1));
          i += 2;
          valueStart = i;
          continue;
        }
        // Closing quote found
        parts.push(text.slice(valueStart, i));
        const value = parts.length === 1 ? parts[0] : parts.join('');
        pos = i + 1;

        // Check what follows
        if (pos >= len) return { value, ended: 'end' };

        const nextCode = text.charCodeAt(pos);
        if (nextCode === COMMA_CODE) {
          pos++;
          return { value, ended: 'comma' };
        }
        if (nextCode === LF_CODE) {
          pos++;
          line++;
          return { value, ended: 'line_break' };
        }
        if (nextCode === CR_CODE && pos + 1 < len && text.charCodeAt(pos + 1) === LF_CODE) {
          pos += 2;
          line++;
          return { value, ended: 'line_break' };
        }

        // Quote junk
        const junk = readUnquoted(pos);
        pos = junk.pos;
        if (junk.added > 0) addError('quote_junk');
        return { value: value + junk.value, ended: junk.ended };
      }

      if (code === CR_CODE) {
        // CR inside quotes becomes LF
        parts.push(text.slice(valueStart, i));
        parts.push('\n');
        line++;
        const skip = i + 1 < len && text.charCodeAt(i + 1) === LF_CODE ? 2 : 1;
        i += skip;
        valueStart = i;
        continue;
      }

      if (code === LF_CODE) {
        line++;
      }

      i++;
    }

    // Unterminated quote
    pos = open + 1;
    line = openLine;
    addError('unterminated_quote');
    const result = readUnquoted(open + 1);
    pos = result.pos;
    return { value: '"' + result.value, ended: result.ended };
  }

  // Main parsing loop
  while (pos < len) {
    // Skip empty lines
    while (pos < len) {
      const code = text.charCodeAt(pos);
      if (code === LF_CODE) {
        pos++;
        line++;
      } else if (code === CR_CODE && pos + 1 < len && text.charCodeAt(pos + 1) === LF_CODE) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }

    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let quoted = false;
    let field;

    do {
      quoted = text.charCodeAt(pos) === QUOTE_CODE;
      if (quoted) {
        field = readQuoted(); // Updates pos internally
      } else {
        field = readUnquoted(pos);
        pos = field.pos; // Update pos from result
      }
      fields.push(field.value);
    } while (field.ended === 'comma');

    // Skip lines with only stray CRs
    if (fields.length === 1 && fields[0] === '' && !quoted) {
      continue;
    }

    if (width < 0) width = fields.length;

    if (header && columns === null) {
      columns = fields;
      continue;
    }

    // Handle short/long rows
    if (fields.length < width) {
      addError('short_row', { fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      const extra = fields.splice(width);
      addError('long_row', { extra });
    }

    rows.push(fields);
  }

  return {
    columns: header ? (columns ?? []) : null,
    rows,
    errors
  };
}
