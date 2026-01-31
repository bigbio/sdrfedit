/**
 * Modifier Utilities
 *
 * Functions for working with column modifiers (sample-specific value overrides).
 * Ported from Python backend: ccv/tasks/import_utils.py
 */

import { Modifier, SdrfColumn, getValueForSample } from '../models/sdrf-column';
import { encodeSampleRange, decodeSampleRange, isSampleInRange } from './sample-range';

/**
 * Creates modifiers from a value map.
 * This is the TypeScript port of Python _create_modifiers().
 *
 * @param valueMap Map of sample index (1-based) to value
 * @param defaultValue The default value (most common) to exclude from modifiers
 * @returns Array of modifiers for non-default values
 *
 * @example
 * const valueMap = new Map([
 *   [1, 'value_a'], [2, 'value_a'], [3, 'value_a'],
 *   [4, 'value_b'], [5, 'value_b'],
 *   [6, 'value_c']
 * ]);
 * createModifiersFromValueMap(valueMap, 'value_a')
 * // Returns: [
 * //   { samples: '4-5', value: 'value_b' },
 * //   { samples: '6', value: 'value_c' }
 * // ]
 */
export function createModifiersFromValueMap(
  valueMap: Map<number, string>,
  defaultValue: string
): Modifier[] {
  // Group samples by value
  const valueToSamples = new Map<string, number[]>();

  for (const [sampleIndex, value] of valueMap) {
    if (value !== defaultValue) {
      if (!valueToSamples.has(value)) {
        valueToSamples.set(value, []);
      }
      valueToSamples.get(value)!.push(sampleIndex);
    }
  }

  // Create modifiers
  const modifiers: Modifier[] = [];

  for (const [value, samples] of valueToSamples) {
    modifiers.push({
      samples: encodeSampleRange(samples),
      value,
    });
  }

  return modifiers;
}

/**
 * Finds the most common value in a value map.
 * Used to determine the default column value.
 *
 * @param valueMap Map of sample index to value
 * @returns The most common value, or empty string if no values
 */
export function findMostCommonValue(valueMap: Map<number, string>): string {
  const valueCounts = new Map<string, number>();

  for (const value of valueMap.values()) {
    valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
  }

  let maxCount = 0;
  let mostCommon = '';

  for (const [value, count] of valueCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = value;
    }
  }

  return mostCommon;
}

// Note: getValueForSample is defined in sdrf-column.ts to avoid circular imports

/**
 * Sets the value for a specific sample in a column.
 * Updates modifiers as needed to maintain efficiency.
 *
 * @param column The column to update (mutates in place)
 * @param sampleIndex Sample index (1-based)
 * @param newValue The new value to set
 */
export function setValueForSample(
  column: SdrfColumn,
  sampleIndex: number,
  newValue: string
): void {
  // If the new value matches the default, remove from modifiers
  if (newValue === column.value) {
    // Remove this sample from all modifiers
    column.modifiers = column.modifiers
      .map((mod) => {
        const samples = decodeSampleRange(mod.samples);
        const filtered = samples.filter((s) => s !== sampleIndex);
        if (filtered.length === 0) {
          return null; // Remove empty modifier
        }
        return {
          ...mod,
          samples: encodeSampleRange(filtered),
        };
      })
      .filter((mod): mod is Modifier => mod !== null);
    return;
  }

  // Check if there's an existing modifier with this value
  const existingModifier = column.modifiers.find((mod) => mod.value === newValue);

  if (existingModifier) {
    // Add sample to existing modifier
    const samples = decodeSampleRange(existingModifier.samples);
    if (!samples.includes(sampleIndex)) {
      samples.push(sampleIndex);
      existingModifier.samples = encodeSampleRange(samples);
    }
  } else {
    // Create new modifier
    column.modifiers.push({
      samples: String(sampleIndex),
      value: newValue,
    });
  }

  // Remove sample from other modifiers
  for (const mod of column.modifiers) {
    if (mod.value !== newValue) {
      const samples = decodeSampleRange(mod.samples);
      const filtered = samples.filter((s) => s !== sampleIndex);
      if (filtered.length === 0) {
        const index = column.modifiers.indexOf(mod);
        column.modifiers.splice(index, 1);
      } else {
        mod.samples = encodeSampleRange(filtered);
      }
    }
  }
}

/**
 * Optimizes column modifiers by recalculating the best default value.
 * Call this after multiple changes to ensure efficient storage.
 *
 * @param column The column to optimize (mutates in place)
 * @param sampleCount Total number of samples
 */
export function optimizeColumnModifiers(column: SdrfColumn, sampleCount: number): void {
  // Build full value map
  const valueMap = new Map<number, string>();

  for (let i = 1; i <= sampleCount; i++) {
    valueMap.set(i, getValueForSample(column, i));
  }

  // Find new most common value
  const newDefault = findMostCommonValue(valueMap);

  // Rebuild modifiers
  column.value = newDefault;
  column.modifiers = createModifiersFromValueMap(valueMap, newDefault);
}

/**
 * Expands a column to a full value array (one value per sample).
 *
 * @param column The column to expand
 * @param sampleCount Total number of samples
 * @returns Array of values, one per sample (0-indexed)
 */
export function expandColumnToArray(column: SdrfColumn, sampleCount: number): string[] {
  const values: string[] = [];

  for (let i = 1; i <= sampleCount; i++) {
    values.push(getValueForSample(column, i));
  }

  return values;
}

/**
 * Creates a column from a value array.
 *
 * @param name Column name
 * @param type Column type
 * @param values Array of values (one per sample, 0-indexed)
 * @param position Column position
 * @returns New column with optimized modifiers
 */
export function createColumnFromArray(
  name: string,
  type: SdrfColumn['type'],
  values: string[],
  position: number
): SdrfColumn {
  const valueMap = new Map<number, string>();

  values.forEach((value, index) => {
    if (value && value.trim() !== '') {
      valueMap.set(index + 1, value.trim());
    }
  });

  const defaultValue = findMostCommonValue(valueMap);
  const modifiers = createModifiersFromValueMap(valueMap, defaultValue);

  return {
    name,
    type,
    value: defaultValue,
    modifiers,
    columnPosition: position,
  };
}

/**
 * Clones a column with all its modifiers.
 */
export function cloneColumn(column: SdrfColumn): SdrfColumn {
  return {
    ...column,
    modifiers: column.modifiers.map((mod) => ({ ...mod })),
  };
}

/**
 * Gets all unique values in a column.
 */
export function getUniqueValues(column: SdrfColumn): string[] {
  const values = new Set<string>();

  if (column.value) {
    values.add(column.value);
  }

  for (const mod of column.modifiers) {
    if (mod.value) {
      values.add(mod.value);
    }
  }

  return Array.from(values);
}
