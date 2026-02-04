/**
 * Wizard Generator Service
 *
 * Converts WizardState into an SdrfTable structure.
 */

import { Injectable } from '@angular/core';
import {
  WizardState,
  OntologyTerm,
  DynamicColumnDefault,
  LABEL_CONFIGS,
  isHumanTemplate,
  isCellLineTemplate,
  isVertebrateTemplate,
} from '../models/wizard';
import { SdrfTable, createEmptyTable } from '../models/sdrf-table';
import { SdrfColumn, ColumnType, Modifier } from '../models/sdrf-column';

@Injectable({ providedIn: 'root' })
export class WizardGeneratorService {
  /**
   * Generate an SdrfTable from wizard state.
   */
  generate(state: WizardState): SdrfTable {
    const table = createEmptyTable(this.calculateRowCount(state));
    let columnPosition = 0;

    // Required columns in order
    table.columns.push(this.createSourceNameColumn(state, columnPosition++));
    table.columns.push(this.createOrganismColumn(state, columnPosition++));
    table.columns.push(this.createDiseaseColumn(state, columnPosition++));
    table.columns.push(this.createOrganismPartColumn(state, columnPosition++));

    // Template-specific columns (using helper functions for both legacy and new template IDs)
    if (isHumanTemplate(state.template)) {
      if (state.defaultSex || state.samples.some(s => s.sex)) {
        table.columns.push(this.createSexColumn(state, columnPosition++));
      }
      if (state.defaultAge || state.samples.some(s => s.age)) {
        table.columns.push(this.createAgeColumn(state, columnPosition++));
      }
    }

    if (isCellLineTemplate(state.template)) {
      if (state.defaultCellLine || state.samples.some(s => s.cellLine)) {
        table.columns.push(this.createCellLineColumn(state, columnPosition++));
      }
    }

    if (isVertebrateTemplate(state.template)) {
      if (state.strainBreed) {
        table.columns.push(this.createStrainBreedColumn(state, columnPosition++));
      }
      if (state.developmentalStage) {
        table.columns.push(this.createDevelopmentalStageColumn(state, columnPosition++));
      }
    }

    // Add any dynamic column defaults from template
    for (const colDefault of state.dynamicColumnDefaults) {
      // Skip columns we already handle explicitly
      const handled = ['organism', 'disease', 'organism part', 'sex', 'age', 'cell line', 'strain', 'developmental stage'];
      if (handled.some(h => colDefault.columnName.includes(h))) {
        continue;
      }
      table.columns.push(this.createDynamicColumn(colDefault, columnPosition++));
    }

    // Biological replicate
    table.columns.push(this.createBiologicalReplicateColumn(state, columnPosition++));

    // Assay columns
    table.columns.push(this.createAssayNameColumn(state, columnPosition++));
    table.columns.push(this.createTechnologyTypeColumn(columnPosition++));

    // Technical columns
    table.columns.push(this.createFractionColumn(state, columnPosition++));
    table.columns.push(this.createLabelColumn(state, columnPosition++));
    table.columns.push(this.createDataAcquisitionMethodColumn(state, columnPosition++));

    if (state.technicalReplicates > 1) {
      table.columns.push(this.createTechnicalReplicateColumn(state, columnPosition++));
    }

    // Instrument & Protocol
    table.columns.push(this.createInstrumentColumn(state, columnPosition++));
    table.columns.push(this.createCleavageAgentColumn(state, columnPosition++));

    // Modifications
    for (const mod of state.modifications) {
      table.columns.push(this.createModificationColumn(mod, columnPosition++));
    }

    // Data file (last)
    table.columns.push(this.createDataFileColumn(state, columnPosition++));

    return table;
  }

  /**
   * Calculate total row count based on samples, fractions, and replicates.
   */
  private calculateRowCount(state: WizardState): number {
    const labelConfig = LABEL_CONFIGS.find(c => c.id === state.labelConfigId);
    const isMultiplexed = labelConfig && labelConfig.id !== 'lf';

    if (isMultiplexed) {
      // For multiplexed, rows = files (samples share runs)
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;
      // Simplified: one row per sample per fraction per tech replicate
      return state.samples.length * fractions * techReps;
    } else {
      // For label-free, rows = samples × fractions × tech replicates
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;
      return state.samples.length * fractions * techReps;
    }
  }

  // ============ Column Generators ============

