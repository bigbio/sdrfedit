/**
 * Prompt Service
 *
 * Manages system and user prompts for LLM-based SDRF analysis.
 * Provides structured prompts that guide the LLM to generate
 * properly formatted recommendations.
 */

import { LlmMessage, AnalysisFocusArea, SdrfAnalysisContext, ColumnContext, AnalysisIssue } from '../../models/llm';
import { ContextBuilderService } from './context-builder.service';

/**
 * System prompt for SDRF analysis.
 * This provides the LLM with context about SDRF format and expected output.
 */
const SDRF_SYSTEM_PROMPT = `You are an expert in proteomics data annotation, specifically the SDRF (Sample and Data Relationship Format) specification used in the PRIDE database and proteomics community.

## SDRF Format Overview

SDRF files are tab-separated tables describing experimental samples and their relationship to data files. Key concepts:

1. **Reserved Values**: The following special values are allowed in SDRF:
   - "not available" - Information exists but is not known/provided
   - "not applicable" - The field does not apply to this sample
   - "anonymized" - Information hidden for privacy
   - "pooled" - Sample is a pool of multiple sources

2. **Column Types**:
   - \`source name\`: Unique identifier for biological samples
   - \`characteristics[...]\`: Sample properties (organism, tissue, etc.)
   - \`factor value[...]\`: Experimental variables being studied
   - \`comment[...]\`: Additional metadata
   - \`assay name\`: Unique identifier for data acquisition runs

3. **Ontology Requirements**: Many columns require ontology-controlled terms:
   - \`characteristics[organism]\`: NCBI Taxonomy (e.g., "homo sapiens", "mus musculus")
   - \`characteristics[organism part]\`: UBERON or BTO (e.g., "liver", "brain")
   - \`characteristics[cell type]\`: CL or BTO (e.g., "hepatocyte", "T cell")
   - \`characteristics[disease]\`: EFO, MONDO, or DOID
   - \`comment[instrument]\`: MS ontology (e.g., "Q Exactive HF", "Orbitrap Exploris")

4. **Consistency**: Values should be consistent across samples (e.g., same spelling, capitalization).

## Your Task

Analyze the SDRF data provided and suggest improvements. Focus on:
1. Filling "not available" or empty values when the information can be inferred
2. Suggesting proper ontology terms for columns that require them
3. Identifying and fixing inconsistencies (similar values with different spellings)
4. Ensuring data quality and completeness

## Output Format

You MUST respond with a valid JSON object containing recommendations. The format is:

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
      "reasoning": "Brief explanation of why this change is recommended"
    }
  ],
  "summary": "Brief overall summary of the analysis"
}
\`\`\`

## Important Guidelines

1. Only suggest changes you are confident about
2. For ontology terms, use the common label (e.g., "homo sapiens" not "NCBITaxon:9606")
3. Be conservative - don't guess at values you can't reasonably infer
4. Consider the context of other values in the column when making suggestions
5. If a column already has mostly valid values, use those as a guide for filling missing ones
6. For consistency fixes, prefer the most common or most standard form`;

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
   */
  buildAnalysisMessages(
    context: SdrfAnalysisContext,
    additionalInstructions?: string
  ): LlmMessage[] {
    const messages: LlmMessage[] = [];

    // System prompt
    messages.push({
      role: 'system',
      content: SDRF_SYSTEM_PROMPT,
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
   */
  getSystemPrompt(): string {
    return SDRF_SYSTEM_PROMPT;
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
