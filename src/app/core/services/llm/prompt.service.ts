/**
 * Prompt Service
 *
 * Manages system and user prompts for LLM-based SDRF analysis.
 * Provides structured prompts that guide the LLM to generate
 * properly formatted recommendations.
 */

import { LlmMessage, AnalysisFocusArea, SdrfAnalysisContext, ColumnContext, AnalysisIssue } from '../../models/llm';
import { ContextBuilderService } from './context-builder.service';
import { ColumnQuality } from '../column-quality.service';

/**
 * Detected sample type for template selection.
 */
export type SampleType = 'human' | 'cell-line' | 'vertebrate' | 'other';

/**
 * Quality issues to include in prompts.
 */
export interface QualityIssueForPrompt {
  column: string;
  reason: string;
}

/**
 * System prompt for SDRF analysis.
 * This provides the LLM with context about SDRF format and expected output.
 */
const SDRF_SYSTEM_PROMPT = `You are an expert in proteomics data annotation, specifically the SDRF (Sample and Data Relationship Format) specification used in the PRIDE database and proteomics community.

## SDRF Format Rules

### Required Columns (ALL experiments):
- source name: Unique sample identifier
- characteristics[organism]: NCBI Taxonomy lowercase (e.g., "homo sapiens", "mus musculus")
- characteristics[organism part]: UBERON term lowercase (e.g., "liver", "blood plasma")
- characteristics[biological replicate]: Integer starting from 1 per condition
- assay name: Unique MS run identifier
- comment[instrument]: MS ontology term (e.g., "Q Exactive HF")
- comment[data file]: Raw file name
- comment[label]: Label type (e.g., "label free sample", "TMT126")
- technology type: Usually "proteomic profiling by mass spectrometry"

### Reserved Words (MUST use instead of empty cells):
- "not available": Value unknown or not recorded
- "not applicable": Concept doesn't apply (e.g., age for synthetic sample)
- "anonymized": Value redacted for privacy
- "pooled": Sample is mixture of multiple sources

### Ontology Requirements:
- characteristics[organism]: NCBI Taxonomy
- characteristics[organism part]: UBERON (for mammals), BTO
- characteristics[cell type]: Cell Ontology (CL)
- characteristics[disease]: MONDO (preferred), EFO, or DOID
- characteristics[cell line]: Free text (e.g., "HeLa", "HEK293")
- comment[instrument]: PSI-MS ontology

### Common Mistakes to AVOID:
- ❌ "control" for healthy samples → ✅ Use "normal"
- ❌ "characteristics[tissue]" → ✅ Use "characteristics[organism part]"
- ❌ Empty cells → ✅ Use reserved words
- ❌ "Characteristics[...]" → ✅ Use "characteristics[...]" (lowercase)
- ❌ "blood" → ✅ Use "blood plasma" or specific component
- ❌ "NA", "N/A", "Unknown" → ✅ Use "not available"
- ❌ Uppercase values → ✅ Use lowercase (e.g., "homo sapiens" not "Homo Sapiens")

### Age Format (for human samples):
- Exact: 25Y, 6M, 30D (years, months, days)
- Range: 40Y-50Y
- Greater/Less: >18Y, <65Y

### Disease Column Rules:
- Use "normal" for healthy samples (NOT "control" or "healthy")
- Use MONDO terms for diseases (e.g., "breast carcinoma", "diabetes mellitus")

## Output Format

You MUST respond with a valid JSON object containing recommendations:

\`\`\`json
{
  "recommendations": [
    {
      "type": "fill_value" | "correct_value" | "ontology_suggestion" | "consistency_fix",
      "column": "column name",
      "columnIndex": 0,
      "sampleIndices": [1, 2, 3],
      "currentValue": "current value or empty",
      "suggestedValue": "suggested value",
      "confidence": "high" | "medium" | "low",
      "reasoning": "Brief explanation"
    }
  ],
  "summary": "Brief overall summary"
}
\`\`\`

## Important Guidelines

1. Only suggest changes you are confident about
2. For ontology terms, use the common label in lowercase
3. Be conservative - don't guess at values you can't reasonably infer
4. For consistency fixes, prefer the most common or most standard form
5. Always replace "control" with "normal" for disease columns
6. Standardize null values to "not available" or "not applicable"`;