  private createSourceNameColumn(state: WizardState, position: number): SdrfColumn {
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (const sample of state.samples) {
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;
      const rowsPerSample = fractions * techReps;

      if (rowsPerSample === 1) {
        modifiers.push({ samples: String(rowIndex), value: sample.sourceName });
      } else {
        modifiers.push({
          samples: `${rowIndex}-${rowIndex + rowsPerSample - 1}`,
          value: sample.sourceName,
        });
      }
      rowIndex += rowsPerSample;
    }

    return {
      name: 'source name',
      type: 'source_name',
      value: state.samples[0]?.sourceName || '',
      modifiers,
      columnPosition: position,
      isRequired: true,
    };
  }

  private createOrganismColumn(state: WizardState, position: number): SdrfColumn {
    const value = state.organism
      ? state.organism.label.toLowerCase()
      : 'not available';

    return {
      name: 'characteristics[organism]',
      type: 'characteristics',
      value,
      modifiers: [],
      columnPosition: position,
      isRequired: true,
      ontologyType: 'ncbitaxon',
    };
  }

  private createDiseaseColumn(state: WizardState, position: number): SdrfColumn {
    let defaultValue = 'not available';
    if (state.disease === 'normal' || state.disease === null) {
      defaultValue = state.disease === 'normal' ? 'normal' : 'not available';
    } else if (typeof state.disease === 'object') {
      defaultValue = state.disease.label.toLowerCase();
    }

    // Check for sample-specific diseases
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (const sample of state.samples) {
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;
      const rowsPerSample = fractions * techReps;

      if (sample.disease && sample.disease !== state.disease) {
        const sampleDisease = typeof sample.disease === 'string'
          ? sample.disease
          : sample.disease.label.toLowerCase();

        modifiers.push({
          samples: rowsPerSample === 1
            ? String(rowIndex)
            : `${rowIndex}-${rowIndex + rowsPerSample - 1}`,
          value: sampleDisease,
        });
      }
      rowIndex += rowsPerSample;
    }

    return {
      name: 'characteristics[disease]',
      type: 'characteristics',
      value: defaultValue,
      modifiers,
      columnPosition: position,
      isRequired: true,
      ontologyType: 'mondo',
    };
  }

  private createOrganismPartColumn(state: WizardState, position: number): SdrfColumn {
    const value = state.organismPart
      ? state.organismPart.label.toLowerCase()
      : 'not available';

    return {
      name: 'characteristics[organism part]',
      type: 'characteristics',
      value,
      modifiers: [],
      columnPosition: position,
      isRequired: true,
      ontologyType: 'uberon',
    };
  }

  private createSexColumn(state: WizardState, position: number): SdrfColumn {
    const defaultValue = state.defaultSex || 'not available';
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (const sample of state.samples) {
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;
      const rowsPerSample = fractions * techReps;

      if (sample.sex && sample.sex !== state.defaultSex) {
        modifiers.push({
          samples: rowsPerSample === 1
            ? String(rowIndex)
            : `${rowIndex}-${rowIndex + rowsPerSample - 1}`,
          value: sample.sex,
        });
      }
      rowIndex += rowsPerSample;
    }

    return {
      name: 'characteristics[sex]',
      type: 'characteristics',
      value: defaultValue,
      modifiers,
      columnPosition: position,
    };
  }

  private createAgeColumn(state: WizardState, position: number): SdrfColumn {
    const defaultValue = state.defaultAge || 'not available';
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (const sample of state.samples) {
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;
      const rowsPerSample = fractions * techReps;

      if (sample.age && sample.age !== state.defaultAge) {
        modifiers.push({
          samples: rowsPerSample === 1
            ? String(rowIndex)
            : `${rowIndex}-${rowIndex + rowsPerSample - 1}`,
          value: sample.age,
        });
      }
      rowIndex += rowsPerSample;
    }

    return {
      name: 'characteristics[age]',
      type: 'characteristics',
      value: defaultValue,
      modifiers,
      columnPosition: position,
    };
  }

  private createCellLineColumn(state: WizardState, position: number): SdrfColumn {
    const defaultValue = state.defaultCellLine || 'not applicable';
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (const sample of state.samples) {
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;
      const rowsPerSample = fractions * techReps;

      if (sample.cellLine && sample.cellLine !== state.defaultCellLine) {
        modifiers.push({
          samples: rowsPerSample === 1
            ? String(rowIndex)
            : `${rowIndex}-${rowIndex + rowsPerSample - 1}`,
          value: sample.cellLine,
        });
      }
      rowIndex += rowsPerSample;
    }

    return {
      name: 'characteristics[cell line]',
      type: 'characteristics',
      value: defaultValue,
      modifiers,
      columnPosition: position,
    };
  }

