/*
 * Copyright 2023 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files
 * (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software,
 * and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import type {Query, StructDef, Argument} from '../../../model/malloy_types';
import {refIsStructDef} from '../../../model/malloy_types';
import {Source} from '../source-elements/source';
import {StaticSourceSpace} from '../field-space/static-space';
import type {FieldSpace} from '../types/field-space';
import type {QueryComp} from '../types/query-comp';
import type {QueryElement} from '../types/query-element';
import {QueryBase} from './query-base';
import type {View} from '../view-elements/view';
import {checkRequiredGroupBys} from '../../composite-source-utils';
import type {ParameterSpace} from '../field-space/parameter-space';
import {ParameterSpace as ParameterSpaceImpl} from '../field-space/parameter-space';
import {assignParameterSpace} from './parameter-space';
import {HasParameter} from '../parameters/has-parameter';
/**
 * A query operation that adds segments to a LHS source or query.
 *
 * e.g. `flights -> by_carrier`
 */
export class QueryArrow extends QueryBase implements QueryElement {
  elementType = 'arrow';

  constructor(
    readonly source: Source | QueryElement,
    readonly view: View,
    public parameterSpace?: ParameterSpace
  ) {
    super({source, view});
  }

  queryComp(isRefOk: boolean): QueryComp {
    let inputStruct: StructDef;
    let queryBase: Query;
    let fieldSpace: FieldSpace;
    this.view.assignParameterSpace(this.parameterSpace);
    if (this.source instanceof Source) {
      // We create a fresh query with either the QOPDesc as the head,
      // the view as the head, or the scalar as the head (if scalar lenses is enabled)

      const invoked = isRefOk
        ? this.source.structRef(this.parameterSpace)
        : {structRef: this.source.getSourceDef(this.parameterSpace)};
      queryBase = {
        type: 'query',
        ...invoked,
        pipeline: [],
        location: this.location,
      };
      const structDef = refIsStructDef(invoked.structRef)
        ? invoked.structRef
        : this.source.getSourceDef(this.parameterSpace);
      inputStruct = {
        ...structDef,
        parameters: structDef.parameters,
        annotation: structDef.annotation,
      };

      // If we have arguments (parameter values), create a parameter space from them
      // This allows parameters passed to a source to be available in the query operations
      // e.g., run: state_facts(param is "foo") -> { group_by: param_val is param }
      let effectiveParamSpace = this.parameterSpace;
      const args = (
        inputStruct as StructDef & {arguments?: Record<string, Argument>}
      ).arguments;
      if (args && Object.keys(args).length > 0) {
        // Convert arguments to HasParameter instances
        const paramList: HasParameter[] = [];
        for (const [paramName, paramDef] of Object.entries(args)) {
          paramList.push(
            new HasParameter({
              name: paramName,
              typeDef: paramDef,
              default: undefined,
            })
          );
        }

        // Create a new parameter space with these parameters
        const argsParamSpace = new ParameterSpaceImpl(paramList);
        effectiveParamSpace = argsParamSpace;

        // Also assign this to the view
        this.view.assignParameterSpace(effectiveParamSpace);
      }

      fieldSpace = new StaticSourceSpace(
        inputStruct,
        'public',
        effectiveParamSpace
      );
    } else {
      // We are adding a second stage to the given "source" query; we get the query and add a segment
      // Ensure any in-scope parameters are available to the LHS query element
      assignParameterSpace(this.source as QueryElement, this.parameterSpace);
      const lhsQuery = this.source.queryComp(isRefOk);
      queryBase = lhsQuery.query;
      inputStruct = {
        ...lhsQuery.outputStruct,
        annotation: lhsQuery.outputStruct.annotation,
        parameters: lhsQuery.outputStruct.parameters,
      };
      fieldSpace = new StaticSourceSpace(
        lhsQuery.outputStruct,
        'public',
        this.parameterSpace
      );
    }
    const {
      pipeline: rhsPipeline,
      annotation,
      outputStruct,
      name,
    } = this.view.pipelineComp(fieldSpace);

    const query = {
      ...queryBase,
      name,
      annotation,
      pipeline: [...queryBase.pipeline, ...rhsPipeline],
    };

    const compositeResolvedSourceDef =
      query.compositeResolvedSourceDef ??
      this.resolveCompositeSource(inputStruct, rhsPipeline);

    const segment = query.pipeline[0];
    if (segment !== undefined) {
      const unsatisfiedGroupBys = checkRequiredGroupBys(
        compositeResolvedSourceDef ?? inputStruct,
        segment
      );
      for (const unsatisfiedGroupBy of unsatisfiedGroupBys) {
        this.logError(
          'missing-required-group-by',
          `Group by or single value filter of \`${unsatisfiedGroupBy.path.join(
            '.'
          )}\` is required but not present`,
          {
            at: unsatisfiedGroupBy.at,
          }
        );
      }
    }

    const pipelineWithExpandedFieldUsage = [
      // The base query (if it exists) will already have its `expandedFieldUsage` computed
      ...queryBase.pipeline,
      ...this.expandFieldUsage(
        this.source instanceof Source
          ? // If `source ->` then use the composite resolved struct,
            compositeResolvedSourceDef ?? inputStruct
          : // Otherwise just use the `inputStruct`
            inputStruct,
        rhsPipeline
      ),
    ];
    // Build sourceArguments for query_source:
    // - Start with any arguments provided at the query head (e.g., NamedSource.structRef -> evaluateArgumentsForRef)
    // - Prefer evaluated mappings from the inputStruct if present
    // - Fill missing keys from parameter definitions on the outputStruct that already have concrete values
    const sourceArguments: Record<string, Argument> = {
      ...((queryBase as Query & {sourceArguments?: Record<string, Argument>})
        .sourceArguments || {}),
    };
    const inputArgs = (
      inputStruct as StructDef & {arguments?: Record<string, Argument>}
    ).arguments;
    if (inputArgs) {
      for (const [k, v] of Object.entries(inputArgs)) {
        if (sourceArguments[k] === undefined) {
          sourceArguments[k] = v;
        }
      }
    }
    if (outputStruct.parameters) {
      for (const [paramName, paramDef] of Object.entries(
        outputStruct.parameters
      )) {
        if (
          sourceArguments[paramName] === undefined &&
          paramDef.value !== undefined
        ) {
          sourceArguments[paramName] = paramDef;
        }
      }
    }
    const comp = {
      query: {
        ...query,
        compositeResolvedSourceDef,
        pipeline: pipelineWithExpandedFieldUsage,
        sourceArguments,
      },
      outputStruct,
      inputStruct,
    };
    return comp;
  }
}
