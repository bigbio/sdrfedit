/**
 * Bridge between assistant suggestions and the wizard state.
 *
 * Two responsibilities:
 *  - summarise the wizard for the backend (`buildSnapshot`), so the assistant
 *    proposes deltas instead of resetting fields the user already filled in;
 *  - validate and apply one approved action (`applyAction`), plus render the
 *    before/after text the panel shows before the user approves it.
 *
 * Nothing here runs without an explicit user action: the panel calls
 * `applyAction` only when the user clicks Apply on a card.
 */

import { Injectable, inject } from '@angular/core';

import { WizardAction, WizardSnapshot } from '../../models/assistant';
import { LABEL_CONFIGS, WizardModification, WIZARD_STEPS, resolveRunSampleIndices } from '../../models/wizard';
import { WizardStateService } from '../wizard-state.service';
import {
  WizardActionError,
  asAcquisitionMethod,
  asBoolean,
  asCleavageAgent,
  asFactor,
  asFactors,
  asModifications,
  asNamedRunFileAssignments,
  asNumber,
  asNumberArray,
  asOntologyTerm,
  asString,
  asStringArray,
  optionalOntologyTerm,
} from './wizard-action-args';

export { WizardActionError } from './wizard-action-args';

@Injectable({ providedIn: 'root' })
export class WizardAiBridgeService {
  private readonly wizardState = inject(WizardStateService);

  /** Which wizard step index an action belongs to, for the "go to step" affordance. */
  stepIndexOf(action: WizardAction): number {
    const index = WIZARD_STEPS.findIndex(step => step.id === action.step);
    return index >= 0 ? index : 0;
  }

  // ------------------------------------------------------------------ snapshot

  buildSnapshot(): WizardSnapshot {
    const state = this.wizardState.getState();
    const stepIndex = this.wizardState.currentStep();

    const choices: Record<string, string[]> = {};
    for (const [column, list] of Object.entries(state.characteristicChoices || {})) {
      choices[column] = list.map(choice => choice.value);
    }

    const multiValueCharacteristicColumns = Object.entries(state.characteristicChoices || {})
      .filter(([, list]) => (list?.length || 0) >= 2)
      .map(([column]) => column)
      .sort();

    const enabledFactors = (state.factors || []).filter(
      factor => factor.enabled && (factor.name || '').trim()
    );
    const factorDefinitions = enabledFactors.map(factor => ({
      name: factor.name.trim(),
      values: [...(factor.values || [])],
    }));
    const multiValueFactorColumns = factorDefinitions
      .filter(factor => factor.values.length >= 2)
      .map(factor => factor.name);

    const samplesByIndex = new Map(state.samples.map(sample => [sample.index, sample]));
    const msRunSummaries = (state.msRuns || []).map(run => ({
      name: run.name,
      sampleSourceNames: resolveRunSampleIndices(run)
        .map(index => samplesByIndex.get(index)?.sourceName?.trim() || '')
        .filter(Boolean),
    }));
    const dataFileNames = state.dataFiles.map(file => file.fileName || '').filter(Boolean);
    const unassignedFileNames = state.dataFiles
      .filter(file => !file.runId && file.sampleIndex == null)
      .map(file => file.fileName || '')
      .filter(Boolean);

    return {
      currentStep: stepIndex,
      currentStepId: (WIZARD_STEPS[stepIndex]?.id as WizardSnapshot['currentStepId']) ?? null,
      sampleTemplate: state.sampleTemplate ?? null,
      technologyTemplate: state.technologyTemplate ?? null,
      experimentTemplates: state.experimentTemplates || [],
      sampleCount: state.sampleCount,
      experimentDescription: state.experimentDescription || '',
      characteristicColumns: (state.characteristicColumns || []).map(column => ({
        name: column.name,
        requirement: column.requirement || 'optional',
        ontologies: column.ontologies || [],
      })),
      characteristicChoices: choices,
      sampleSourceNames: (state.samples || []).map(sample => sample.sourceName),
      biologicalReplicates: (state.samples || []).map(sample => sample.biologicalReplicate),
      multiValueCharacteristicColumns,
      labelConfigId: state.labelConfigId ?? null,
      msRunCount: (state.msRuns || []).length,
      msRunSummaries,
      dataFileCount: state.dataFiles.length,
      dataFileNames,
      unassignedFileCount: unassignedFileNames.length,
      unassignedFileNames,
      hasFractions: state.hasFractions,
      fractionCount: state.fractionCount,
      technicalReplicates: state.technicalReplicates,
      instrument: state.instrument ? `${state.instrument.label} (${state.instrument.id})` : null,
      cleavageAgent: state.cleavageAgent ? `${state.cleavageAgent.name} (${state.cleavageAgent.msAccession})` : null,
      modifications: state.modifications.map(
        modification => `${modification.name} ${modification.type} on ${modification.targetAminoAcids}`
      ),
      factors: factorDefinitions.map(factor => factor.name),
      factorDefinitions,
      multiValueFactorColumns,
      acquisitionMethod: state.acquisitionMethod ?? null,
    };
  }

