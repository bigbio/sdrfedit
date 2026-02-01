# SDRF Editor

A lightweight, self-hosted JavaScript editor for SDRF (Sample and Data Relationship Format) files. Built as a standalone web component that runs entirely in the browser without backend dependencies.

## Features

### Core Functionality
- **TSV Parsing**: Load and parse SDRF files with automatic column type detection
- **Virtual Scrolling**: Efficiently handle large files with 10,000+ rows
- **Direct OLS Integration**: Ontology autocomplete via EBI OLS API with caching
- **Export**: Download edited files as TSV or Excel (XLSX)

### SDRF Creation Wizard (New!)
Create SDRF files from scratch with a guided 7-step wizard:
1. **Experiment Setup**: Select template type (Human/Cell-line/Vertebrate/Other) and sample count
2. **Sample Characteristics**: Define organism, disease, tissue with OLS autocomplete
3. **Sample Values**: Batch entry table for sample-specific information
4. **Technical Config**: Labels (TMT, iTRAQ, SILAC, Label-free), fractions, replicates, DDA/DIA
5. **Instrument & Protocol**: MS instrument, enzyme, PTM modifications
6. **Data Files**: Pattern-based file name generation
7. **Review & Create**: Preview and generate the SDRF table

### AI-Powered Features (Optional)
- **AI Assistant Panel**: Get intelligent recommendations for your SDRF
- **LLM Provider Support**: OpenAI, Anthropic, Google Gemini, or local Ollama
- **Smart Suggestions**: Fix validation errors, improve metadata quality

