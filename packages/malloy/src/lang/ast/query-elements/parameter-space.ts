/*
 * Copyright Contributors to the Malloy project
 * SPDX-License-Identifier: MIT
 */

/* Shared helpers for assigning parameter spaces to query elements. */

import type {ParameterSpace} from '../field-space/parameter-space';
import type {QueryElement} from '../types/query-element';

// Narrow to any object that exposes an optional parameterSpace for assignment
type ParameterAssignable = {parameterSpace?: ParameterSpace};

export function hasParameterSpace(
  query: unknown
): query is ParameterAssignable {
  return (
    query !== null &&
    typeof query === 'object' &&
    'parameterSpace' in (query as Record<string, unknown>)
  );
}

export function assignParameterSpace(
  query: QueryElement,
  parameterSpace: ParameterSpace | undefined
): void {
  if (hasParameterSpace(query)) {
    (query as ParameterAssignable).parameterSpace = parameterSpace;
  }
}
