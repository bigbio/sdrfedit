# SDRF Editor

A lightweight, self-hosted JavaScript editor for SDRF (Sample and Data Relationship Format) files. Built as a standalone web component that runs entirely in the browser without backend dependencies.

## Features

### Core Functionality
- **TSV Parsing**: Load and parse SDRF files with automatic column type detection
- **Virtual Scrolling**: Efficiently handle large files with 10,000+ rows
- **Direct OLS Integration**: Ontology autocomplete via EBI OLS API with caching
- **Export**: Download edited files as TSV or Excel (XLSX)

### Smart Cell Editing
- **Age Input**: Structured input for age values (e.g., `30Y`, `25Y6M`, `20Y-30Y`)
- **Modification Parameters**: Unimod autocomplete for PTM annotations
- **Cleavage Agents**: Common enzyme presets with MS ontology terms
- **Ontology Autocomplete**: Organism, disease, tissue, cell type, instrument lookups

### Bulk Editing
- **Multi-row Selection**: Checkbox, Shift+Click, Ctrl+Click support
- **Column Statistics Panel**: View value distribution and apply bulk changes
- **Bulk Edit Toolbar**: Apply values to all selected samples
- **Context Menu**: "Select all with same value" functionality

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
ng serve

# Build for production
ng build --configuration=production
```

### Usage

Open the application in your browser and either:
- **Load from URL**: Provide a URL to an SDRF file (must support CORS)
- **Upload File**: Drag and drop or click to upload a local TSV file

## Technology Stack

- **Framework**: Angular 19 (Standalone Components)
- **UI**: Angular Material
- **TSV Parsing**: PapaParse
- **Excel Export**: SheetJS (xlsx)
- **Ontology**: Direct EBI OLS4 API integration

## Project Structure

```
src/
├── app/
│   ├── components/           # UI components
│   │   ├── sdrf-editor/      # Main editor component
│   │   ├── sdrf-cell-editor/ # Cell editing with syntax detection
│   │   ├── sdrf-age-input/   # Age format input
│   │   ├── sdrf-modification-input/
│   │   ├── sdrf-cleavage-input/
│   │   ├── sdrf-ontology-input/
│   │   ├── sdrf-column-stats/
│   │   ├── sdrf-bulk-toolbar/
│   │   └── sdrf-filter-bar/
│   └── core/
│       ├── models/           # Data models
│       ├── services/         # Business logic
│       └── utils/            # Utility functions
└── index.html
```

## SDRF Format

SDRF (Sample and Data Relationship Format) is a tab-delimited format for describing experimental samples in proteomics and other omics studies. Key column types include:

| Column Type | Example | Description |
|-------------|---------|-------------|
| Source Name | `sample1` | Unique sample identifier |
| Characteristics | `characteristics[organism]` | Sample properties |
| Factor Value | `factor value[compound]` | Experimental variables |
| Comment | `comment[data file]` | Additional metadata |
| Assay Name | `run1` | Unique assay/run identifier |

For the full SDRF specification, see the [SDRF-Proteomics documentation](https://github.com/bigbio/proteomics-metadata-standard).

## License

Apache License 2.0
