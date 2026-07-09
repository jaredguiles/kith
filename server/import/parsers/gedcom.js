'use strict';

// GEDCOM 5.5.1 parser → Normalized Import Format records + family links.
//
// GEDCOM is line-based: `LEVEL [@XREF@] TAG [VALUE]`. Two record types matter:
// INDI (person) and FAM (family unit: partners + children). We emit one
// normalized record per INDI (source_id = the @Ixx@ xref) and attach a
// `relationships` array of { source_ref, relation_type } describing the OTHER
// person relative to this record (matching contact_relationships semantics:
// type describes related_contact relative to contact). Child records carry
// their parent links (father/mother/parent/adoptive_parent/foster_parent);
// one partner of each couple carries the spouse link.
//
// Hand-rolled like the other parsers (no new npm dep) — the grammar subset we
// need (INDI/FAM/NAME/SEX/BIRT/DEAT/OCCU/RELI/NATI/NOTE/EMAIL/PHON/FAMC/FAMS/
// HUSB/WIFE/CHIL/PEDI + CONT/CONC) is small and stable since 1999.

const { makeRecord, cleanStr, normalizeEmail, normalizePhone } = require('../normalizer');

const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** GEDCOM date → 'YYYY-MM-DD' when fully specified, else null.
 * Qualifiers (ABT/EST/CAL/BEF/AFT/FROM/TO/BET..AND) are stripped first;
 * partial dates (year, month+year) are NOT fabricated into full dates. */
function parseGedcomDate(v) {
  if (!v) return null;
  let s = String(v).toUpperCase().trim()
    .replace(/^(ABT|EST|CAL|BEF|AFT|FROM|TO|INT)\.?\s+/, '')
    .replace(/\s+BET\s+.*$/, '').replace(/^BET\s+/, '').replace(/\s+AND\s+.*$/, '')
    .trim();
  // 15 APR 1990
  let m = s.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{3,4})$/);
  if (m && MONTHS[m[2]]) {
    const day = Number(m[1]), mo = Number(MONTHS[m[2]]);
    if (day >= 1 && day <= 31) {
      return `${String(m[3]).padStart(4, '0')}-${MONTHS[m[2]]}-${String(day).padStart(2, '0')}`;
    }
  }
  // ISO already
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  return null;
}

/** Extract the year (for note-keeping on partial dates). */
function gedcomDateYear(v) {
  const m = String(v || '').match(/(\d{4})/);
  return m ? m[1] : null;
}

/** 'John /Smith/ Jr' → { given, surname, suffix } */
function parseGedcomName(v) {
  const s = cleanStr(v) || '';
  const m = s.match(/^([^/]*)\/([^/]*)\/(.*)$/);
  if (!m) return { given: s || null, surname: null, suffix: null };
  return {
    given: cleanStr(m[1]),
    surname: cleanStr(m[2]),
    suffix: cleanStr(m[3]),
  };
}

