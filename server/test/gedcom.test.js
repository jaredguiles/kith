'use strict';

// node:test suite for GEDCOM parse (import/parsers/gedcom.js) + export
// (routes/export.js buildGedcom). Pure functions — no DB needed.
// Run: npm test

const test = require('node:test');
const assert = require('node:assert');

const gedcom = require('../import/parsers/gedcom');
const { buildGedcom } = require('../routes/export');

// --------------------------------------------------------------- fixtures
const SAMPLE = [
  '0 HEAD',
  '1 SOUR Ancestry.com',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME John Michael /Smith/',
  '2 GIVN John Michael',
  '2 SURN Smith',
  '2 NICK Johnny',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 15 APR 1950',
  '2 PLAC Austin, Texas, USA',
  '1 DEAT Y',
  '2 DATE 2 JAN 2020',
  '2 PLAC Dallas, Texas, USA',
  '1 OCCU Carpenter',
  '1 NOTE Loved fishing',
  '2 CONT and long walks.',
  '1 FAMS @F1@',
  '0 @I2@ INDI',
  '1 NAME Mary /Jones/',
  '2 TYPE maiden',
  '1 SEX F',
  '1 BIRT',
  '2 DATE ABT 1952',
  '1 FAMS @F1@',
  '0 @I3@ INDI',
  '1 NAME Sam /Smith/',
  '1 BIRT',
  '2 DATE 3 MAR 1980',
  '1 FAMC @F1@',
  '0 @I4@ INDI',
  '1 NAME Alex /Smith/',
  '1 FAMC @F1@',
  '2 PEDI adopted',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I3@',
  '1 CHIL @I4@',
  '0 TRLR',
].join('\r\n');

// ------------------------------------------------------------------ dates
test('parseGedcomDate handles GEDCOM shapes', () => {
  assert.equal(gedcom.parseGedcomDate('15 APR 1950'), '1950-04-15');
  assert.equal(gedcom.parseGedcomDate('2 JAN 2020'), '2020-01-02');
  assert.equal(gedcom.parseGedcomDate('ABT 1952'), null);       // partial → no fabrication
  assert.equal(gedcom.parseGedcomDate('BEF 12 DEC 1900'), '1900-12-12');
  assert.equal(gedcom.parseGedcomDate('1990-04-15'), '1990-04-15');
  assert.equal(gedcom.parseGedcomDate('APR 1950'), null);       // month+year only
  assert.equal(gedcom.parseGedcomDate('32 JAN 2000'), null);    // invalid day
  assert.equal(gedcom.parseGedcomDate(''), null);
});

test('parseGedcomName splits given/surname', () => {
  assert.deepEqual(gedcom.parseGedcomName('John /Smith/'), { given: 'John', surname: 'Smith', suffix: null });
  assert.deepEqual(gedcom.parseGedcomName('Mary Ann /O\'Neil/ Jr'), { given: 'Mary Ann', surname: "O'Neil", suffix: 'Jr' });
  assert.equal(gedcom.parseGedcomName('Cher').given, 'Cher');
  assert.equal(gedcom.parseGedcomName('Cher').surname, null);
});

// ------------------------------------------------------------------ parse
test('gedcom parse: INDI records → normalized records', () => {
  const { records, errors } = gedcom.parse(Buffer.from(SAMPLE));
  assert.equal(errors.length, 0);
  assert.equal(records.length, 4);

  const john = records.find((r) => r.source_id === '@I1@');
  assert.equal(john.first_name, 'John');
  assert.equal(john.middle_name, 'Michael');
  assert.equal(john.last_name, 'Smith');
  assert.equal(john.nickname, 'Johnny');
  assert.equal(john.sex, 'Male');
  assert.equal(john.birthday, '1950-04-15');
  assert.equal(john.place_of_birth, 'Austin, Texas, USA');
  assert.equal(john.is_deceased, true);
  assert.equal(john.date_of_death, '2020-01-02');
  assert.equal(john.place_of_death, 'Dallas, Texas, USA');
  assert.equal(john.occupation, 'Carpenter');
  assert.match(john.bio, /Loved fishing\nand long walks\./);

  const mary = records.find((r) => r.source_id === '@I2@');
  assert.equal(mary.sex, 'Female');
  assert.equal(mary.birthday, null); // ABT 1952 not fabricated
  assert.match(mary.bio || '', /Born ABT 1952/i);
  assert.ok(!mary.is_deceased);
});

test('gedcom parse: FAM units → relationship links', () => {
  const { records } = gedcom.parse(Buffer.from(SAMPLE));
  const john = records.find((r) => r.source_id === '@I1@');
  const sam = records.find((r) => r.source_id === '@I3@');
  const alex = records.find((r) => r.source_id === '@I4@');

  // spouse carried once on the first partner
  assert.deepEqual(john.relationships, [{ source_ref: '@I2@', relation_type: 'spouse' }]);

  // biological child: father/mother by parent sex
  const samTypes = Object.fromEntries(sam.relationships.map((r) => [r.source_ref, r.relation_type]));
  assert.equal(samTypes['@I1@'], 'father');
  assert.equal(samTypes['@I2@'], 'mother');

  // PEDI adopted → adoptive_parent regardless of sex
  const alexTypes = alex.relationships.map((r) => r.relation_type);
  assert.deepEqual(alexTypes, ['adoptive_parent', 'adoptive_parent']);
});