  private createStrainBreedColumn(state: WizardState, position: number): SdrfColumn {
    return {
      name: 'characteristics[strain/breed]',
      type: 'characteristics',
      value: state.strainBreed || 'not available',
      modifiers: [],
      columnPosition: position,
    };
  }

  private createDevelopmentalStageColumn(state: WizardState, position: number): SdrfColumn {
    return {
      name: 'characteristics[developmental stage]',
      type: 'characteristics',
      value: state.developmentalStage || 'not available',
      modifiers: [],
      columnPosition: position,
    };
  }

  private createBiologicalReplicateColumn(state: WizardState, position: number): SdrfColumn {
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (const sample of state.samples) {
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;
      const rowsPerSample = fractions * techReps;

      modifiers.push({
        samples: rowsPerSample === 1
          ? String(rowIndex)
          : `${rowIndex}-${rowIndex + rowsPerSample - 1}`,
        value: String(sample.biologicalReplicate),
      });
      rowIndex += rowsPerSample;
    }

    return {
      name: 'characteristics[biological replicate]',
      type: 'characteristics',
      value: '1',
      modifiers,
      columnPosition: position,
    };
  }

  private createAssayNameColumn(state: WizardState, position: number): SdrfColumn {
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (const sample of state.samples) {
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;

      for (let f = 1; f <= fractions; f++) {
        for (let r = 1; r <= techReps; r++) {
          let assayName = sample.sourceName;
          if (fractions > 1) assayName += `_F${f}`;
          if (techReps > 1) assayName += `_R${r}`;

          modifiers.push({
            samples: String(rowIndex),
            value: assayName,
          });
          rowIndex++;
        }
      }
    }

    return {
      name: 'assay name',
      type: 'special',
      value: modifiers[0]?.value || '',
      modifiers,
      columnPosition: position,
      isRequired: true,
    };
  }

  private createTechnologyTypeColumn(position: number): SdrfColumn {
    return {
      name: 'technology type',
      type: 'special',
      value: 'proteomic profiling by mass spectrometry',
      modifiers: [],
      columnPosition: position,
      isRequired: true,
    };
  }

  private createDataAcquisitionMethodColumn(state: WizardState, position: number): SdrfColumn {
    // Use the acquisition method from state, default to DDA
    const method = state.acquisitionMethod || 'dda';

    let value: string;
    if (method === 'dia') {
      value = 'NT=Data-independent acquisition;AC=PRIDE:0000450';
    } else {
      value = 'NT=Data-dependent acquisition;AC=PRIDE:0000627';
    }

    return {
      name: 'comment[proteomics data acquisition method]',
      type: 'comment',
      value,
      modifiers: [],
      columnPosition: position,
      isRequired: true,
    };
  }

  private createFractionColumn(state: WizardState, position: number): SdrfColumn {
    // If no fractionation, return a single value for all rows
    if (!state.hasFractions || state.fractionCount <= 1) {
      return {
        name: 'comment[fraction identifier]',
        type: 'comment',
        value: '1',
        modifiers: [],
        columnPosition: position,
        isRequired: true,
      };
    }

    // With fractionation, assign fraction numbers per row
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (const sample of state.samples) {
      for (let f = 1; f <= state.fractionCount; f++) {
        for (let r = 1; r <= state.technicalReplicates; r++) {
          modifiers.push({
            samples: String(rowIndex),
            value: String(f),
          });
          rowIndex++;
        }
      }
    }

    return {
      name: 'comment[fraction identifier]',
      type: 'comment',
      value: '1',
      modifiers,
      columnPosition: position,
      isRequired: true,
    };
  }

  private createLabelColumn(state: WizardState, position: number): SdrfColumn {
    const labelConfig = LABEL_CONFIGS.find(c => c.id === state.labelConfigId);
    const labels = state.customLabels.length > 0
      ? state.customLabels
      : labelConfig?.labels || ['label free sample'];

    // For label-free, all rows have the same label
    if (labelConfig?.id === 'lf' || labels.length === 1) {
      return {
        name: 'comment[label]',
        type: 'comment',
        value: labels[0],
        modifiers: [],
        columnPosition: position,
        isRequired: true,
      };
    }

    // For multiplexed, assign labels to samples
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (let i = 0; i < state.samples.length; i++) {
      const label = labels[i % labels.length];
      const fractions = state.hasFractions ? state.fractionCount : 1;
      const techReps = state.technicalReplicates;
      const rowsPerSample = fractions * techReps;

      modifiers.push({
        samples: rowsPerSample === 1
          ? String(rowIndex)
          : `${rowIndex}-${rowIndex + rowsPerSample - 1}`,
        value: label,
      });
      rowIndex += rowsPerSample;
    }

    return {
      name: 'comment[label]',
      type: 'comment',
      value: labels[0],
      modifiers,
      columnPosition: position,
      isRequired: true,
    };
  }

