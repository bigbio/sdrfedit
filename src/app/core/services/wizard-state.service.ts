/**
 * Wizard State Service
 *
 * Signal-based state management for the SDRF Creation Wizard.
 */

import { Injectable, signal, computed } from '@angular/core';
import {
  WizardState,
  WizardTemplate,
  WizardSampleEntry,
  WizardModification,
  WizardCleavageAgent,
  WizardDataFile,
  OntologyTerm,
  WIZARD_STEPS,
  LABEL_CONFIGS,
  createEmptyWizardState,
} from '../models/wizard';

@Injectable({ providedIn: 'root' })
export class WizardStateService {
  // ============ Core State ============

  private readonly _state = signal<WizardState>(createEmptyWizardState());
  private readonly _currentStep = signal<number>(0);

  /** Read-only state accessor */
  readonly state = this._state.asReadonly();

  /** Current step index (0-based) */
  readonly currentStep = this._currentStep.asReadonly();

  /** Total number of steps */
  readonly totalSteps = WIZARD_STEPS.length;

  /** Step configuration */
  readonly steps = WIZARD_STEPS;

  // ============ Computed Values ============

  /** Current step configuration */
  readonly currentStepConfig = computed(() => {
    return WIZARD_STEPS[this._currentStep()];
  });

  /** Selected template */
  readonly template = computed(() => this._state().template);

  /** Number of samples */
  readonly sampleCount = computed(() => this._state().sampleCount);

  /** Sample entries */
  readonly samples = computed(() => this._state().samples);

  /** Selected label configuration */
  readonly labelConfig = computed(() => {
    const configId = this._state().labelConfigId;
    return LABEL_CONFIGS.find(c => c.id === configId) || LABEL_CONFIGS[0];
  });

  /** Whether fractionation is enabled */
  readonly hasFractions = computed(() => this._state().hasFractions);

  /** Number of fractions */
  readonly fractionCount = computed(() => this._state().fractionCount);

  /** Technical replicates count */
  readonly technicalReplicates = computed(() => this._state().technicalReplicates);

  /** Data files */
  readonly dataFiles = computed(() => this._state().dataFiles);

  /** Selected modifications */
  readonly modifications = computed(() => this._state().modifications);

  // ============ Validation Computed ============

  /** Whether Step 1 is valid */
  readonly isStep1Valid = computed(() => {
    const state = this._state();
    return state.template !== null && state.sampleCount >= 1;
  });

  /** Whether Step 2 is valid */
  readonly isStep2Valid = computed(() => {
    const state = this._state();
    return (
      state.organism !== null &&
      state.disease !== null &&
      state.organismPart !== null
    );
  });

  /** Whether Step 3 is valid */
  readonly isStep3Valid = computed(() => {
    const state = this._state();
    return (
      state.samples.length > 0 &&
      state.samples.every(s => s.sourceName.trim().length > 0)
    );
  });

  /** Whether Step 4 is valid */
  readonly isStep4Valid = computed(() => {
    const state = this._state();
    return state.labelConfigId !== '' || state.customLabels.length > 0;
  });

  /** Whether Step 5 is valid */
  readonly isStep5Valid = computed(() => {
    const state = this._state();
    return state.instrument !== null && state.cleavageAgent !== null;
  });

  /** Whether Step 6 is valid */
  readonly isStep6Valid = computed(() => {
    const state = this._state();
    return state.dataFiles.length > 0;
  });

  /** Whether all steps are valid */
  readonly isAllValid = computed(() => {
    return (
      this.isStep1Valid() &&
      this.isStep2Valid() &&
      this.isStep3Valid() &&
      this.isStep4Valid() &&
      this.isStep5Valid() &&
      this.isStep6Valid()
    );
  });

  /** Whether current step is valid */
  readonly isCurrentStepValid = computed(() => {
    const step = this._currentStep();
    switch (step) {
      case 0: return this.isStep1Valid();
      case 1: return this.isStep2Valid();
      case 2: return this.isStep3Valid();
      case 3: return this.isStep4Valid();
      case 4: return this.isStep5Valid();
      case 5: return this.isStep6Valid();
      case 6: return this.isAllValid();
      default: return false;
    }
  });

  /** Whether can proceed to next step */
  readonly canProceed = computed(() => {
    return this.isCurrentStepValid() && this._currentStep() < this.totalSteps - 1;
  });

  /** Whether can go back */
  readonly canGoBack = computed(() => {
    return this._currentStep() > 0;
  });

  /** Whether can create (on final step) */
  readonly canCreate = computed(() => {
    return this._currentStep() === this.totalSteps - 1 && this.isAllValid();
  });

