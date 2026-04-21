/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling algorithm.
 * Reduces high-frequency signal data to a target number of points
 * while preserving visual shape. Essential for rendering EEG (256 Hz)
 * without killing CPU/GPU.
 *
 * Reference: Sveinn Steinarsson, 2013
 * "Downsampling Time Series for Visual Representation"
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Downsamples an array of points to `targetCount` using LTTB.
 * Returns the original array if it's already smaller than targetCount.
 */
export function lttbDownsample(data: Point[], targetCount: number): Point[] {
  const len = data.length;
  if (targetCount >= len || targetCount < 3) return data;

  const sampled: Point[] = [];
  const bucketSize = (len - 2) / (targetCount - 2);

  // Always keep the first point
  sampled.push(data[0]);

  let prevIndex = 0;

  for (let i = 0; i < targetCount - 2; i++) {
    // Calculate bucket boundaries
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, len - 1);

    // Calculate average point of the NEXT bucket (for triangle area)
    const nextBucketStart = bucketEnd;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, len);
    let avgX = 0;
    let avgY = 0;
    const nextBucketLen = nextBucketEnd - nextBucketStart;

    if (nextBucketLen > 0) {
      for (let j = nextBucketStart; j < nextBucketEnd; j++) {
        avgX += data[j].x;
        avgY += data[j].y;
      }
      avgX /= nextBucketLen;
      avgY /= nextBucketLen;
    } else {
      // Last bucket: use the last point
      avgX = data[len - 1].x;
      avgY = data[len - 1].y;
    }

    // Find the point in the current bucket with the largest triangle area
    let maxArea = -1;
    let maxIndex = bucketStart;
    const prevPoint = data[prevIndex];

    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (prevPoint.x - avgX) * (data[j].y - prevPoint.y) -
        (prevPoint.x - data[j].x) * (avgY - prevPoint.y),
      );
      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }

    sampled.push(data[maxIndex]);
    prevIndex = maxIndex;
  }

  // Always keep the last point
  sampled.push(data[len - 1]);

  return sampled;
}

/**
 * Downsamples parallel timestamp + value arrays (common in signal stores).
 * Returns downsampled [timestamps[], values[]] tuple.
 */
export function lttbDownsampleArrays(
  timestamps: number[],
  values: number[],
  targetCount: number,
): [number[], number[]] {
  const len = Math.min(timestamps.length, values.length);
  if (targetCount >= len || targetCount < 3) {
    return [timestamps.slice(0, len), values.slice(0, len)];
  }

  const points: Point[] = new Array(len);
  for (let i = 0; i < len; i++) {
    points[i] = { x: timestamps[i], y: values[i] };
  }

  const sampled = lttbDownsample(points, targetCount);
  const outTs = new Array(sampled.length);
  const outVals = new Array(sampled.length);
  for (let i = 0; i < sampled.length; i++) {
    outTs[i] = sampled[i].x;
    outVals[i] = sampled[i].y;
  }
  return [outTs, outVals];
}