  private createTechnicalReplicateColumn(state: WizardState, position: number): SdrfColumn {
    const modifiers: Modifier[] = [];
    let rowIndex = 1;

    for (const sample of state.samples) {
      const fractions = state.hasFractions ? state.fractionCount : 1;

      for (let f = 1; f <= fractions; f++) {
        for (let r = 1; r <= state.technicalReplicates; r++) {
          modifiers.push({
            samples: String(rowIndex),
            value: String(r),
          });
          rowIndex++;
        }
      }
    }

    return {
      name: 'comment[technical replicate]',
      type: 'comment',
      value: '1',
      modifiers,
      columnPosition: position,
    };
  }

  private createInstrumentColumn(state: WizardState, position: number): SdrfColumn {
    const value = state.instrument
      ? state.instrument.label
      : 'not available';

    return {
      name: 'comment[instrument]',
      type: 'comment',
      value,
      modifiers: [],
      columnPosition: position,
      isRequired: true,
      ontologyType: 'ms',
    };
  }

  private createCleavageAgentColumn(state: WizardState, position: number): SdrfColumn {
    let value = 'not available';
    if (state.cleavageAgent) {
      value = `NT=${state.cleavageAgent.name};AC=${state.cleavageAgent.msAccession}`;
    }

    return {
      name: 'comment[cleavage agent details]',
      type: 'comment',
      value,
      modifiers: [],
      columnPosition: position,
      isRequired: true,
    };
  }

  private createModificationColumn(
    mod: { name: string; targetAminoAcids: string; type: 'fixed' | 'variable'; unimodAccession?: string },
    position: number
  ): SdrfColumn {
    const parts = [`NT=${mod.name}`, `MT=${mod.type}`, `TA=${mod.targetAminoAcids}`];
    if (mod.unimodAccession) {
      parts.push(`AC=${mod.unimodAccession}`);
    }

    return {
      name: 'comment[modification parameters]',
      type: 'comment',
      value: parts.join(';'),
      modifiers: [],
      columnPosition: position,
      isRequired: true,
    };
  }

  private createDataFileColumn(state: WizardState, position: number): SdrfColumn {
    const modifiers: Modifier[] = [];

    if (state.dataFiles.length > 0) {
      for (let i = 0; i < state.dataFiles.length; i++) {
        modifiers.push({
          samples: String(i + 1),
          value: state.dataFiles[i].fileName,
        });
      }
    } else {
      // Auto-generate from pattern
      let rowIndex = 1;
      for (const sample of state.samples) {
        const fractions = state.hasFractions ? state.fractionCount : 1;
        const techReps = state.technicalReplicates;

        for (let f = 1; f <= fractions; f++) {
          for (let r = 1; r <= techReps; r++) {
            let fileName = state.fileNamingPattern
              .replace('{sourceName}', sample.sourceName)
              .replace('{fraction}', `F${f}`)
              .replace('{replicate}', `R${r}`)
              .replace('{n}', String(sample.index));

            modifiers.push({
              samples: String(rowIndex),
              value: fileName,
            });
            rowIndex++;
          }
        }
      }
    }

    return {
      name: 'comment[data file]',
      type: 'comment',
      value: modifiers[0]?.value || 'data.raw',
      modifiers,
      columnPosition: position,
      isRequired: true,
    };
  }

  /**
   * Create a column from a dynamic column default.
   */
  private createDynamicColumn(colDefault: DynamicColumnDefault, position: number): SdrfColumn {
    // Determine column type from name
    let type: ColumnType = 'comment';
    if (colDefault.columnName.startsWith('characteristics[')) {
      type = 'characteristics';
    } else if (colDefault.columnName.startsWith('factor value[')) {
      type = 'factor_value';
    }

    return {
      name: colDefault.columnName,
      type,
      value: colDefault.value,
      modifiers: [],
      columnPosition: position,
    };
  }
}