/**
 * Human-specific prompt additions
 */
const HUMAN_TEMPLATE_PROMPT = `

## Human Sample Requirements

REQUIRED columns for human data:
1. characteristics[disease] - Use MONDO terms. For healthy: "normal" (NEVER "control")
2. characteristics[age] - Format: 25Y, 6M, 30D, or ranges like 40Y-50Y, or ">18Y"
3. characteristics[sex] - "male" or "female" (lowercase)

RECOMMENDED columns:
- characteristics[individual] - Pseudonymized patient ID (e.g., "patient_001")
- characteristics[ancestry category] - "African", "European", "East Asian", "South Asian", "American"

For CLINICAL studies also consider:
- characteristics[tumor stage] - TNM format: "T1N0M0", "pT2pN1M0"
- characteristics[treatment] - Therapy type from NCIT
- characteristics[compound] - Drug name if applicable
- characteristics[dose] - Format: "100 nanomolar", "10 micromolar"`;

/**
 * Cell line-specific prompt additions
 */
const CELL_LINE_TEMPLATE_PROMPT = `

## Cell Line Requirements

REQUIRED:
- characteristics[cell line] - Cell line name (e.g., "HeLa", "HEK293", "MCF-7")

For organism part: Use tissue of origin (e.g., "cervix" for HeLa) or "not applicable"
For disease: Use disease the cell line models or "normal" for non-disease lines
For sex: Use "female" for HeLa, "male" for HEK293, etc. based on cell line origin`;

/**
 * Vertebrate (non-human) prompt additions
 */
const VERTEBRATE_TEMPLATE_PROMPT = `

## Vertebrate (Non-Human) Sample Requirements

REQUIRED:
- characteristics[disease] - MONDO term or "normal" for healthy animals

RECOMMENDED:
- characteristics[strain/breed] - e.g., "C57BL/6", "Sprague-Dawley", "BALB/c"
- characteristics[developmental stage] - e.g., "adult", "embryonic day 14", "8 weeks"
- characteristics[sex] - "male", "female", or "hermaphrodite"

Common organisms:
- Mouse: "mus musculus"
- Rat: "rattus norvegicus"
- Zebrafish: "danio rerio"`;

/**
 * Quality issues prompt section
 */
function buildQualityIssuesPrompt(issues: Array<{column: string; reason: string}>): string {
  if (issues.length === 0) return '';

  return `

## Quality Issues Found in This File:
${issues.map(i => `- ${i.column}: ${i.reason}`).join('\n')}

Please address these issues in your recommendations.`;
}

/**
 * Prompt Service
 *
 * Generates prompts for LLM analysis of SDRF data.
 */
export class PromptService {
  private contextBuilder: ContextBuilderService;

  constructor(contextBuilder?: ContextBuilderService) {
    this.contextBuilder = contextBuilder || new ContextBuilderService();
  }

  /**
   * Builds the complete message array for an analysis request.
   * Automatically detects sample type and includes relevant template prompts.
   */
  buildAnalysisMessages(
    context: SdrfAnalysisContext,
    additionalInstructions?: string,
    qualityIssues?: QualityIssueForPrompt[]
  ): LlmMessage[] {
    const messages: LlmMessage[] = [];

    // Detect sample types from the context
    const sampleTypes = this.detectSampleTypes(context);

    // Build system prompt with template-specific additions
    let systemPrompt = SDRF_SYSTEM_PROMPT;

    // Add template-specific rules based on detected sample types
    if (sampleTypes.includes('human')) {
      systemPrompt += HUMAN_TEMPLATE_PROMPT;
    }
    if (sampleTypes.includes('cell-line')) {
      systemPrompt += CELL_LINE_TEMPLATE_PROMPT;
    }
    if (sampleTypes.includes('vertebrate')) {
      systemPrompt += VERTEBRATE_TEMPLATE_PROMPT;
    }

    // Add quality issues if provided
    if (qualityIssues && qualityIssues.length > 0) {
      systemPrompt += buildQualityIssuesPrompt(qualityIssues);
    }

    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // User prompt with context
    const userPrompt = this.buildUserPrompt(context, additionalInstructions);
    messages.push({
      role: 'user',
      content: userPrompt,
    });

    return messages;
  }

