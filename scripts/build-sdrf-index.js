#!/usr/bin/env node
/**
 * SDRF Examples Index Builder
 *
 * Scans annotated SDRF files and builds a JSON index of common values
 * per column, grouped by organism. This index is used by the AI Assistant
 * to provide context-aware suggestions based on real examples.
 *
 * Values are validated against SDRF-Proteomics guidelines to ensure
 * only semantically correct values are indexed.
 *
 * Usage:
 *   node scripts/build-sdrf-index.js <path1> [path2] [path3] ...
 *
 * Example:
 *   node scripts/build-sdrf-index.js ./my-sdrf-files ../other-sdrf-projects
 *
 * Or use a config file:
 *   node scripts/build-sdrf-index.js --config ./my-paths.json
 *
 * Config file format (JSON):
 *   { "paths": ["./path1", "./path2"] }
 *
 * Output:
 *   src/assets/sdrf-examples-index.json
 */

const fs = require('fs');
const path = require('path');

// Columns to index (these are the most useful for AI suggestions)
const COLUMNS_TO_INDEX = [
  'characteristics[organism]',
  'characteristics[organism part]',
  'characteristics[disease]',
  'characteristics[developmental stage]',
  'characteristics[sex]',
  'characteristics[age]',
  'characteristics[cell line]',
  'characteristics[cell type]',
  'characteristics[ancestry category]',
  'characteristics[strain]',
  'characteristics[strain/breed]',
  'comment[instrument]',
];

// Global values to skip (reserved words, empty values)
const SKIP_VALUES = new Set([
  '',
  'not available',
  'not applicable',
  'anonymized',
  'pooled',
  'na',
  'n/a',
  'null',
  'none',
  'unknown',
  'other',
]);

// Maximum number of top values to keep per column/organism
const MAX_VALUES_PER_COLUMN = 30;

// Minimum count threshold for a value to be included
const MIN_COUNT_THRESHOLD = 2;

// ============================================================
// SDRF-Proteomics Validation Rules
// Based on: https://github.com/bigbio/proteomics-metadata-standard
// ============================================================

/**
 * Valid sex values per SDRF-Proteomics specification.
 */
const VALID_SEX_VALUES = new Set([
  'male',
  'female',
  'mixed sex',
  'hermaphrodite',
]);

/**
 * Invalid values for developmental stage column.
 * These are disease terms or other metadata that got misplaced.
 */
const INVALID_DEVELOPMENTAL_STAGE_VALUES = new Set([
  'normal',
  'healthy',
  'disease',
  'cancer',
  'tumor',
  'control',
  'treated',
  'untreated',
  'wild type',
  'wildtype',
  'wt',
  'knockout',
  'ko',
  'mutant',
]);

/**
 * Valid developmental stage patterns and keywords.
 * Values should describe life stage, not disease state.
 */
const VALID_DEVELOPMENTAL_STAGE_PATTERNS = [
  /adult/i,
  /embryo/i,
  /fetal/i,
  /fetus/i,
  /neonat/i,
  /infant/i,
  /juvenile/i,
  /adolescent/i,
  /child/i,
  /aged/i,
  /old/i,
  /young/i,
  /mature/i,
  /larva/i,
  /pupa/i,
  /stage/i,
  /day/i,
  /week/i,
  /month/i,
  /year/i,
  /postnatal/i,
  /prenatal/i,
  /gestational/i,
  /trimester/i,
  /newborn/i,
  /senior/i,
  /elderly/i,
  /middle.?age/i,
  /e\d+/i,  // Embryonic day (E10, E14, etc.)
  /p\d+/i,  // Postnatal day (P0, P7, etc.)
  /\d+\s*(dpf|hpf|dpc|wpc)/i,  // Days/hours post fertilization/conception
  /\d+w/i,  // Week notation (9w, 12w)
  /\d+w-\d+w/i,  // Week ranges (9w-12w)
];

/**
 * Invalid values for disease column.
 * These are developmental stages or other metadata that got misplaced.
 */
const INVALID_DISEASE_VALUES = new Set([
  'adult',
  'embryo',
  'fetal',
  'juvenile',
  'child',
  'infant',
  'male',
  'female',
]);