test('gedcom parse: rejects non-GEDCOM input', () => {
  const { records, errors } = gedcom.parse(Buffer.from('name,email\nBob,b@x.com\n'));
  assert.equal(records.length, 0);
  assert.ok(errors.length > 0);
});

// ----------------------------------------------------------------- export
const CONTACTS = [
  { id: 1, display_name: 'John Smith', first_name: 'John', middle_name: null, last_name: 'Smith', nickname: null, maiden_name: null, sex: 'Male', birthday: '1950-04-15', place_of_birth: 'Austin', is_deceased: 1, date_of_death: '2020-01-02', place_of_death: 'Dallas', occupation: 'Carpenter', bio: 'Line one\nLine two' },
  { id: 2, display_name: 'Mary Smith', first_name: 'Mary', last_name: 'Smith', maiden_name: 'Jones', sex: 'Female', birthday: null, is_deceased: 0 },
  { id: 3, display_name: 'Sam Smith', first_name: 'Sam', last_name: 'Smith', sex: null, birthday: '1980-03-03', is_deceased: 0 },
];
const RELS = [
  { contact_id: 1, related_contact_id: 2, relation_type: 'spouse' },
  { contact_id: 3, related_contact_id: 1, relation_type: 'father' },  // related IS contact's father
  { contact_id: 3, related_contact_id: 2, relation_type: 'mother' },
];

test('buildGedcom: INDI + derived FAM units', () => {
  const out = buildGedcom(CONTACTS, RELS);
  assert.match(out, /0 HEAD\r\n/);
  assert.match(out, /2 VERS 5\.5\.1/);
  assert.match(out, /0 @I1@ INDI/);
  assert.match(out, /1 NAME John \/Smith\//);
  assert.match(out, /1 SEX M/);
  assert.match(out, /2 DATE 15 APR 1950/);
  assert.match(out, /1 DEAT Y/);
  assert.match(out, /2 PLAC Dallas/);
  assert.match(out, /1 NOTE Line one\r\n2 CONT Line two/);
  // maiden name second NAME with TYPE
  assert.match(out, /1 NAME Mary \/Jones\/\r\n2 TYPE maiden/);
  // one FAM: John + Mary with child Sam
  assert.match(out, /0 @F1@ FAM/);
  assert.match(out, /1 HUSB @I1@/);
  assert.match(out, /1 WIFE @I2@/);
  assert.match(out, /1 CHIL @I3@/);
  assert.match(out, /1 FAMC @F1@/);
  assert.match(out, /0 TRLR\r\n$/);
  // couple + parent-pair merged into ONE family unit, not two
  assert.ok(!out.includes('@F2@'));
});

test('buildGedcom: adoptive pedigree + same-sex couple slots', () => {
  const contacts = [
    { id: 10, display_name: 'A', first_name: 'A', last_name: 'X', sex: 'Male', is_deceased: 0 },
    { id: 11, display_name: 'B', first_name: 'B', last_name: 'X', sex: 'Male', is_deceased: 0 },
    { id: 12, display_name: 'Kid', first_name: 'Kid', last_name: 'X', sex: null, is_deceased: 0 },
  ];
  const rels = [
    { contact_id: 10, related_contact_id: 11, relation_type: 'partner' },
    { contact_id: 12, related_contact_id: 10, relation_type: 'adoptive_parent' },
    { contact_id: 12, related_contact_id: 11, relation_type: 'adoptive_parent' },
  ];
  const out = buildGedcom(contacts, rels);
  // both partners exported (HUSB + WIFE slots reused for same-sex couples)
  assert.match(out, /1 HUSB @I1[01]@/);
  assert.match(out, /1 WIFE @I1[01]@/);
  assert.match(out, /1 FAMC @F1@\r\n2 PEDI adopted/);
});

// ------------------------------------------------------------- round trip
test('gedcom round trip: export → parse preserves structure', () => {
  const out = buildGedcom(CONTACTS, RELS);
  const { records, errors } = gedcom.parse(Buffer.from(out));
  assert.equal(errors.length, 0);
  assert.equal(records.length, 3);
  const john = records.find((r) => r.source_id === '@I1@');
  assert.equal(john.birthday, '1950-04-15');
  assert.equal(john.is_deceased, true);
  assert.equal(john.bio.includes('Line one\nLine two'), true);
  const sam = records.find((r) => r.source_id === '@I3@');
  const types = Object.fromEntries(sam.relationships.map((r) => [r.source_ref, r.relation_type]));
  assert.equal(types['@I1@'], 'father');
  assert.equal(types['@I2@'], 'mother');
});
