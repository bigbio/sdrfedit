/**
 * Template Service
 *
 * Fetches and manages SDRF templates from the API or bundled YAML files.
 * Handles template inheritance resolution.
 */

import { Injectable, signal, computed } from '@angular/core';
import {
  TemplateDefinition,
  TemplateColumn,
  TemplateValidator,
  ResolvedTemplate,
  TemplateInfo,
  TemplateManifest,
  RequirementLevel,
  convertYamlToTemplateDefinition,
  getTemplateIcon,
  getTemplateDisplayName,
} from '../models/template';

// Simple YAML parser for template files (handles basic YAML structure)
function parseSimpleYaml(yamlText: string): any {
  // This is a minimal YAML parser for the specific template format
  // For production, consider using js-yaml library
  const lines = yamlText.split('\n');
  const result: any = {};
  const stack: { obj: any; indent: number; key?: string }[] = [{ obj: result, indent: -1 }];
  let currentArray: any[] | null = null;
  let currentArrayKey: string | null = null;
  let currentArrayIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') continue;

    // Calculate indentation
    const indent = line.search(/\S/);

    // Handle array items
    if (trimmed.startsWith('- ')) {
      const content = trimmed.substring(2).trim();

      // Find the current array
      if (currentArray === null || indent <= currentArrayIndent) {
        // New array or different array
        const parent = stack[stack.length - 1].obj;
        if (currentArrayKey) {
          currentArray = parent[currentArrayKey] || [];
          parent[currentArrayKey] = currentArray;
        }
        currentArrayIndent = indent;
      }

      if (content.includes(':')) {
        // Array of objects
        const obj: any = {};
        const [key, ...valueParts] = content.split(':');
        const value = valueParts.join(':').trim();
        if (value) {
          obj[key.trim()] = parseValue(value);
        }
        // Look ahead for nested properties
        let j = i + 1;
        const itemIndent = indent + 2;
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trim();
          if (nextTrimmed === '' || nextTrimmed.startsWith('#')) {
            j++;
            continue;
          }
          const nextIndent = nextLine.search(/\S/);
          if (nextIndent <= indent) break;
          if (nextTrimmed.startsWith('- ')) break;

          if (nextTrimmed.includes(':')) {
            const [nKey, ...nValueParts] = nextTrimmed.split(':');
            const nValue = nValueParts.join(':').trim();
            const keyName = nKey.trim();
            if (nValue === '' || nValue === '|' || nValue === '>') {
              // Nested object or multiline
              obj[keyName] = parseNestedObject(lines, j + 1, nextIndent + 2);
            } else if (nValue.startsWith('[') && nValue.endsWith(']')) {
              // Inline array
              obj[keyName] = nValue.slice(1, -1).split(',').map(s => parseValue(s.trim()));
            } else {
              obj[keyName] = parseValue(nValue);
            }
          }
          j++;
        }
        i = j - 1;
        if (currentArray) currentArray.push(obj);
      } else {
        // Simple array item
        if (currentArray) currentArray.push(parseValue(content));
      }
      continue;
    }

    // Handle key: value pairs
    if (trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      // Pop stack to correct level
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      const current = stack[stack.length - 1].obj;

      if (value === '' || value === '|' || value === '>') {
        // Start of nested object or array
        const newObj = value === '' ? {} : '';
        current[key] = newObj;
        if (typeof newObj === 'object') {
          stack.push({ obj: newObj, indent, key });
          currentArrayKey = key;
          currentArray = null;
        }
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array
        current[key] = value.slice(1, -1).split(',').map(s => parseValue(s.trim()));
        currentArray = null;
        currentArrayKey = null;
      } else {
        // Simple value
        current[key] = parseValue(value);
        currentArray = null;
        currentArrayKey = null;
      }
    }
  }

  return result;
}

function parseNestedObject(lines: string[], startIndex: number, minIndent: number): any {
  const result: any = {};
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const indent = line.search(/\S/);
    if (indent < minIndent) break;
    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      result[key.trim()] = parseValue(value);
    }
  }
  return result;
}

