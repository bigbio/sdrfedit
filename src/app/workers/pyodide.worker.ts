/// <reference lib="webworker" />

/**
 * Pyodide Web Worker
 *
 * Runs Python code in a separate thread to avoid blocking the UI.
 * Used for sdrf-pipelines validation.
 */

let pyodide: any = null;
let sdrfPipelinesLoaded = false;

/**
 * Initialize Pyodide and install sdrf-pipelines
 */
async function initPyodide(): Promise<void> {
  postMessage({ type: 'progress', payload: 'Loading Pyodide runtime...' });

  // Load Pyodide from CDN using dynamic import (for module workers)
  // @ts-ignore - dynamic import from CDN
  const { loadPyodide: loadPyodideModule } = await import(
    /* webpackIgnore: true */
    'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs'
  );

  pyodide = await loadPyodideModule({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
  });

  postMessage({ type: 'progress', payload: 'Installing Python packages...' });

  // Install required packages
  await pyodide.loadPackage(['micropip', 'numpy', 'pandas']);

  postMessage({ type: 'progress', payload: 'Installing sdrf-pipelines...' });

  // Construct absolute URL for the wheel file
  // Web Workers need absolute URLs since relative paths resolve from worker location
  const wheelUrl = new URL('/assets/wheels/sdrf_pipelines-0.0.34.dev-py3-none-any.whl', self.location.origin).href;
  pyodide.globals.set('wheel_url', wheelUrl);

  // Install sdrf-pipelines from local wheel (dev version with clean dependencies)
  await pyodide.runPythonAsync(`
import micropip

# Install dependencies first
await micropip.install([
    'pyyaml',
    'click',
    'defusedxml',
    'pydantic',
])

# Install sdrf-pipelines from local wheel using absolute URL
await micropip.install(wheel_url)

print("sdrf-pipelines installed successfully")
  `);

  sdrfPipelinesLoaded = true;
  postMessage({ type: 'ready' });
}

/**
 * Get list of available validation templates
 */
async function getTemplates(): Promise<string[]> {
  if (!sdrfPipelinesLoaded) {
    throw new Error('Pyodide not initialized');
  }

  const result = await pyodide.runPythonAsync(`
import json
from sdrf_pipelines.sdrf.schemas import SchemaRegistry

registry = SchemaRegistry()
templates = registry.get_schema_names()
json.dumps(templates)
  `);

  return JSON.parse(result);
}

/**
 * Validate SDRF content against templates
 */
async function validate(
  sdrfTsv: string,
  templates: string[],
  skipOntology: boolean = true
): Promise<any[]> {
  if (!sdrfPipelinesLoaded) {
    throw new Error('Pyodide not initialized');
  }

  // Pass data to Python global scope
  pyodide.globals.set('sdrf_content', sdrfTsv);
  pyodide.globals.set('template_names', templates);
  pyodide.globals.set('skip_ontology', skipOntology);

  const result = await pyodide.runPythonAsync(`
import json
import logging
from io import StringIO
from sdrf_pipelines.sdrf.sdrf import read_sdrf
from sdrf_pipelines.sdrf.schemas import SchemaRegistry, SchemaValidator

# Parse SDRF from TSV string
sdrf = read_sdrf(StringIO(sdrf_content))

# Create validator with registry
registry = SchemaRegistry()
validator = SchemaValidator(registry)

# Collect all errors from all templates
all_errors = []

for template in template_names:
    try:
        errors = validator.validate(
            sdrf,
            schema_name=template,
            skip_ontology=skip_ontology,
            use_ols_cache_only=True
        )
        all_errors.extend(errors)
    except Exception as e:
        # Add template loading error
        all_errors.append({
            'message': f"Failed to validate with template '{template}': {str(e)}",
            'row': -1,
            'column': None,
            'value': None,
            'error_type': logging.ERROR,
            'suggestion': None
        })

# Convert errors to JSON-serializable format
result = []
for err in all_errors:
    if hasattr(err, 'message'):
        # It's a LogicError object
        result.append({
            'message': err.message,
            'row': getattr(err, 'row', -1),
            'column': getattr(err, 'column', None),
            'value': getattr(err, 'value', None),
            'level': 'error' if getattr(err, 'error_type', logging.ERROR) == logging.ERROR else 'warning',
            'suggestion': getattr(err, 'suggestion', None)
        })
    elif isinstance(err, dict):
        # It's already a dict (from our error handling above)
        result.append({
            'message': err.get('message', 'Unknown error'),
            'row': err.get('row', -1),
            'column': err.get('column'),
            'value': err.get('value'),
            'level': 'error' if err.get('error_type', logging.ERROR) == logging.ERROR else 'warning',
            'suggestion': err.get('suggestion')
        })

json.dumps(result)
  `);

  return JSON.parse(result);
}

/**
 * Get template details (columns, validators)
 */
async function getTemplateDetails(templateName: string): Promise<any> {
  if (!sdrfPipelinesLoaded) {
    throw new Error('Pyodide not initialized');
  }

  pyodide.globals.set('template_name', templateName);

  const result = await pyodide.runPythonAsync(`
import json
from sdrf_pipelines.sdrf.schemas import SchemaRegistry

registry = SchemaRegistry()
schema = registry.get_schema(template_name)

if schema:
    details = {
        'name': schema.name,
        'description': getattr(schema, 'description', ''),
        'version': getattr(schema, 'version', ''),
        'extends': getattr(schema, 'extends', None),
        'columns': []
    }

    if hasattr(schema, 'columns'):
        for col_name, col in schema.columns.items() if isinstance(schema.columns, dict) else [(c.name, c) for c in schema.columns]:
            details['columns'].append({
                'name': col_name if isinstance(col_name, str) else getattr(col, 'name', ''),
                'requirement': str(getattr(col, 'requirement', 'optional')),
                'description': getattr(col, 'description', '')
            })

    json.dumps(details)
else:
    json.dumps(None)
  `);

  return JSON.parse(result);
}

// Handle messages from main thread
addEventListener('message', async (event) => {
  const { type, payload, id } = event.data;

  try {
    switch (type) {
      case 'init':
        await initPyodide();
        break;

      case 'validate':
        const errors = await validate(
          payload.sdrf,
          payload.templates,
          payload.skipOntology ?? true
        );
        postMessage({ type: 'validation-result', payload: errors, id });
        break;

      case 'get-templates':
        const templates = await getTemplates();
        postMessage({ type: 'templates', payload: templates, id });
        break;

      case 'get-template-details':
        const details = await getTemplateDetails(payload.template);
        postMessage({ type: 'template-details', payload: details, id });
        break;

      default:
        postMessage({ type: 'error', payload: `Unknown message type: ${type}`, id });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    postMessage({ type: 'error', payload: errorMessage, id });
  }
});

// Signal that worker is loaded (but not initialized)
postMessage({ type: 'worker-loaded' });