/**
 * Age format validation pattern.
 * Valid formats: 25Y, 6M, 30Y6M, 25Y-30Y, etc.
 */
const AGE_PATTERN = /^\d+[YMDymd](\d+[YMDymd])?(-\d+[YMDymd](\d+[YMDymd])?)?$/;

/**
 * Invalid age values that are clearly wrong.
 */
const INVALID_AGE_VALUES = new Set([
  'normal',
  'healthy',
  'disease',
  'adult',
  'male',
  'female',
  'control',
]);

/**
 * Invalid organism part values.
 */
const INVALID_ORGANISM_PART_VALUES = new Set([
  'normal',
  'healthy',
  'disease',
  'cancer',
  'tumor',
  'adult',
  'male',
  'female',
]);

/**
 * Invalid cell type values.
 */
const INVALID_CELL_TYPE_VALUES = new Set([
  'normal',
  'healthy',
  'disease',
  'cancer',
  'tumor',
  'adult',
  'male',
  'female',
  'control',
]);

/**
 * Ancestry category validation.
 * Should be population/ethnic descriptors.
 */
const INVALID_ANCESTRY_VALUES = new Set([
  'normal',
  'healthy',
  'disease',
  'adult',
  'male',
  'female',
  'control',
]);

// ============================================================
// Column-specific validators
// ============================================================

/**
 * Validates a value for a specific column according to SDRF-Proteomics guidelines.
 * @param {string} column - The column name
 * @param {string} value - The normalized value to validate
 * @returns {boolean} - True if value is valid for the column
 */
function isValidForColumn(column, value) {
  switch (column) {
    case 'characteristics[sex]':
      return VALID_SEX_VALUES.has(value);

    case 'characteristics[developmental stage]':
      // Reject known invalid values
      if (INVALID_DEVELOPMENTAL_STAGE_VALUES.has(value)) {
        return false;
      }
      // Accept if matches any valid pattern
      return VALID_DEVELOPMENTAL_STAGE_PATTERNS.some(pattern => pattern.test(value));

    case 'characteristics[disease]':
      // Reject developmental stage terms in disease column
      if (INVALID_DISEASE_VALUES.has(value)) {
        return false;
      }
      // "normal" is valid for disease (means healthy/no disease)
      return true;

    case 'characteristics[age]':
      // Reject clearly wrong values
      if (INVALID_AGE_VALUES.has(value)) {
        return false;
      }
      // Check if it looks like a valid age format
      // Accept numeric with unit (25Y, 6M, etc.) or ranges
      // Also accept plain numbers that might be years
      if (AGE_PATTERN.test(value)) {
        return true;
      }
      // Accept values with numbers that look like ages
      if (/\d/.test(value) && (value.includes('year') || value.includes('month') || value.includes('day') || value.includes('week'))) {
        return true;
      }
      // Reject values that don't look like ages at all
      if (!/\d/.test(value)) {
        return false;
      }
      return true;

    case 'characteristics[organism part]':
      if (INVALID_ORGANISM_PART_VALUES.has(value)) {
        return false;
      }
      return true;

    case 'characteristics[cell type]':
      if (INVALID_CELL_TYPE_VALUES.has(value)) {
        return false;
      }
      return true;

    case 'characteristics[ancestry category]':
      if (INVALID_ANCESTRY_VALUES.has(value)) {
        return false;
      }
      return true;

    case 'characteristics[cell line]':
      // Cell line names should not be disease or developmental terms
      if (INVALID_DISEASE_VALUES.has(value) || INVALID_DEVELOPMENTAL_STAGE_VALUES.has(value)) {
        return false;
      }
      return true;

    case 'comment[instrument]':
      // Instrument should contain MS-related terms or be an actual instrument name
      // Reject clearly wrong values
      if (['normal', 'healthy', 'disease', 'adult', 'male', 'female'].includes(value)) {
        return false;
      }
      return true;

    default:
      // For other columns, accept all non-skipped values
      return true;
  }
}

// ============================================================
// Main script logic
// ============================================================

/**
 * Parse command-line arguments to get paths.
 */
