var e=null,i=!1;async function p(){postMessage({type:"progress",payload:"Loading Pyodide runtime..."});let{loadPyodide:t}=await import("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs");e=await t({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"}),postMessage({type:"progress",payload:"Installing Python packages..."}),await e.loadPackage(["micropip","numpy","pandas"]),postMessage({type:"progress",payload:"Installing sdrf-pipelines..."});let r=new URL("/assets/wheels/sdrf_pipelines-0.0.34.dev-py3-none-any.whl",self.location.origin).href;e.globals.set("wheel_url",r),await e.runPythonAsync(`
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
  `),i=!0,postMessage({type:"ready"})}async function d(){if(!i)throw new Error("Pyodide not initialized");let t=await e.runPythonAsync(`
import json
from sdrf_pipelines.sdrf.schemas import SchemaRegistry

registry = SchemaRegistry()
templates = registry.get_schema_names()
json.dumps(templates)
  `);return JSON.parse(t)}async function m(t,r,a=!0){if(!i)throw new Error("Pyodide not initialized");e.globals.set("sdrf_content",t),e.globals.set("template_names",r),e.globals.set("skip_ontology",a);let s=await e.runPythonAsync(`
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
  `);return JSON.parse(s)}async function g(t){if(!i)throw new Error("Pyodide not initialized");e.globals.set("template_name",t);let r=await e.runPythonAsync(`
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
  `);return JSON.parse(r)}addEventListener("message",async t=>{let{type:r,payload:a,id:s}=t.data;try{switch(r){case"init":await p();break;case"validate":let o=await m(a.sdrf,a.templates,a.skipOntology??!0);postMessage({type:"validation-result",payload:o,id:s});break;case"get-templates":let n=await d();postMessage({type:"templates",payload:n,id:s});break;case"get-template-details":let l=await g(a.template);postMessage({type:"template-details",payload:l,id:s});break;default:postMessage({type:"error",payload:`Unknown message type: ${r}`,id:s})}}catch(o){let n=o instanceof Error?o.message:String(o);postMessage({type:"error",payload:n,id:s})}});postMessage({type:"worker-loaded"});
