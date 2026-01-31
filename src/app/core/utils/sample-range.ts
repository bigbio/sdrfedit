/**
 * Sample Range Utilities
 *
 * Functions for encoding and decoding sample index ranges.
 * Range format: "1-3,5,7-10" means samples 1,2,3,5,7,8,9,10
 *
 * Ported from Python backend: ccv/tasks/import_utils.py:_create_modifiers()
 */

/**
 * Encodes an array of sample indices into a compact range string.
 *
 * @example
 * encodeSampleRange([1, 2, 3, 5, 7, 8, 9, 10]) // "1-3,5,7-10"
 * encodeSampleRange([1, 3, 5]) // "1,3,5"
 * encodeSampleRange([1, 2]) // "1,2" (not "1-2" for just 2 consecutive)
 */
export function encodeSampleRange(samples: number[]): string {
  if (samples.length === 0) {
    return '';
  }

  // Sort samples
  const sorted = [...samples].sort((a, b) => a - b);

  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === end + 1) {
      // Extend current range
      end = sorted[i];
    } else {
      // Close current range
      if (start === end) {
        // Single value
        ranges.push(String(start));
      } else if (end - start === 1) {
        // Two consecutive values - don't use range notation
        ranges.push(String(start));
        ranges.push(String(end));
      } else {
        // Three or more consecutive values - use range notation
        ranges.push(`${start}-${end}`);
      }

      // Start new range
      if (i < sorted.length) {
        start = sorted[i];
        end = sorted[i];
      }
    }
  }

  return ranges.join(',');
}

/**
 * Decodes a range string into an array of sample indices.
 *
 * @example
 * decodeSampleRange("1-3,5,7-10") // [1, 2, 3, 5, 7, 8, 9, 10]
 * decodeSampleRange("1,3,5") // [1, 3, 5]
 */
export function decodeSampleRange(rangeString: string): number[] {
  if (!rangeString || rangeString.trim() === '') {
    return [];
  }

  const samples: number[] = [];
  const parts = rangeString.split(',');

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          samples.push(i);
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        samples.push(num);
      }
    }
  }

  // Remove duplicates and sort
  return [...new Set(samples)].sort((a, b) => a - b);
}

/**
 * Checks if a sample index is within a range string.
 *
 * @example
 * isSampleInRange(2, "1-3,5") // true
 * isSampleInRange(4, "1-3,5") // false
 */
export function isSampleInRange(sampleIndex: number, rangeString: string): boolean {
  const parts = rangeString.split(',');

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (sampleIndex >= start && sampleIndex <= end) {
        return true;
      }
    } else {
      if (sampleIndex === parseInt(trimmed, 10)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Expands a range string to show all indices (for display purposes).
 *
 * @example
 * expandRangeForDisplay("1-3,5") // "1, 2, 3, 5"
 */
export function expandRangeForDisplay(rangeString: string, maxDisplay: number = 10): string {
  const samples = decodeSampleRange(rangeString);

  if (samples.length <= maxDisplay) {
    return samples.join(', ');
  }

  // Show first few and indicate more
  const shown = samples.slice(0, maxDisplay - 1);
  return `${shown.join(', ')}, ... (+${samples.length - shown.length} more)`;
}

/**
 * Merges multiple range strings into one.
 *
 * @example
 * mergeRanges(["1-3", "5-7", "9"]) // "1-3,5-7,9"
 */
export function mergeRanges(ranges: string[]): string {
  const allSamples: number[] = [];

  for (const range of ranges) {
    allSamples.push(...decodeSampleRange(range));
  }

  return encodeSampleRange(allSamples);
}

/**
 * Subtracts one range from another.
 *
 * @example
 * subtractRange("1-10", "3-5") // "1-2,6-10"
 */
export function subtractRange(baseRange: string, subtractRange: string): string {
  const baseSamples = decodeSampleRange(baseRange);
  const subtractSamples = new Set(decodeSampleRange(subtractRange));

  const result = baseSamples.filter((s) => !subtractSamples.has(s));
  return encodeSampleRange(result);
}

/**
 * Gets the intersection of two ranges.
 *
 * @example
 * intersectRanges("1-5", "3-7") // "3-5"
 */
export function intersectRanges(range1: string, range2: string): string {
  const samples1 = new Set(decodeSampleRange(range1));
  const samples2 = decodeSampleRange(range2);

  const intersection = samples2.filter((s) => samples1.has(s));
  return encodeSampleRange(intersection);
}

/**
 * Counts the number of samples in a range.
 *
 * @example
 * countSamplesInRange("1-3,5,7-10") // 8
 */
export function countSamplesInRange(rangeString: string): number {
  return decodeSampleRange(rangeString).length;
}