function parseValue(value: string): any {
  if (value === '' || value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  // Remove quotes
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/bigbio/sdrf-templates/main';
const API_BASE_URL = 'https://www.ebi.ac.uk/pride/services/sdrf-validator';

// Default templates to show in wizard
const DEFAULT_WIZARD_TEMPLATES = ['human', 'cell-lines', 'vertebrates', 'ms-proteomics'];

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class TemplateService {
  // State signals
  private readonly _templates = signal<Map<string, TemplateDefinition>>(new Map());
  private readonly _resolvedCache = signal<Map<string, ResolvedTemplate>>(new Map());
  private readonly _isLoading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _manifest = signal<TemplateManifest | null>(null);
  private readonly _lastFetchTime = signal<number>(0);

  // Public readonly signals
  readonly templates = this._templates.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Get all loaded template definitions.
   */
  readonly allTemplates = computed(() => Array.from(this._templates().values()));

  /**
   * Get templates that can be used alone (usableAlone: true).
   */
  readonly usableTemplates = computed(() =>
    this.allTemplates().filter(t => t.usableAlone)
  );

  /**
   * Get sample layer templates.
   */
  readonly sampleTemplates = computed(() =>
    this.allTemplates().filter(t => t.layer === 'sample')
  );

  /**
   * Get technology layer templates.
   */
  readonly technologyTemplates = computed(() =>
    this.allTemplates().filter(t => t.layer === 'technology')
  );

  /**
   * Get experiment layer templates.
   */
  readonly experimentTemplates = computed(() =>
    this.allTemplates().filter(t => t.layer === 'experiment')
  );

  /**
   * Fetch all templates from the manifest and load their definitions.
   */
  async fetchTemplates(): Promise<void> {
    // Check cache
    const now = Date.now();
    if (now - this._lastFetchTime() < CACHE_TTL && this._templates().size > 0) {
      return;
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      // First, try to fetch the manifest
      const manifest = await this.fetchManifest();
      this._manifest.set(manifest);

      // Load all templates
      const templates = new Map<string, TemplateDefinition>();
      const templateNames = Object.keys(manifest.templates);

      // Fetch templates in parallel with a concurrency limit
      const batchSize = 5;
      for (let i = 0; i < templateNames.length; i += batchSize) {
        const batch = templateNames.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(name => this.fetchTemplateDefinition(name, manifest.templates[name].latest))
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result.status === 'fulfilled' && result.value) {
            templates.set(batch[j], result.value);
          } else if (result.status === 'rejected') {
            console.warn(`Failed to fetch template ${batch[j]}:`, result.reason);
          }
        }
      }

      this._templates.set(templates);
      this._lastFetchTime.set(now);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._error.set(errorMessage);
      console.error('Failed to fetch templates:', error);

      // Fall back to default templates if we have none
      if (this._templates().size === 0) {
        await this.loadFallbackTemplates();
      }
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Fetch the templates manifest.
   */
  private async fetchManifest(): Promise<TemplateManifest> {
    const response = await fetch(`${GITHUB_RAW_BASE}/templates.yaml`);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status}`);
    }

    const yamlText = await response.text();
    const parsed = parseSimpleYaml(yamlText);

    return {
      schemaVersion: parsed.schema_version || '1.0',
      generatedAt: parsed.generated_at || new Date().toISOString(),
      templates: this.convertManifestTemplates(parsed.templates || {}),
    };
  }

  /**
   * Convert manifest templates from YAML format.
   */
  private convertManifestTemplates(templates: any): TemplateManifest['templates'] {
    const result: TemplateManifest['templates'] = {};
    for (const [name, data] of Object.entries(templates as Record<string, any>)) {
      result[name] = {
        latest: data.latest || '1.0.0',
        versions: data.versions || [data.latest || '1.0.0'],
        extends: data.extends || null,
        usableAlone: data.usable_alone ?? false,
        layer: data.layer || null,
        status: data.status || 'stable',
        description: data.description || '',
      };
    }
    return result;
  }

  /**
   * Fetch a specific template definition.
   */
  private async fetchTemplateDefinition(name: string, version: string): Promise<TemplateDefinition | null> {
    try {
      const url = `${GITHUB_RAW_BASE}/${name}/${version}/${name}.yaml`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const yamlText = await response.text();
      const parsed = parseSimpleYaml(yamlText);
      return convertYamlToTemplateDefinition(parsed);
    } catch (error) {
      console.warn(`Failed to fetch template ${name}@${version}:`, error);
      return null;
    }
  }

  /**
   * Load fallback templates when fetch fails.
   */
  private async loadFallbackTemplates(): Promise<void> {
    // Create minimal fallback templates based on the old hard-coded ones
    const fallbackTemplates: TemplateDefinition[] = [
      {
        name: 'human',
        description: 'Human Samples',
        version: '1.0.0',
        extends: null,
        usableAlone: true,
        layer: 'sample',
        columns: this.getBaseColumns(),
      },
      {
        name: 'cell-lines',
        description: 'Cell Lines',
        version: '1.0.0',
        extends: null,
        usableAlone: true,
        layer: 'sample',
        columns: this.getBaseColumns(),
      },
      {
        name: 'vertebrates',
        description: 'Vertebrates (Non-Human)',
        version: '1.0.0',
        extends: null,
        usableAlone: true,
        layer: 'sample',
        columns: this.getBaseColumns(),
      },
      {
        name: 'ms-proteomics',
        description: 'MS Proteomics',
        version: '1.0.0',
        extends: null,
        usableAlone: true,
        layer: 'technology',
        columns: this.getMsProteomicsColumns(),
      },
    ];

    const templates = new Map<string, TemplateDefinition>();
    for (const template of fallbackTemplates) {
      templates.set(template.name, template);
    }
    this._templates.set(templates);
  }

  /**
   * Get base columns for fallback templates.
   */
  private getBaseColumns(): TemplateColumn[] {
    return [
      { name: 'source name', description: 'Unique sample identifier', requirement: 'required' },
      { name: 'characteristics[organism]', description: 'Species', requirement: 'required', validators: [{ validatorName: 'ontology', params: { ontologies: ['ncbitaxon'] } }] },
      { name: 'characteristics[organism part]', description: 'Anatomical part', requirement: 'required', validators: [{ validatorName: 'ontology', params: { ontologies: ['uberon', 'bto'] } }] },
      { name: 'characteristics[disease]', description: 'Disease state', requirement: 'required', validators: [{ validatorName: 'ontology', params: { ontologies: ['mondo', 'efo', 'doid'] } }] },
      { name: 'characteristics[biological replicate]', description: 'Biological replicate number', requirement: 'required' },
    ];
  }

  /**
   * Get MS proteomics columns for fallback templates.
   */
  private getMsProteomicsColumns(): TemplateColumn[] {
    return [
      ...this.getBaseColumns(),
      { name: 'assay name', description: 'Unique assay identifier', requirement: 'required' },
      { name: 'technology type', description: 'Technology used', requirement: 'required' },
      { name: 'comment[instrument]', description: 'Instrument used', requirement: 'required', validators: [{ validatorName: 'ontology', params: { ontologies: ['ms'] } }] },
      { name: 'comment[label]', description: 'Labeling strategy', requirement: 'required' },
      { name: 'comment[fraction identifier]', description: 'Fraction number', requirement: 'required' },
      { name: 'comment[cleavage agent details]', description: 'Enzyme used', requirement: 'required' },
      { name: 'comment[modification parameters]', description: 'PTMs searched', requirement: 'recommended', cardinality: 'multiple' },
      { name: 'comment[proteomics data acquisition method]', description: 'Acquisition method', requirement: 'required' },
      { name: 'comment[data file]', description: 'Data file name', requirement: 'required' },
    ];
  }

  /**
   * Get a resolved template with inheritance applied.
   */
  async getResolvedTemplate(name: string): Promise<ResolvedTemplate> {
    // Check cache
    const cached = this._resolvedCache().get(name);
    if (cached) return cached;

    // Ensure templates are loaded
    if (this._templates().size === 0) {
      await this.fetchTemplates();
    }

    const template = this._templates().get(name);
    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }

    const resolved = await this.resolveInheritance(template);

    // Cache the result
    this._resolvedCache.update(cache => {
      const newCache = new Map(cache);
      newCache.set(name, resolved);
      return newCache;
    });

    return resolved;
  }

  /**
   * Resolve template inheritance recursively.
   */
  private async resolveInheritance(template: TemplateDefinition): Promise<ResolvedTemplate> {
    const parentChain: string[] = [];
    let resolvedColumns: TemplateColumn[] = [...template.columns];
    let resolvedValidators: TemplateValidator[] = [...(template.validators || [])];

    // Walk up the inheritance chain
    let currentTemplate = template;
    while (currentTemplate.extends) {
      const parentName = currentTemplate.extends;
      parentChain.unshift(parentName);

      const parent = this._templates().get(parentName);
      if (!parent) {
        console.warn(`Parent template not found: ${parentName}`);
        break;
      }

      // Merge parent columns with child columns
      resolvedColumns = this.mergeColumns(parent.columns, resolvedColumns);

      // Merge validators
      resolvedValidators = [...(parent.validators || []), ...resolvedValidators];

      currentTemplate = parent;
    }

    return {
      ...template,
      resolvedColumns,
      parentChain,
      resolvedValidators,
    };
  }

  /**
   * Merge parent and child columns, ensuring child can't be less strict.
   */
  private mergeColumns(parentColumns: TemplateColumn[], childColumns: TemplateColumn[]): TemplateColumn[] {
    const merged = new Map<string, TemplateColumn>();

    // Add parent columns first
    for (const col of parentColumns) {
      merged.set(col.name, { ...col });
    }

    // Override/add child columns
    for (const col of childColumns) {
      const parent = merged.get(col.name);
      if (parent) {
        // Merge - child can only make things stricter
        merged.set(col.name, this.mergeColumn(parent, col));
      } else {
        // New column from child
        merged.set(col.name, { ...col });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Merge a single column, ensuring child can't be less strict than parent.
   */
  private mergeColumn(parent: TemplateColumn, child: TemplateColumn): TemplateColumn {
    const requirementOrder: RequirementLevel[] = ['required', 'recommended', 'optional'];
    const parentReqIndex = requirementOrder.indexOf(parent.requirement);
    const childReqIndex = requirementOrder.indexOf(child.requirement);

    // Child can't demote requirement level
    const requirement = childReqIndex <= parentReqIndex ? child.requirement : parent.requirement;

    // Merge validators (child validators added to parent)
    const validators = [
      ...(parent.validators || []),
      ...(child.validators || []).filter(
        cv => !(parent.validators || []).some(pv => pv.validatorName === cv.validatorName)
      ),
    ];

    return {
      ...parent,
      ...child,
      requirement,
      // Child can only make these false if parent is true
      allowNotApplicable: parent.allowNotApplicable === false ? false : child.allowNotApplicable,
      allowNotAvailable: parent.allowNotAvailable === false ? false : child.allowNotAvailable,
      validators: validators.length > 0 ? validators : undefined,
    };
  }

  /**
   * Get template info list for UI display.
   */
  getTemplateInfoList(filterIds?: string[]): TemplateInfo[] {
    const templates = this.allTemplates();
    const filtered = filterIds
      ? templates.filter(t => filterIds.includes(t.name))
      : templates;

    return filtered.map(t => ({
      id: t.name,
      name: getTemplateDisplayName(t.name),
      description: t.description,
      layer: t.layer,
      usableAlone: t.usableAlone,
      extends: t.extends,
      icon: getTemplateIcon(t.name),
      status: t.status,
    }));
  }

  /**
   * Get template info for a specific template.
   */
  getTemplateInfo(name: string): TemplateInfo | null {
    const template = this._templates().get(name);
    if (!template) return null;

    return {
      id: template.name,
      name: getTemplateDisplayName(template.name),
      description: template.description,
      layer: template.layer,
      usableAlone: template.usableAlone,
      extends: template.extends,
      icon: getTemplateIcon(template.name),
      status: template.status,
    };
  }

  /**
   * Get templates that are compatible for combination.
   * Sample templates can be combined with technology templates.
   */
  getCompatibleTemplates(selectedTemplate: string): TemplateInfo[] {
    const template = this._templates().get(selectedTemplate);
    if (!template) return [];

    const allInfo = this.getTemplateInfoList();

    // Filter out mutually exclusive templates
    const mutuallyExclusive = template.mutuallyExclusiveWith || [];

    return allInfo.filter(t => {
      if (t.id === selectedTemplate) return false;
      if (mutuallyExclusive.includes(t.id)) return false;

      // Sample + technology can combine
      if (template.layer === 'sample' && t.layer === 'technology') return true;
      if (template.layer === 'technology' && t.layer === 'sample') return true;

      // Experiment can combine with sample or technology
      if (template.layer === 'experiment' && (t.layer === 'sample' || t.layer === 'technology')) return true;
      if ((template.layer === 'sample' || template.layer === 'technology') && t.layer === 'experiment') return true;

      return false;
    });
  }

  /**
   * Clear the cache.
   */
  clearCache(): void {
    this._resolvedCache.set(new Map());
    this._lastFetchTime.set(0);
  }
}