  /** Progress percentage */
  readonly progressPercent = computed(() => {
    return Math.round(((this._currentStep() + 1) / this.totalSteps) * 100);
  });

  // ============ Navigation Methods ============

  /**
   * Go to next step.
   */
  nextStep(): void {
    if (this.canProceed()) {
      this._currentStep.update(s => s + 1);
    }
  }

  /**
   * Go to previous step.
   */
  previousStep(): void {
    if (this.canGoBack()) {
      this._currentStep.update(s => s - 1);
    }
  }

  /**
   * Go to a specific step.
   */
  goToStep(step: number): void {
    if (step >= 0 && step < this.totalSteps) {
      this._currentStep.set(step);
    }
  }

  // ============ Step 1: Experiment Setup ============

  /**
   * Set the template type.
   */
  setTemplate(template: WizardTemplate): void {
    this._state.update(s => ({ ...s, template }));
  }

  /**
   * Set the sample count.
   */
  setSampleCount(count: number): void {
    const sampleCount = Math.max(1, Math.floor(count));
    this._state.update(s => {
      // Adjust samples array
      const samples = [...s.samples];
      while (samples.length < sampleCount) {
        samples.push(this.createDefaultSample(samples.length + 1));
      }
      while (samples.length > sampleCount) {
        samples.pop();
      }
      return { ...s, sampleCount, samples };
    });
  }

  /**
   * Set the experiment description.
   */
  setExperimentDescription(description: string): void {
    this._state.update(s => ({ ...s, experimentDescription: description }));
  }

  // ============ Step 2: Sample Characteristics ============

  /**
   * Set the organism.
   */
  setOrganism(organism: OntologyTerm): void {
    this._state.update(s => ({ ...s, organism }));
  }

  /**
   * Set the disease.
   */
  setDisease(disease: OntologyTerm | string): void {
    this._state.update(s => ({ ...s, disease }));
  }

  /**
   * Set the organism part.
   */
  setOrganismPart(organismPart: OntologyTerm): void {
    this._state.update(s => ({ ...s, organismPart }));
  }

  /**
   * Set human-specific default sex.
   */
  setDefaultSex(sex: 'male' | 'female' | 'not available'): void {
    this._state.update(s => ({ ...s, defaultSex: sex }));
  }

  /**
   * Set human-specific default age.
   */
  setDefaultAge(age: string): void {
    this._state.update(s => ({ ...s, defaultAge: age }));
  }

  /**
   * Set cell line name.
   */
  setDefaultCellLine(cellLine: string): void {
    this._state.update(s => ({ ...s, defaultCellLine: cellLine }));
  }

  /**
   * Set vertebrate strain/breed.
   */
  setStrainBreed(strainBreed: string): void {
    this._state.update(s => ({ ...s, strainBreed }));
  }

  /**
   * Set developmental stage.
   */
  setDevelopmentalStage(developmentalStage: string): void {
    this._state.update(s => ({ ...s, developmentalStage }));
  }

  // ============ Step 3: Sample Values ============

  /**
   * Update a specific sample.
   */
  updateSample(index: number, updates: Partial<WizardSampleEntry>): void {
    this._state.update(s => {
      const samples = [...s.samples];
      if (index >= 0 && index < samples.length) {
        samples[index] = { ...samples[index], ...updates };
      }
      return { ...s, samples };
    });
  }

  /**
   * Set all samples at once.
   */
  setSamples(samples: WizardSampleEntry[]): void {
    this._state.update(s => ({ ...s, samples }));
  }

  /**
   * Auto-generate source names with a pattern.
   */
  autoGenerateSourceNames(pattern: string = 'sample_{n}'): void {
    this._state.update(s => {
      const samples = s.samples.map((sample, i) => ({
        ...sample,
        sourceName: pattern.replace('{n}', String(i + 1)),
      }));
      return { ...s, samples };
    });
  }

  /**
   * Copy a value from first sample to all samples.
   */
  copyToAllSamples(field: keyof WizardSampleEntry): void {
    this._state.update(s => {
      if (s.samples.length === 0) return s;
      const firstValue = s.samples[0][field];
      const samples = s.samples.map(sample => ({
        ...sample,
        [field]: firstValue,
      }));
      return { ...s, samples };
    });
  }

  // ============ Step 4: Technical Configuration ============

  /**
   * Set the label configuration.
   */
  setLabelConfig(configId: string): void {
    this._state.update(s => ({ ...s, labelConfigId: configId }));
  }

  /**
   * Set custom labels.
   */
  setCustomLabels(labels: string[]): void {
    this._state.update(s => ({ ...s, customLabels: labels }));
  }