  // ------------------------------------------------------------------- preview

  /** One-line "current → proposed" description for a suggestion card. */
  previewAction(action: WizardAction): string {
    const state = this.wizardState.getState();
    const args = action.args || [];

    try {
      switch (action.op) {
        case 'setTechnologyTemplate':
          return change(state.technologyTemplate, asString(args[0]));
        case 'setSampleTemplate':
          return change(state.sampleTemplate, asString(args[0]));
        case 'setExperimentTemplates':
          return change((state.experimentTemplates || []).join(', ') || '(none)', asStringArray(args[0]).join(', '));
        case 'setSampleCount':
          return change(String(state.sampleCount), String(asNumber(args[0])));
        case 'setExperimentDescription':
          return change(truncate(state.experimentDescription), truncate(asString(args[0])));
        case 'addCharacteristicChoice': {
          const column = asString(args[0]);
          const existing = this.wizardState.getChoices(column).map(choice => choice.value);
          const value = asString(args[1]);
          const term = optionalOntologyTerm(args[2]);
          const proposed = term ? `${value} [${term.id}]` : value;
          return existing.includes(value)
            ? `${column}: "${value}" is already a candidate`
            : `${column}: add "${proposed}" (existing: ${existing.join(', ') || 'none'})`;
        }
        case 'setSampleCharacteristicValue': {
          const index = asNumber(args[0]);
          const column = asString(args[1]);
          const current = state.samples[index]?.characteristicValues?.[column] || '(empty)';
          return `sample ${index + 1} ${column}: ${current} → ${asString(args[2])}`;
        }
        case 'applyRoundRobin': {
          const column = asString(args[0]);
          const values = this.wizardState.getChoices(column).map(choice => choice.value);
          return `Distribute [${values.join(', ')}] across ${state.samples.length} samples for ${column}`;
        }
        case 'autoGenerateSourceNames':
          return `Rename ${state.samples.length} source names using pattern "${asString(args[0])}"`;
        case 'setSourceNames': {
          const names = asStringArray(args[0]);
          return `Set ${names.length} source names: ${names.slice(0, 4).join(', ')}${
            names.length > 4 ? ', …' : ''
          }`;
        }
        case 'setBiologicalReplicates': {
          const reps = asNumberArray(args[0]);
          const unique = new Set(reps).size;
          return `Set biological replicates for ${reps.length} samples (${unique} distinct number${
            unique === 1 ? '' : 's'
          }): [${reps.slice(0, 8).join(', ')}${reps.length > 8 ? ', …' : ''}]`;
        }
        case 'setLabelConfig':
          return change(labelName(state.labelConfigId), labelName(asString(args[0])));
        case 'autoPackSamplesIntoRuns':
          return `Repack ${state.samples.length} samples into MS runs using ${labelName(state.labelConfigId)}`;
        case 'replaceWithUnassignedFileNames': {
          const names = asStringArray(args[0]);
          return `Replace the file list with ${names.length} file(s): ${names.slice(0, 3).join(', ')}${
            names.length > 3 ? ', …' : ''
          }`;
        }
        case 'assignDataFilesToRun': {
          const indices = asNumberArray(args[0]);
          return `Assign ${indices.length} file(s) to run "${asString(args[1])}"`;
        }
        case 'assignFilesToRunsByName': {
          const groups = asNamedRunFileAssignments(args[0]);
          const fileCount = groups.reduce((sum, group) => sum + group.files.length, 0);
          const preview = groups
            .slice(0, 3)
            .map(group => `${group.runName}: ${group.files.length}`)
            .join(', ');
          return `Assign ${fileCount} file(s) across ${groups.length} run(s) by name (with F/Tech)${
            preview ? `, e.g. ${preview}` : ''
          }${groups.length > 3 ? ', …' : ''}`;
        }
        case 'setHasFractions':
          return change(String(state.hasFractions), String(asBoolean(args[0])));
        case 'setFractionCount':
          return change(String(state.fractionCount), String(asNumber(args[0])));
        case 'setTechnicalReplicates':
          return change(String(state.technicalReplicates), String(asNumber(args[0])));
        case 'setAcquisitionMethod':
          return change(state.acquisitionMethod, asAcquisitionMethod(args[0]));
        case 'setInstrument': {
          const term = asOntologyTerm(args[0]);
          return change(
            state.instrument ? `${state.instrument.label} (${state.instrument.id})` : null,
            `${term.label} (${term.id})`
          );
        }
        case 'setCleavageAgent': {
          const agent = asCleavageAgent(args[0]);
          return change(
            state.cleavageAgent ? `${state.cleavageAgent.name} (${state.cleavageAgent.msAccession})` : null,
            `${agent.name} (${agent.msAccession})`
          );
        }
        case 'setModifications': {
          const modifications = asModifications(args[0]);
          return change(
            state.modifications.map(describeModification).join('; ') || '(none)',
            modifications.map(describeModification).join('; ') || '(none)'
          );
        }
        case 'setFactors': {
          const factors = asFactors(args[0]);
          return change(
            state.factors
              .filter(factor => factor.enabled)
              .map(factor => `${factor.name}[${(factor.values || []).join('|')}]`)
              .join(', ') || '(none)',
            factors
              .filter(factor => factor.enabled)
              .map(factor => `${factor.name}[${factor.values.join('|')}]`)
              .join(', ') || '(none)'
          );
        }
        case 'addFactor': {
          const factor = asFactor(args[0]);
          return `Add factor "${factor.name}" with values [${factor.values.join(', ') || 'none'}]`;
        }
        case 'addFactorValue':
          return `Add candidate "${asString(args[1])}" to factor "${asString(args[0])}"`;
        case 'setFactorColumnValues': {
          const factorName = asString(args[0]);
          const values = asStringArray(args[1]);
          return `Set factor "${factorName}" for ${values.length} samples: ${values.slice(0, 4).join(', ')}${
            values.length > 4 ? ', …' : ''
          }`;
        }
        case 'setSampleFactorValue': {
          const index = asNumber(args[0]);
          const factorName = asString(args[1]);
          const current = state.samples[index]?.factorValues?.[factorName] || '(empty)';
          return `sample ${index + 1} factor[${factorName}]: ${current} → ${asString(args[2])}`;
        }
        default:
          return `Unsupported operation "${action.op}"`;
      }
    } catch (error) {
      return error instanceof Error ? `Invalid suggestion: ${error.message}` : 'Invalid suggestion';
    }
  }