// ------------------------------------------------------------ line parsing
/** text → array of { level, xref, tag, value } (CONC/CONT folded into value). */
function parseLines(text) {
  const raw = String(text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const lines = [];
  const errors = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (!line.trim()) continue;
    const m = line.match(/^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
    if (!m) {
      if (errors.length < 20) errors.push(`Line ${i + 1}: unparseable — "${line.slice(0, 60)}"`);
      continue;
    }
    const level = Number(m[1]);
    const tag = m[3].toUpperCase();
    const value = m[4] ?? '';
    // continuation lines extend the PREVIOUS line's value
    if ((tag === 'CONT' || tag === 'CONC') && lines.length) {
      const prev = lines[lines.length - 1];
      prev.value = (prev.value || '') + (tag === 'CONT' ? '\n' : '') + value;
      continue;
    }
    lines.push({ level, xref: m[2] || null, tag, value });
  }
  return { lines, errors };
}

/** lines → nested node tree: { tag, xref, value, children[] } roots at level 0. */
function buildTree(lines) {
  const roots = [];
  const stack = [];
  for (const ln of lines) {
    const node = { ...ln, children: [] };
    while (stack.length > ln.level) stack.pop();
    if (ln.level === 0) roots.push(node);
    else if (stack[ln.level - 1]) stack[ln.level - 1].children.push(node);
    stack[ln.level] = node;
  }
  return roots;
}

const child = (node, tag) => node.children.find((c) => c.tag === tag);
const kids = (node, tag) => node.children.filter((c) => c.tag === tag);
const val = (node, tag) => cleanStr(child(node, tag)?.value);

// ------------------------------------------------------------ INDI → record
const SEX_MAP = { M: 'Male', F: 'Female', X: 'Intersex' };

function indiToPartial(node) {
  const partial = { source_id: node.xref, relationships: [], _fams: [], _famc: [] };
  const bioFacts = [];

  // names: first NAME = primary; NAME with TYPE maiden/birth → maiden_name
  const names = kids(node, 'NAME');
  if (names.length) {
    const primary = names[0];
    const parsed = parseGedcomName(primary.value);
    partial.first_name = val(primary, 'GIVN') || parsed.given;
    partial.last_name = val(primary, 'SURN') || parsed.surname;
    partial.nickname = val(primary, 'NICK') || null;
    // split multi-word given into first + middle
    if (partial.first_name && partial.first_name.includes(' ')) {
      const parts = partial.first_name.split(' ');
      partial.first_name = parts[0];
      partial.middle_name = parts.slice(1).join(' ');
    }
    for (const n of names.slice(1)) {
      const type = (val(n, 'TYPE') || '').toLowerCase();
      if (type === 'maiden' || type === 'birth') {
        partial.maiden_name = parseGedcomName(n.value).surname;
      }
    }
  }

  const sex = val(node, 'SEX');
  if (sex && SEX_MAP[sex.toUpperCase()]) partial.sex = SEX_MAP[sex.toUpperCase()];

  const birt = child(node, 'BIRT');
  if (birt) {
    const rawDate = val(birt, 'DATE');
    partial.birthday = parseGedcomDate(rawDate);
    partial.place_of_birth = val(birt, 'PLAC');
    if (!partial.birthday && rawDate) bioFacts.push(`Born ${rawDate}`);
  }

  const deat = child(node, 'DEAT');
  if (deat) {
    partial.is_deceased = true;
    const rawDate = val(deat, 'DATE');
    partial.date_of_death = parseGedcomDate(rawDate);
    partial.place_of_death = val(deat, 'PLAC');
    if (!partial.date_of_death && rawDate) bioFacts.push(`Died ${rawDate}`);
  }

  partial.occupation = val(node, 'OCCU');
  partial.religion = val(node, 'RELI');
  partial.nationality = val(node, 'NATI');

  // NOTE values keep their CONT newlines — cleanStr would collapse them
  const tidyNote = (v) => {
    const s = String(v ?? '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').trim();
    return s || null;
  };
  const notes = kids(node, 'NOTE').map((n) => tidyNote(n.value)).filter(Boolean);
  const bio = [...notes, ...bioFacts].join('\n');
  if (bio) partial.bio = bio;

  const email = normalizeEmail(val(node, 'EMAIL') || val(node, '_EMAIL') || val(node, 'EMAI'));
  if (email) partial.emails = [{ label: 'personal', email }];
  const phone = normalizePhone(val(node, 'PHON'));
  if (phone) partial.phones = [{ label: 'home', phone }];

  // family links resolved after all FAMs are read
  for (const f of kids(node, 'FAMS')) partial._fams.push(cleanStr(f.value));
  for (const f of kids(node, 'FAMC')) {
    partial._famc.push({
      fam: cleanStr(f.value),
      pedigree: (val(f, 'PEDI') || '').toLowerCase(), // birth|adopted|foster|step...
    });
  }
  return partial;
}

// ---------------------------------------------------------------- parse()
function parse(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  const { lines, errors } = parseLines(text);
  if (!lines.some((l) => l.tag === 'INDI' || (l.tag === 'HEAD' && l.level === 0))) {
    return { records: [], errors: ['Not a GEDCOM file (no HEAD/INDI records found)'] };
  }
  const roots = buildTree(lines);

  const indis = new Map(); // xref → partial
  const fams = new Map();  // xref → { partners: [xref], children: [xref], }

  for (const node of roots) {
    if (node.tag === 'INDI' && node.xref) {
      indis.set(node.xref, indiToPartial(node));
    } else if (node.tag === 'FAM' && node.xref) {
      const partners = [
        ...kids(node, 'HUSB').map((h) => cleanStr(h.value)),
        ...kids(node, 'WIFE').map((w) => cleanStr(w.value)),
      ].filter(Boolean);
      const children = kids(node, 'CHIL').map((c) => cleanStr(c.value)).filter(Boolean);
      fams.set(node.xref, { partners, children });
    }
  }

  // ---- derive relationship links (attached to the child / first partner)
  const parentType = (parentPartial, pedigree) => {
    if (pedigree === 'adopted') return 'adoptive_parent';
    if (pedigree === 'foster') return 'foster_parent';
    if (pedigree === 'step') return 'step_parent';
    if (parentPartial?.sex === 'Male') return 'father';
    if (parentPartial?.sex === 'Female') return 'mother';
    return 'parent';
  };

  for (const [famRef, fam] of fams) {
    // spouse edge carried once, on the first partner
    if (fam.partners.length >= 2) {
      const a = indis.get(fam.partners[0]);
      for (const other of fam.partners.slice(1)) {
        if (a && indis.has(other)) {
          a.relationships.push({ source_ref: other, relation_type: 'spouse' });
        }
      }
    }
    // parent edges on each child: related (the parent) IS the child's parent
    for (const childRef of fam.children) {
      const childPartial = indis.get(childRef);
      if (!childPartial) continue;
      const pedigree = (childPartial._famc.find((fc) => fc.fam === famRef)?.pedigree) || '';
      for (const parentRef of fam.partners) {
        const parentPartial = indis.get(parentRef);
        if (!parentPartial) continue;
        childPartial.relationships.push({
          source_ref: parentRef,
          relation_type: parentType(parentPartial, pedigree),
        });
      }
    }
  }

  const records = [];
  for (const partial of indis.values()) {
    delete partial._fams;
    delete partial._famc;
    records.push(makeRecord(partial));
  }
  if (!records.length) errors.push('GEDCOM file contains no INDI records');
  return { records, errors };
}

module.exports = { parse, extensions: ['.ged'], parseGedcomDate, parseGedcomName, gedcomDateYear };