### Validation with sdrf-pipelines
- **Browser-based Validation**: Runs the official [sdrf-pipelines](https://github.com/bigbio/sdrf-pipelines) validator via Pyodide (WebAssembly)
- **Real-time Feedback**: See validation errors and warnings as you edit
- **Template Support**: Validates against default, human, vertebrates, nonvertebrates, cell-lines, and plants templates

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
npm run build -- --configuration=production
```

### Usage

Open the application in your browser at `http://localhost:4200` and:
- **Create New**: Click "Create New" to start the SDRF Creation Wizard
- **Import File**: Load an existing SDRF file (drag & drop or file picker)
- **Load from URL**: Provide a URL to an SDRF file (must support CORS)

## Validation Integration

The editor integrates with [sdrf-pipelines](https://github.com/bigbio/sdrf-pipelines) for validation. The validator runs entirely in the browser using Pyodide (Python compiled to WebAssembly).

### How It Works

1. On first validation, Pyodide (~15MB) is downloaded and cached
2. The sdrf-pipelines wheel is loaded from the app's assets
3. Validation runs in a Web Worker to avoid blocking the UI
4. Results show errors and warnings with suggestions for fixes

### Updating the Validator

To use a newer version of sdrf-pipelines:

```bash
# Build the wheel from sdrf-pipelines repo
cd /path/to/sdrf-pipelines
pip install build
python -m build --wheel

# Copy the wheel to the editor's assets
cp dist/sdrf_pipelines-*.whl /path/to/sdrfedit/src/assets/wheels/

# Update the filename in the worker
# Edit: src/app/workers/pyodide.worker.ts
# Change the micropip.install line to match the new wheel filename
```

## AI Assistant Setup (Optional)

The AI Assistant provides intelligent recommendations for improving your SDRF. It can suggest fixes for validation errors, recommend ontology terms, and help improve metadata quality.

### Configuring AI

1. Click **"AI Assistant"** in the toolbar to open the recommendations panel
2. Click the **settings icon** (gear) in the panel header
3. Select your preferred **LLM provider**
4. Enter your **API key** (or configure Ollama for local use)
5. Click **Save**

### Supported Providers

| Provider | API Key | Models | Get API Key |
|----------|---------|--------|-------------|
| **OpenAI** | Required | GPT-4o, GPT-4o-mini | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Claude** | Required | Claude Sonnet 4, Claude 3.5 Haiku | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Google Gemini** | Required | Gemini 2.0 Flash, Gemini 1.5 Pro | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **Ollama** | Not required | Any local model | Local installation |

> **Note:** For Claude, use `console.anthropic.com` (API developer console), NOT `claude.ai` (consumer chat). Claude Pro subscription does NOT include API access. API keys start with `sk-ant-...`

### Ollama Setup (Local/Free)

Run AI locally without API costs using [Ollama](https://ollama.ai). No rate limits, works offline, and your data stays on your machine.

**Installation:**

```bash
# Install Ollama (macOS)
brew install ollama

# Or download from https://ollama.ai for Windows/Linux

# Start Ollama server
ollama serve
```

**Recommended Models:**

| Model | Size | Pull Command | Notes |
|-------|------|--------------|-------|
| **qwen3** | 5.2 GB | `ollama pull qwen3` | Best quality, recommended |
| **llama3.2** | 2.0 GB | `ollama pull llama3.2` | Smaller, faster |

```bash
# Pull one or both models (in another terminal)
ollama pull qwen3        # Recommended - best results
ollama pull llama3.2     # Lighter alternative
```

**Usage in SDRF Editor:**

1. Select **"Ollama (Local)"** as the provider in settings
2. Choose your model (qwen3 or llama3.2)
3. No API key needed - connects to `http://localhost:11434`

### How AI Recommendations Work

1. Click **"Get Recommendations"** in the AI panel
2. The AI analyzes your SDRF structure and validation errors
3. Suggestions appear as cards with:
   - **Category**: What type of improvement (validation fix, data quality, etc.)
   - **Description**: What to change and why
   - **Apply button**: One-click to apply the suggestion
4. Review and apply suggestions as needed

## Building the Knowledge Base (Optional)

The AI Assistant can use a knowledge base of real SDRF examples to provide better suggestions. This is optional but improves recommendation quality.

### Building from Your SDRF Files

If you have a collection of annotated SDRF files, you can build a local knowledge base:

```bash
# Provide paths to directories containing .sdrf.tsv files
node scripts/build-sdrf-index.js /path/to/your/sdrf-files /another/path

# Or use the public proteomics-metadata-standard repository
git clone https://github.com/bigbio/proteomics-metadata-standard.git
node scripts/build-sdrf-index.js ./proteomics-metadata-standard/annotated-projects
```

### Using a Config File

For repeated builds, create a config file:

```json
{
  "paths": [
    "../proteomics-metadata-standard/annotated-projects",
    "./my-local-sdrf-collection"
  ]
}
```

Then run:

```bash
node scripts/build-sdrf-index.js --config ./my-paths.json
```

### Output

The script generates `src/assets/sdrf-examples-index.json` containing:
- Common values for each SDRF column
- Values grouped by organism
- Usage counts for ranking suggestions

After building, rebuild the editor to include the new index:

```bash
npm run build -- --configuration=production
```

## Publishing & Distribution

The SDRF Editor is published as a component via **jsDelivr CDN**, which serves files directly from this GitHub repository. No separate deployment or npm publishing is required.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  sdrfedit repo (bigbio/sdrfedit)                                │
│                                                                  │
│  1. Make changes to src/                                         │
│  2. npm run build -- --configuration=production                  │
│  3. git add dist/ && git commit && git push                      │
│                                                                  │
│  The dist/ folder is committed to the repo:                      │
│  dist/sdrf-editor/browser/                                       │
│  ├── main.js                                                     │
│  ├── polyfills.js                                                │
│  └── styles.css                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
              jsDelivr CDN automatically serves files
              https://cdn.jsdelivr.net/gh/bigbio/sdrfedit@main/...
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Any website can embed the editor:                               │
│                                                                  │
│  <link href="https://cdn.jsdelivr.net/gh/bigbio/sdrfedit@main/  │
│              dist/sdrf-editor/browser/styles.css">               │
│  <script src="https://cdn.jsdelivr.net/gh/bigbio/sdrfedit@main/ │
│               dist/sdrf-editor/browser/main.js" type="module">   │
│  <app-root></app-root>                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Release Workflow

To publish a new version of the editor:

```bash
# 1. Make your changes
# 2. Build the production bundle
npm run build -- --configuration=production

# 3. Commit the built files
git add dist/
git commit -m "Build: update editor bundle"

# 4. Push to main/master
git push origin main
```

Once pushed, jsDelivr will automatically serve the new version. Websites using the editor will get the update when they rebuild/redeploy.

### Embedding in Other Websites

To embed the SDRF Editor in any HTML page:

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/bigbio/sdrfedit@main/dist/sdrf-editor/browser/styles.css">
</head>
<body>
    <app-root></app-root>

    <script src="https://cdn.jsdelivr.net/gh/bigbio/sdrfedit@main/dist/sdrf-editor/browser/polyfills.js" type="module"></script>
    <script src="https://cdn.jsdelivr.net/gh/bigbio/sdrfedit@main/dist/sdrf-editor/browser/main.js" type="module"></script>
</body>
</html>
```

### Integration with SDRF Specification Website

The editor is integrated into the SDRF-Proteomics specification website at [sdrf.quantms.org](https://sdrf.quantms.org). See the [proteomics-metadata-standard](https://github.com/bigbio/proteomics-metadata-standard) repository for details.

### jsDelivr Cache

jsDelivr caches files for performance. After pushing changes:
- Use `@main` for the latest version (cache refreshes within 24 hours)
- Use `@{commit-hash}` for immediate updates
- Use `@{tag}` for versioned releases

## Technology Stack

- **Framework**: Angular 20 (Standalone Components, Signals)
- **UI**: Custom CSS (no external UI library)
- **TSV Parsing**: PapaParse
- **Excel Export**: SheetJS (xlsx)
- **Ontology**: Direct EBI OLS4 API integration
- **Validation**: Pyodide + sdrf-pipelines
- **AI**: OpenAI, Anthropic, Gemini, Ollama APIs

## Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── sdrf-editor/          # Main editor component
│   │   ├── sdrf-wizard/          # SDRF Creation Wizard
│   │   │   └── steps/            # Wizard step components
│   │   ├── sdrf-cell-editor/     # Cell editing with syntax detection
│   │   ├── sdrf-recommend-panel/ # AI recommendations panel
│   │   ├── llm-settings/         # LLM provider configuration
│   │   ├── sdrf-age-input/       # Age format input
│   │   ├── sdrf-modification-input/
│   │   ├── sdrf-cleavage-input/
│   │   ├── sdrf-ontology-input/
│   │   ├── sdrf-column-stats/
│   │   ├── sdrf-bulk-toolbar/
│   │   └── sdrf-filter-bar/
│   ├── core/
│   │   ├── models/               # Data models (sdrf-table, wizard, llm)
│   │   ├── services/             # Business logic
│   │   │   ├── wizard-state.service.ts
│   │   │   ├── wizard-generator.service.ts
│   │   │   ├── pyodide-validator.service.ts
│   │   │   └── llm/              # LLM provider implementations
│   │   └── utils/                # Utility functions
│   ├── workers/
│   │   └── pyodide.worker.ts     # Web Worker for validation
│   └── assets/
│       └── wheels/               # Python wheels for Pyodide
│           └── sdrf_pipelines-*.whl
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

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and build (`npm run build`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

Apache License 2.0