  // --------------------------------------------------------------------- apply

  /** Validate and apply one approved action. Throws `WizardActionError` on bad input. */
  async applyAction(action: WizardAction): Promise<void> {
    const args = action.args || [];

    switch (action.op) {
      case 'setTechnologyTemplate':
        this.wizardState.setTechnologyTemplate(asString(args[0]));
        await this.wizardState.refreshCharacteristicColumns();
        return;

      case 'setSampleTemplate':
        this.wizardState.setSampleTemplate(asString(args[0]));
        await this.wizardState.refreshCharacteristicColumns();
        return;

      case 'setExperimentTemplates':
        this.wizardState.setExperimentTemplates(asStringArray(args[0]));
        await this.wizardState.refreshCharacteristicColumns();
        return;

      case 'setSampleCount':
        this.wizardState.setSampleCount(asNumber(args[0]));
        return;

      case 'setExperimentDescription':
        this.wizardState.setExperimentDescription(asString(args[0]));
        return;

      case 'addCharacteristicChoice': {
        const column = asString(args[0]);
        const value = asString(args[1]);
        if (!this.wizardState.getState().characteristicColumns?.length) {
          await this.wizardState.refreshCharacteristicColumns();
        }
        this.wizardState.addCharacteristicChoice(column, value, optionalOntologyTerm(args[2]));
        return;
      }

      case 'setSampleCharacteristicValue': {
        this.wizardState.ensureSamplesInitialized();
        const index = asNumber(args[0]);
        const samples = this.wizardState.getState().samples;
        if (index < 0 || index >= samples.length) {
          throw new WizardActionError(
            `Sample index ${index} is out of range (there are ${samples.length} samples).`
          );
        }
        this.wizardState.setSampleCharacteristicValue(index, asString(args[1]), asString(args[2]));
        return;
      }

      case 'applyRoundRobin': {
        const column = asString(args[0]);
        if (this.wizardState.getChoices(column).length === 0) {
          throw new WizardActionError(`No candidate values exist for ${column} yet.`);
        }
        this.wizardState.ensureSamplesInitialized();
        this.wizardState.applyRoundRobin(column);
        return;
      }

      case 'autoGenerateSourceNames':
        this.wizardState.ensureSamplesInitialized();
        this.wizardState.autoGenerateSourceNames(asString(args[0]) || 'sample_{n}');
        return;

      case 'setSourceNames': {
        this.wizardState.ensureSamplesInitialized();
        const names = asStringArray(args[0]);
        const samples = this.wizardState.getState().samples;
        if (names.length !== samples.length) {
          throw new WizardActionError(
            `Expected ${samples.length} source names (one per sample), got ${names.length}.`
          );
        }
        this.wizardState.setSamples(
          samples.map((sample, index) => ({
            ...sample,
            sourceName: names[index],
            index: index + 1,
          }))
        );
        this.wizardState.syncCharacteristicAssignments();
        return;
      }

      case 'setBiologicalReplicates': {
        this.wizardState.ensureSamplesInitialized();
        const reps = asNumberArray(args[0]);
        const samples = this.wizardState.getState().samples;
        if (reps.length !== samples.length) {
          throw new WizardActionError(
            `Expected ${samples.length} biological replicate numbers, got ${reps.length}.`
          );
        }
        if (reps.some(value => value < 1)) {
          throw new WizardActionError('Biological replicate numbers must be integers >= 1.');
        }
        this.wizardState.setSamples(
          samples.map((sample, index) => ({
            ...sample,
            biologicalReplicate: reps[index],
          }))
        );
        return;
      }

      case 'setLabelConfig': {
        const configId = asString(args[0]);
        if (!LABEL_CONFIGS.some(config => config.id === configId)) {
          throw new WizardActionError(
            `Unknown plex kit "${configId}". Expected one of: ${LABEL_CONFIGS.map(c => c.id).join(', ')}.`
          );
        }
        this.wizardState.setLabelConfig(configId);
        return;
      }

      case 'autoPackSamplesIntoRuns':
        this.wizardState.ensureSamplesInitialized();
        this.wizardState.autoPackSamplesIntoRuns();
        return;

      case 'replaceWithUnassignedFileNames':
        this.wizardState.replaceWithUnassignedFileNames(asStringArray(args[0]));
        return;

      case 'assignDataFilesToRun': {
        const indices = asNumberArray(args[0]);
        const runId = this.resolveRunId(asString(args[1]));
        const fileCount = this.wizardState.getState().dataFiles.length;
        const outOfRange = indices.filter(index => index < 0 || index >= fileCount);
        if (outOfRange.length) {
          throw new WizardActionError(
            `File indices ${outOfRange.join(', ')} are out of range (there are ${fileCount} files).`
          );
        }
        this.wizardState.assignDataFilesToRun(indices, runId);
        return;
      }

      case 'assignFilesToRunsByName': {
        const groups = asNamedRunFileAssignments(args[0]);
        const files = this.wizardState.getState().dataFiles;
        const knownNames = new Set(files.map(file => (file.fileName || '').trim()).filter(Boolean));
        const missing: string[] = [];
        const resolved = groups.map(group => {
          const runId = this.resolveRunId(group.runName);
          for (const file of group.files) {
            if (!knownNames.has(file.fileName)) missing.push(file.fileName);
          }
          return {
            runId,
            files: group.files,
          };
        });
        if (missing.length) {
          const shown = missing.slice(0, 5).join(', ');
          throw new WizardActionError(
            `Unknown file name(s) not in the wizard pool (${missing.length}): ${shown}${
              missing.length > 5 ? ', …' : ''
            }. Apply replaceWithUnassignedFileNames first, or use exact names from the snapshot.`
          );
        }
        this.wizardState.assignDataFilesToRunsByName(resolved);
        return;
      }

      case 'setHasFractions':
        this.wizardState.setHasFractions(asBoolean(args[0]));
        return;

      case 'setFractionCount':
        this.wizardState.setFractionCount(asNumber(args[0]));
        return;

      case 'setTechnicalReplicates':
        this.wizardState.setTechnicalReplicates(asNumber(args[0]));
        return;

      case 'setAcquisitionMethod':
        this.wizardState.setAcquisitionMethod(asAcquisitionMethod(args[0]));
        return;

      case 'setInstrument':
        this.wizardState.setInstrument(asOntologyTerm(args[0]));
        return;

      case 'setCleavageAgent':
        this.wizardState.setCleavageAgent(asCleavageAgent(args[0]));
        return;

      case 'setModifications':
        this.wizardState.setModifications(asModifications(args[0]));
        return;

      case 'setFactors':
        this.wizardState.setFactors(asFactors(args[0]));
        return;

      case 'addFactor':
        this.wizardState.addFactor(asFactor(args[0]));
        return;

      case 'addFactorValue':
        this.wizardState.addFactorValueByName(asString(args[0]), asString(args[1]));
        return;

      case 'setFactorColumnValues': {
        const factorName = asString(args[0]);
        const values = asStringArray(args[1]);
        const count = this.wizardState.getState().samples.length;
        if (values.length !== count) {
          throw new WizardActionError(
            `Expected ${count} factor values for "${factorName}" (one per sample), got ${values.length}.`
          );
        }
        this.wizardState.setFactorColumnValues(factorName, values);
        return;
      }

      case 'setSampleFactorValue':
        this.wizardState.setSampleFactorValue(asNumber(args[0]), asString(args[1]), asString(args[2]));
        return;

      default:
        throw new WizardActionError(`Unsupported operation "${action.op}".`);
    }
  }

  /** Accept either a run id or a run name, since the model sees names in prose. */
  private resolveRunId(candidate: string): string {
    const runs = this.wizardState.getState().msRuns || [];
    const byId = runs.find(run => run.id === candidate);
    if (byId) return byId.id;

    const byName = runs.find(run => run.name.toLowerCase() === candidate.toLowerCase());
    if (byName) return byName.id;

    throw new WizardActionError(
      `No MS run matches "${candidate}". Existing runs: ${runs.map(run => run.name).join(', ') || 'none'}.`
    );
  }
}

// --------------------------------------------------------------------- helpers

function change(current: string | null | undefined, proposed: string): string {
  return `${current || '(empty)'} → ${proposed}`;
}

function truncate(value: string | null | undefined, limit = 80): string {
  if (!value) return '(empty)';
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function labelName(configId: string | null | undefined): string {
  return LABEL_CONFIGS.find(config => config.id === configId)?.name || configId || '(none)';
}

function describeModification(modification: WizardModification): string {
  const accession = modification.unimodAccession ? ` ${modification.unimodAccession}` : '';
  return `${modification.name}${accession} (${modification.type}, ${modification.targetAminoAcids})`;
}