  /**
   * Set whether fractionation is used.
   */
  setHasFractions(hasFractions: boolean): void {
    this._state.update(s => ({
      ...s,
      hasFractions,
      fractionCount: hasFractions ? Math.max(1, s.fractionCount) : 1,
    }));
  }

  /**
   * Set the number of fractions.
   */
  setFractionCount(count: number): void {
    this._state.update(s => ({
      ...s,
      fractionCount: Math.max(1, Math.floor(count)),
    }));
  }

  /**
   * Set the number of technical replicates.
   */
  setTechnicalReplicates(count: number): void {
    this._state.update(s => ({
      ...s,
      technicalReplicates: Math.max(1, Math.floor(count)),
    }));
  }

  /**
   * Set the data acquisition method.
   */
  setAcquisitionMethod(method: 'dda' | 'dia'): void {
    this._state.update(s => ({ ...s, acquisitionMethod: method }));
  }

  // ============ Step 5: Instrument & Protocol ============

  /**
   * Set the instrument.
   */
  setInstrument(instrument: OntologyTerm): void {
    this._state.update(s => ({ ...s, instrument }));
  }

  /**
   * Set the cleavage agent.
   */
  setCleavageAgent(cleavageAgent: WizardCleavageAgent): void {
    this._state.update(s => ({ ...s, cleavageAgent }));
  }

  /**
   * Add a modification.
   */
  addModification(modification: WizardModification): void {
    this._state.update(s => ({
      ...s,
      modifications: [...s.modifications, modification],
    }));
  }

  /**
   * Remove a modification.
   */
  removeModification(index: number): void {
    this._state.update(s => ({
      ...s,
      modifications: s.modifications.filter((_, i) => i !== index),
    }));
  }

  /**
   * Set all modifications.
   */
  setModifications(modifications: WizardModification[]): void {
    this._state.update(s => ({ ...s, modifications }));
  }

  // ============ Step 6: Data Files ============

  /**
   * Set the file naming pattern.
   */
  setFileNamingPattern(pattern: string): void {
    this._state.update(s => ({ ...s, fileNamingPattern: pattern }));
  }

  /**
   * Set data files.
   */
  setDataFiles(dataFiles: WizardDataFile[]): void {
    this._state.update(s => ({ ...s, dataFiles }));
  }

  /**
   * Auto-generate data files based on current configuration.
   */
  autoGenerateDataFiles(): void {
    const state = this._state();
    const files: WizardDataFile[] = [];
    const pattern = state.fileNamingPattern || '{sourceName}.raw';
    const labelConfig = LABEL_CONFIGS.find(c => c.id === state.labelConfigId);
    const labels = state.customLabels.length > 0
      ? state.customLabels
      : labelConfig?.labels || ['label free sample'];

    for (const sample of state.samples) {
      for (let f = 1; f <= (state.hasFractions ? state.fractionCount : 1); f++) {
        for (let r = 1; r <= state.technicalReplicates; r++) {
          // For label-free, one file per sample/fraction/replicate
          // For multiplexed, samples share the same file
          if (labelConfig?.id === 'lf') {
            const fileName = pattern
              .replace('{sourceName}', sample.sourceName)
              .replace('{fraction}', `F${f}`)
              .replace('{replicate}', `R${r}`)
              .replace('{n}', String(sample.index));

            files.push({
              fileName,
              sampleIndex: sample.index,
              fractionId: state.hasFractions ? f : undefined,
              technicalReplicate: state.technicalReplicates > 1 ? r : undefined,
              label: 'label free sample',
            });
          } else {
            // For multiplexed, generate one file per label per fraction/replicate
            for (const label of labels) {
              const fileName = pattern
                .replace('{sourceName}', sample.sourceName)
                .replace('{fraction}', `F${f}`)
                .replace('{replicate}', `R${r}`)
                .replace('{label}', label)
                .replace('{n}', String(sample.index));

              files.push({
                fileName,
                sampleIndex: sample.index,
                fractionId: state.hasFractions ? f : undefined,
                technicalReplicate: state.technicalReplicates > 1 ? r : undefined,
                label,
              });
            }
          }
        }
      }
    }

    this._state.update(s => ({ ...s, dataFiles: files }));
  }

  // ============ Reset ============

  /**
   * Reset the wizard to initial state.
   */
  reset(): void {
    this._state.set(createEmptyWizardState());
    this._currentStep.set(0);
  }

  // ============ Helpers ============

  /**
   * Create a default sample entry.
   */
  private createDefaultSample(index: number): WizardSampleEntry {
    return {
      index,
      sourceName: `sample_${index}`,
      biologicalReplicate: 1,
    };
  }

  /**
   * Get the complete state (for generator service).
   */
  getState(): WizardState {
    return this._state();
  }
}