  /**
   * Detects sample types from the analysis context.
   * Returns array of detected types for template selection.
   */
  detectSampleTypes(context: SdrfAnalysisContext): SampleType[] {
    const types: SampleType[] = [];

    // Find organism column
    const organismCol = context.columns.find(
      (c: ColumnContext) => c.name.toLowerCase() === 'characteristics[organism]'
    );

    // Find cell line column
    const cellLineCol = context.columns.find(
      (c: ColumnContext) => c.name.toLowerCase() === 'characteristics[cell line]'
    );

    if (organismCol) {
      const organisms = organismCol.uniqueValues.map(v => v.toLowerCase());

      // Check for human samples
      if (organisms.some(o => o.includes('homo sapiens') || o.includes('human'))) {
        types.push('human');
      }

      // Check for other vertebrates
      const vertebrates = [
        'mus musculus', 'mouse',
        'rattus norvegicus', 'rat',
        'danio rerio', 'zebrafish',
        'sus scrofa', 'pig',
        'bos taurus', 'cow', 'cattle',
        'gallus gallus', 'chicken',
        'ovis aries', 'sheep',
        'canis', 'dog',
        'felis catus', 'cat',
      ];

      if (organisms.some(o => vertebrates.some(v => o.includes(v)))) {
        types.push('vertebrate');
      }
    }

    // Check for cell line data
    if (cellLineCol && cellLineCol.uniqueValues.length > 0) {
      const hasActualCellLines = cellLineCol.uniqueValues.some(
        v => v && v.toLowerCase() !== 'not available' && v.toLowerCase() !== 'not applicable'
      );
      if (hasActualCellLines) {
        types.push('cell-line');
      }
    }

    // Default to 'other' if no specific type detected
    if (types.length === 0) {
      types.push('other');
    }

    return types;
  }

  /**
   * Converts ColumnQuality results to QualityIssueForPrompt format.
   */
  convertQualityToPromptIssues(qualities: ColumnQuality[]): QualityIssueForPrompt[] {
    return qualities
      .filter(q => q.action === 'review' || q.action === 'remove')
      .map(q => ({
        column: q.name,
        reason: q.reason + (q.suggestedFix ? ` (Fix: ${q.suggestedFix})` : ''),
      }));
  }

  /**
   * Builds the user prompt with table context.
   */
  buildUserPrompt(
    context: SdrfAnalysisContext,
    additionalInstructions?: string
  ): string {
    const parts: string[] = [];

    parts.push('Please analyze the following SDRF data and provide recommendations for improvement.');
    parts.push('');

    // Include focus areas
    parts.push('**Analysis Focus:**');
    for (const area of context.focusAreas) {
      parts.push(`- ${this.formatFocusArea(area)}`);
    }
    parts.push('');

    // Add the context
    parts.push('**SDRF Data:**');
    parts.push('');
    parts.push(this.contextBuilder.contextToString(context));

    // Additional instructions
    if (additionalInstructions) {
      parts.push('');
      parts.push('**Additional Instructions:**');
      parts.push(additionalInstructions);
    }

    // Reminder about output format
    parts.push('');
    parts.push('Remember to respond with a valid JSON object containing your recommendations.');

    return parts.join('\n');
  }

