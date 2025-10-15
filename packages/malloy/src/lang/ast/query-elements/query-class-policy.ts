/*
 * Copyright Contributors to the Malloy project
 * SPDX-License-Identifier: MIT
 */

/* Centralized policy for query class transitions and stage decisions. */

import type {PipeSegment} from '../../../model/malloy_types';
import {QueryClass} from '../types/query-property-interface';

export type SegmentType = 'reduce' | 'project' | 'index';

export function segmentTypeFromPipeSegment(
  seg: PipeSegment | undefined
): SegmentType | undefined {
  if (!seg) return undefined;
  return seg.type as SegmentType;
}

export function normalizeQueryClass(
  classLike: QueryClass | string | undefined
): SegmentType | undefined {
  if (classLike === undefined) return undefined;
  // Handle string inputs already in segment form
  if (
    classLike === 'reduce' ||
    classLike === 'project' ||
    classLike === 'index'
  ) {
    return classLike;
  }
  // Map QueryClass enum to segment type
  switch (classLike) {
    case QueryClass.Grouping:
      return 'reduce';
    case QueryClass.Project:
      return 'project';
    case QueryClass.Index:
      return 'index';
    default:
      return undefined;
  }
}

// Allowed cross-stage transitions for pipelines (not refinements)
const allowedTransitions: ReadonlyArray<readonly [SegmentType, SegmentType]> = [
  ['reduce', 'project'],
  ['reduce', 'index'],
  ['project', 'index'],
];

export function isAllowedPipelineTransition(
  fromSeg: SegmentType | undefined,
  toClassLike: QueryClass | string | undefined
): boolean {
  const toSeg = normalizeQueryClass(toClassLike);
  if (!toSeg) return false;
  if (!fromSeg) return true; // no prior stage; fine to start
  if (fromSeg === toSeg) return true; // same class stays within stage logically
  return allowedTransitions.some(
    ([from, to]) => from === fromSeg && to === toSeg
  );
}

export function requiresNewStage(
  fromSeg: SegmentType | undefined,
  toClassLike: QueryClass | string | undefined
): boolean {
  const toSeg = normalizeQueryClass(toClassLike);
  if (!toSeg || !fromSeg) return false;
  if (fromSeg === toSeg) return false;
  return allowedTransitions.some(
    ([from, to]) => from === fromSeg && to === toSeg
  );
}

export function isIllegalRefineTransition(
  fromSeg: SegmentType | undefined,
  toClassLike: QueryClass | string | undefined
): boolean {
  const toSeg = normalizeQueryClass(toClassLike);
  if (!toSeg || !fromSeg) return false;
  // Any change of class within a refinement is illegal
  return fromSeg !== toSeg;
}