function getPaths() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: No paths provided.\n');
    console.error('Usage:');
    console.error('  node scripts/build-sdrf-index.js <path1> [path2] ...');
    console.error('  node scripts/build-sdrf-index.js --config ./paths.json\n');
    console.error('Example:');
    console.error('  node scripts/build-sdrf-index.js ../proteomics-metadata-standard/annotated-projects');
    process.exit(1);
  }

  // Check for config file mode
  if (args[0] === '--config') {
    if (!args[1]) {
      console.error('Error: --config requires a path to a JSON config file.');
      process.exit(1);
    }
    const configPath = path.resolve(args[1]);
    if (!fs.existsSync(configPath)) {
      console.error(`Error: Config file not found: ${configPath}`);
      process.exit(1);
    }
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!config.paths || !Array.isArray(config.paths)) {
        console.error('Error: Config file must have a "paths" array.');
        process.exit(1);
      }
      return config.paths.map(p => path.resolve(path.dirname(configPath), p));
    } catch (err) {
      console.error(`Error parsing config file: ${err.message}`);
      process.exit(1);
    }
  }

  // Direct path arguments
  return args.map(p => path.resolve(p));
}

/**
 * Recursively find all SDRF files in a directory.
 */
function findSdrfFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    console.warn(`Warning: Directory not found: ${dir}`);
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findSdrfFiles(fullPath, files);
    } else if (entry.name.endsWith('.sdrf.tsv')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse a TSV file and return headers and rows.
 */
function parseTsvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) return null;

    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t').map(v => v.trim());
      rows.push(values);
    }

    return { headers, rows };
  } catch (err) {
    console.warn(`Warning: Could not parse ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Get the organism value for a row.
 */
function getOrganismForRow(headers, row) {
  const orgIndex = headers.findIndex(h => h === 'characteristics[organism]');
  if (orgIndex === -1 || orgIndex >= row.length) return 'unknown';

  const value = row[orgIndex].toLowerCase().trim();
  if (SKIP_VALUES.has(value)) return 'unknown';

  return value;
}

/**
 * Normalize a value for indexing.
 */
function normalizeValue(value) {
  if (!value) return '';
  return value.trim().toLowerCase();
}

/**
 * Check if a value should be indexed (global skip check).
 */
function shouldIndexValue(value) {
  const normalized = normalizeValue(value);
  return normalized && !SKIP_VALUES.has(normalized);
}

/**
 * Main indexing function.
 */
function buildIndex(annotatedPaths) {
  console.log('Building SDRF examples index...\n');
  console.log('Applying SDRF-Proteomics validation rules:\n');
  console.log('  - Sex: only male/female/mixed sex/hermaphrodite');
  console.log('  - Developmental stage: reject disease terms (normal, cancer, etc.)');
  console.log('  - Disease: reject developmental stage terms');
  console.log('  - Age: validate format (25Y, 6M, ranges)');
  console.log('  - Cross-column: reject misplaced metadata\n');

  // Structure: { columnName: { organism: { value: count } } }
  const index = {};

  // Track rejected values for reporting
  const rejectedValues = {};

  // Initialize index structure
  for (const col of COLUMNS_TO_INDEX) {
    index[col] = {};
    rejectedValues[col] = {};
  }

  // Find all SDRF files
  let allFiles = [];
  for (const basePath of annotatedPaths) {
    const files = findSdrfFiles(basePath);
    console.log(`Found ${files.length} SDRF files in ${basePath}`);
    allFiles = allFiles.concat(files);
  }

  console.log(`\nTotal SDRF files to process: ${allFiles.length}\n`);

  if (allFiles.length === 0) {
    console.error('Error: No SDRF files found. Please check your paths.');
    process.exit(1);
  }

  let processedFiles = 0;
  let totalRows = 0;
  let totalRejected = 0;

  // Process each file
  for (const filePath of allFiles) {
    const parsed = parseTsvFile(filePath);
    if (!parsed) continue;

    const { headers, rows } = parsed;
    processedFiles++;
    totalRows += rows.length;

    // Find column indices
    const columnIndices = {};
    for (const col of COLUMNS_TO_INDEX) {
      const idx = headers.findIndex(h => h === col);
      if (idx !== -1) {
        columnIndices[col] = idx;
      }
    }

    // Process each row
    for (const row of rows) {
      const organism = getOrganismForRow(headers, row);

      // Index each column
      for (const [col, colIdx] of Object.entries(columnIndices)) {
        if (colIdx >= row.length) continue;

        const value = row[colIdx];
        if (!shouldIndexValue(value)) continue;

        const normalizedValue = normalizeValue(value);

        // Apply column-specific validation
        if (!isValidForColumn(col, normalizedValue)) {
          // Track rejected values
          rejectedValues[col][normalizedValue] = (rejectedValues[col][normalizedValue] || 0) + 1;
          totalRejected++;
          continue;
        }

        // Skip organism column for itself
        if (col === 'characteristics[organism]') {
          // For organism column, use 'all' as the organism key
          if (!index[col]['all']) {
            index[col]['all'] = {};
          }
          index[col]['all'][normalizedValue] = (index[col]['all'][normalizedValue] || 0) + 1;
        } else {
          // For other columns, group by organism
          if (!index[col][organism]) {
            index[col][organism] = {};
          }
          index[col][organism][normalizedValue] = (index[col][organism][normalizedValue] || 0) + 1;
        }
      }
    }
  }

  console.log(`Processed ${processedFiles} files with ${totalRows} total rows`);
  console.log(`Rejected ${totalRejected} invalid values based on SDRF guidelines\n`);

  // Report rejected values
  console.log('Rejected Values Summary:');
  console.log('========================');
  for (const [col, values] of Object.entries(rejectedValues)) {
    const sortedRejected = Object.entries(values)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (sortedRejected.length > 0) {
      console.log(`\n${col}:`);
      for (const [value, count] of sortedRejected) {
        console.log(`  - "${value}": ${count} occurrences (rejected)`);
      }
    }
  }

  // Prune index: keep only top N values per column/organism
  const prunedIndex = { columns: {}, metadata: {} };

  for (const [col, organisms] of Object.entries(index)) {
    prunedIndex.columns[col] = {};

    for (const [organism, values] of Object.entries(organisms)) {
      // Convert to array and sort by count descending
      const sortedValues = Object.entries(values)
        .filter(([_, count]) => count >= MIN_COUNT_THRESHOLD)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_VALUES_PER_COLUMN);

      if (sortedValues.length > 0) {
        // Store as { value: count } object
        prunedIndex.columns[col][organism] = {};
        for (const [value, count] of sortedValues) {
          prunedIndex.columns[col][organism][value] = count;
        }
      }
    }

    // Remove empty columns
    if (Object.keys(prunedIndex.columns[col]).length === 0) {
      delete prunedIndex.columns[col];
    }
  }

  // Add metadata
  prunedIndex.metadata = {
    generatedAt: new Date().toISOString(),
    filesProcessed: processedFiles,
    totalRows: totalRows,
    rejectedValues: totalRejected,
    columnsIndexed: Object.keys(prunedIndex.columns).length,
    maxValuesPerColumn: MAX_VALUES_PER_COLUMN,
    minCountThreshold: MIN_COUNT_THRESHOLD,
    validationRules: [
      'Sex values restricted to: male, female, mixed sex, hermaphrodite',
      'Developmental stage: disease terms rejected',
      'Disease: developmental terms rejected',
      'Age: format validation (25Y, 6M, ranges)',
      'Cross-column misplaced metadata rejected',
    ],
  };

  // Print summary
  console.log('\n\nIndex Summary:');
  console.log('==============');
  for (const [col, organisms] of Object.entries(prunedIndex.columns)) {
    const totalValues = Object.values(organisms).reduce(
      (sum, vals) => sum + Object.keys(vals).length,
      0
    );
    console.log(`${col}: ${Object.keys(organisms).length} organisms, ${totalValues} unique values`);
  }

  return prunedIndex;
}

/**
 * Write index to file.
 */
function writeIndex(index, outputPath) {
  const jsonContent = JSON.stringify(index, null, 2);
  fs.writeFileSync(outputPath, jsonContent, 'utf-8');
  console.log(`\nIndex written to: ${outputPath}`);
  console.log(`File size: ${(Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1)} KB`);
}

// Main execution
const annotatedPaths = getPaths();
const outputPath = path.resolve(__dirname, '../src/assets/sdrf-examples-index.json');

// Ensure assets directory exists
const assetsDir = path.dirname(outputPath);
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const index = buildIndex(annotatedPaths);
writeIndex(index, outputPath);

console.log('\nDone!');
