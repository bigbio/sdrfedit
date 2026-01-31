# SDRF Editor - Future Improvements

This document tracks planned features and improvements for the SDRF Editor.

---

## Phase 2: Enhanced User Experience

### Column Type Visual Indicators

Display subtle visual cues to distinguish column types:

| Column Type | Visual Style | Examples |
|-------------|--------------|----------|
| Source Name | Green left border | `source name` |
| Assay Name | Purple left border | `assay name` |
| Characteristics | Blue left border | `characteristics[organism]` |
| Factor Value | Orange left border | `factor value[compound]` |
| Comment | Gray left border | `comment[data file]` |

### Table Sorting

- Click column header to sort ascending/descending
- Sort indicator in header
- Multi-column sort with Shift+Click

### Row Filtering

- Column selector dropdown
- Operators: equals, contains, starts with, is empty
- Multiple filter conditions (AND/OR)
- Quick filter chips
- Clear all filters button

### Column Management

- **Add Column**: Type selector, standard column autocomplete, position selector
- **Delete/Hide Column**: Right-click menu, undo support
- **Reorder Columns**: Drag headers or column management dialog

### Undo/Redo System

- Track modifications as commands
- Ctrl+Z / Ctrl+Shift+Z shortcuts
- Max 50 undo levels
- Group bulk edits as single undo

---

## Phase 3: Data Quality & Validation

### Data Quality Indicators

- Empty value highlighting for required columns
- Duplicate source name detection
- Data completeness percentage per column
- Auto-suggest from existing column values

### Ontology Validation

- Batch validate column against ontology
- Validation status icons
- Suggest corrections for invalid terms

### Validation Panel

- Client-side validation engine
- Required column checks
- Format validation (collision energy, age, mass tolerance)
- Export validation report

---

## Phase 4: Advanced Features

### Import/Export

- Import from Excel
- Merge multiple SDRF files
- SDRF templates (human proteomics, cell lines, etc.)

### Navigation

- Freeze source_name column while scrolling
- Column grouping (collapse/expand sections)
- Bookmark rows for review
- Global search across all columns

### Advanced Editing

- Copy/paste rows
- Duplicate samples with modifications
- Find and replace across table
- Regular expression support in filters

---

## Phase 5: Web Component Distribution

### Build as Custom Element

- Single JS bundle (`sdrf-editor.min.js`)
- NPM package distribution
- Framework integration examples (React, Vue, plain HTML)

### API

| Attribute | Description |
|-----------|-------------|
| `url` | URL to load SDRF from |
| `content` | SDRF content to load directly |
| `readonly` | Disable editing |

| Event | Description |
|-------|-------------|
| `tableChange` | Emitted when table data changes |
| `validationComplete` | Emitted after validation |
| `export` | Emitted on export |

---

## Technical Improvements

- [ ] Move inline styles to separate CSS files
- [ ] Add comprehensive unit tests
- [ ] Add E2E tests with Playwright
- [ ] Performance profiling for 10,000+ row files
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Internationalization support