  /**
   * Builds a focused prompt for a specific column.
   */
  buildColumnFocusedPrompt(
    context: SdrfAnalysisContext,
    columnName: string
  ): LlmMessage[] {
    const columnContext = context.columns.find(
      (c: ColumnContext) => c.name.toLowerCase() === columnName.toLowerCase()
    );

    if (!columnContext) {
      throw new Error(`Column "${columnName}" not found in context`);
    }

    const messages: LlmMessage[] = [];

    // System prompt
    messages.push({
      role: 'system',
      content: SDRF_SYSTEM_PROMPT,
    });

    // Focused user prompt
    const parts: string[] = [];
    parts.push(`Please analyze the "${columnName}" column and provide recommendations.`);
    parts.push('');

    parts.push('**Column Details:**');
    parts.push(`- Name: ${columnContext.name}`);
    parts.push(`- Type: ${columnContext.type}`);
    parts.push(`- Required: ${columnContext.isRequired ? 'Yes' : 'No'}`);

    if (columnContext.ontologies && columnContext.ontologies.length > 0) {
      parts.push(`- Expected Ontologies: ${columnContext.ontologies.join(', ')}`);
    }

    if (columnContext.examples && columnContext.examples.length > 0) {
      parts.push(`- Valid Examples: ${columnContext.examples.join(', ')}`);
    }

    parts.push('');
    parts.push('**Current Values:**');
    parts.push(`- Unique values: ${columnContext.uniqueValues.join(', ') || 'None'}`);
    parts.push(`- "not available" count: ${columnContext.notAvailableCount}`);
    parts.push(`- Empty count: ${columnContext.emptyCount}`);

    // Find issues for this column
    const columnIssues = context.issues.filter(
      (i: AnalysisIssue) => i.column.toLowerCase() === columnName.toLowerCase()
    );

    if (columnIssues.length > 0) {
      parts.push('');
      parts.push('**Identified Issues:**');
      for (const issue of columnIssues) {
        parts.push(`- ${issue.type}: ${issue.details} (${issue.sampleIndices.length} samples)`);
      }
    }

    parts.push('');
    parts.push('Respond with JSON recommendations for this column only.');

    messages.push({
      role: 'user',
      content: parts.join('\n'),
    });

    return messages;
  }

  /**
   * Builds a prompt for validating ontology terms.
   */
  buildOntologyValidationPrompt(
    columnName: string,
    values: string[],
    ontologies: string[]
  ): LlmMessage[] {
    const messages: LlmMessage[] = [];

    messages.push({
      role: 'system',
      content: `You are an expert in biomedical ontologies. Your task is to validate and suggest correct ontology terms.

For each value provided, determine:
1. If it's a valid term from the specified ontologies
2. If not, suggest the correct term

Respond with JSON:
\`\`\`json
{
  "validations": [
    {
      "originalValue": "input value",
      "isValid": true/false,
      "suggestedValue": "correct term if invalid",
      "confidence": "high" | "medium" | "low",
      "reasoning": "brief explanation"
    }
  ]
}
\`\`\``,
    });

    const userContent = `Validate these values for the "${columnName}" column.

Expected ontologies: ${ontologies.join(', ')}

Values to validate:
${values.map((v, i) => `${i + 1}. "${v}"`).join('\n')}`;

    messages.push({
      role: 'user',
      content: userContent,
    });

    return messages;
  }

  /**
   * Builds a prompt for inferring missing values.
   */
  buildValueInferencePrompt(
    columnName: string,
    knownValues: Array<{ sampleIndex: number; value: string }>,
    missingSampleIndices: number[],
    relatedColumns?: Array<{ name: string; values: Map<number, string> }>
  ): LlmMessage[] {
    const messages: LlmMessage[] = [];

    messages.push({
      role: 'system',
      content: `You are an expert in proteomics data annotation. Your task is to infer missing values based on:
1. Other values in the same column
2. Values in related columns for the same samples
3. Common patterns in proteomics experiments

Be conservative - only suggest values you are reasonably confident about.

Respond with JSON:
\`\`\`json
{
  "inferences": [
    {
      "sampleIndex": 1,
      "suggestedValue": "inferred value",
      "confidence": "high" | "medium" | "low",
      "reasoning": "why this value was inferred"
    }
  ],
  "cannotInfer": [2, 3]  // sample indices where inference is not possible
}
\`\`\``,
    });

    const parts: string[] = [];
    parts.push(`Infer missing values for the "${columnName}" column.`);
    parts.push('');

    parts.push('**Known values in this column:**');
    for (const kv of knownValues.slice(0, 20)) {
      parts.push(`- Sample ${kv.sampleIndex}: "${kv.value}"`);
    }
    if (knownValues.length > 20) {
      parts.push(`... and ${knownValues.length - 20} more`);
    }

    parts.push('');
    parts.push(`**Samples missing values:** ${missingSampleIndices.slice(0, 50).join(', ')}`);
    if (missingSampleIndices.length > 50) {
      parts.push(`... and ${missingSampleIndices.length - 50} more`);
    }

    if (relatedColumns && relatedColumns.length > 0) {
      parts.push('');
      parts.push('**Related column values for missing samples:**');
      for (const rc of relatedColumns) {
        parts.push(`\n${rc.name}:`);
        for (const sampleIdx of missingSampleIndices.slice(0, 10)) {
          const value = rc.values.get(sampleIdx);
          if (value) {
            parts.push(`- Sample ${sampleIdx}: "${value}"`);
          }
        }
      }
    }

    messages.push({
      role: 'user',
      content: parts.join('\n'),
    });

    return messages;
  }

  /**
   * Gets the system prompt for reference.
   * Optionally includes template-specific prompts based on sample types.
   */
  getSystemPrompt(sampleTypes?: SampleType[], qualityIssues?: QualityIssueForPrompt[]): string {
    let prompt = SDRF_SYSTEM_PROMPT;

    if (sampleTypes) {
      if (sampleTypes.includes('human')) {
        prompt += HUMAN_TEMPLATE_PROMPT;
      }
      if (sampleTypes.includes('cell-line')) {
        prompt += CELL_LINE_TEMPLATE_PROMPT;
      }
      if (sampleTypes.includes('vertebrate')) {
        prompt += VERTEBRATE_TEMPLATE_PROMPT;
      }
    }

    if (qualityIssues && qualityIssues.length > 0) {
      prompt += buildQualityIssuesPrompt(qualityIssues);
    }

    return prompt;
  }

  /**
   * Gets the base SDRF rules prompt without template additions.
   */
  getBaseSystemPrompt(): string {
    return SDRF_SYSTEM_PROMPT;
  }

  /**
   * Gets template-specific prompt additions.
   */
  getTemplatePrompt(sampleType: SampleType): string {
    switch (sampleType) {
      case 'human':
        return HUMAN_TEMPLATE_PROMPT;
      case 'cell-line':
        return CELL_LINE_TEMPLATE_PROMPT;
      case 'vertebrate':
        return VERTEBRATE_TEMPLATE_PROMPT;
      default:
        return '';
    }
  }

  /**
   * Builds a chat system prompt with example context for actionable suggestions.
   *
   * @param tableContext - Brief context about the current table
   * @param qualityContext - Quality issues found in the table
   * @param examplesContext - Example values from annotated datasets
   */
  buildChatSystemPrompt(
    tableContext: string,
    qualityContext: string,
    examplesContext: string
  ): string {
    return `You are an SDRF file expert. Help users fix proteomics metadata.

SDRF RULES:
- Use "normal" for healthy samples (never "control")
- Use "not available" for missing data (never "NA" or "unknown")
- Values must be lowercase (e.g., "homo sapiens", "male", "adult")
- Age format: 25Y, 6M, 30D

TABLE INFO:
${tableContext}

ISSUES FOUND:
${qualityContext}
${examplesContext ? `\nEXAMPLE VALUES:\n${examplesContext}` : ''}

RESPONSE FORMAT - You MUST reply with this exact JSON structure:
{"text": "your explanation", "suggestions": [{"type": "set_value", "column": "column_name", "sampleIndices": [1,2,3], "suggestedValue": "value", "description": "what this does", "confidence": "high"}]}

RULES:
- type must be: set_value, remove_column, rename_column, or add_column
- sampleIndices are 1-based row numbers (1 = first data row)
- confidence: high, medium, or low
- If no fix needed, use empty array: {"text": "explanation", "suggestions": []}

Reply ONLY with valid JSON. No markdown, no explanation outside JSON.`;
  }

  /**
   * Builds the chat system prompt for non-JSON responses (fallback).
   */
  buildSimpleChatPrompt(tableContext: string, qualityContext: string): string {
    return `You are an expert assistant for SDRF (Sample and Data Relationship Format) files in proteomics.

Current table context:
${tableContext}

Quality analysis:
${qualityContext}

Help the user with their questions about their SDRF data. Provide specific, actionable advice. Keep responses concise.`;
  }

  // ============ Private Methods ============

  /**
   * Formats a focus area for display.
   */
  private formatFocusArea(area: AnalysisFocusArea): string {
    const labels: Record<AnalysisFocusArea, string> = {
      fill_missing: 'Fill missing and "not available" values',
      validate_ontology: 'Validate and suggest ontology terms',
      check_consistency: 'Check data consistency',
      all: 'Comprehensive analysis',
    };
    return labels[area];
  }
}

// Export singleton instance
export const promptService = new PromptService();
