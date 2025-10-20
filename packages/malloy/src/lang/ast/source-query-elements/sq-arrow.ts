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

import {Source} from '../source-elements/source';
import {SourceQueryElement} from './source-query-element';
import {QuerySource} from '../source-elements/query-source';
import {QueryArrow} from '../query-elements/query-arrow';
import type {View} from '../view-elements/view';
import type {QueryElement} from '../types/query-element';
import {HasParameter} from '../parameters/has-parameter';
import {ParameterSpace} from '../field-space/parameter-space';

/**
 * An expression that adds a segment to a source or query.
 * This generates a `QueryArrow`, which either creates a new query
 * from scratch with the LHS as the source, or creates a new query
 * by adding a segment to the LHS (when it is already a query).
 * When this element is treated as a source, the resulting query is
 * wrapped in a `QuerySource` element.
 *
 * e.g. `flights -> by_carrier`
 */
export class SQArrow extends SourceQueryElement {
  elementType = 'sq-arrow';
  constructor(
    readonly applyTo: SourceQueryElement,
    readonly operation: View
  ) {
    super({applyTo, operation});
  }

  getQuery(): QueryElement | undefined {
    console.log('[SQArrow.getQuery] Called');
    const lhs = this.applyTo.isSource()
      ? this.applyTo.getSource()
      : this.applyTo.getQuery();
    if (lhs === undefined) {
      this.sqLog(
        'failed-to-compute-arrow-source',
        'Could not get LHS of arrow operation'
      );
      return;
    }

    // Extract parameter space from source arguments if available
    // This ensures parameters are accessible in the query (e.g., in join pipelines)
    let parameterSpace: ParameterSpace | undefined;
    const sourceType =
      lhs instanceof Source
        ? (lhs as any).elementType || lhs.constructor.name
        : 'QueryElement';
    console.log(
      `[SQArrow.getQuery] LHS is: ${sourceType}, instanceof Source: ${
        lhs instanceof Source
      }`
    );
    if (lhs instanceof Source) {
      // Get the source def to extract arguments
      const sourceDef = lhs.getSourceDef(undefined);
      console.log(
        `[SQArrow.getQuery] sourceDef.parameters:`,
        sourceDef.parameters ? Object.keys(sourceDef.parameters) : 'none'
      );
      console.log(
        `[SQArrow.getQuery] sourceDef.arguments:`,
        sourceDef.arguments ? Object.keys(sourceDef.arguments) : 'none'
      );
      // Use arguments instead of parameters - arguments contain the actual parameter values
      if (sourceDef.arguments && Object.keys(sourceDef.arguments).length > 0) {
        // Convert Argument objects to HasParameter objects to create ParameterSpace
        const paramList: HasParameter[] = [];
        for (const [paramName, arg] of Object.entries(sourceDef.arguments)) {
          // Extract the ParameterTypeDef part (without the 'name' and 'value' fields)
          const {name: _name, value: _value, ...typeDef} = arg;
          paramList.push(
            new HasParameter({
              name: paramName,
              typeDef,
            })
          );
        }
        parameterSpace = new ParameterSpace(paramList);
        console.log(
          '[SQArrow.getQuery] Created parameterSpace from source arguments:',
          Object.keys(sourceDef.arguments)
        );
      }
    }

    const arr = new QueryArrow(lhs, this.operation, parameterSpace);
    this.has({query: arr});
    return arr;
  }

  getSource(): Source | undefined {
    const query = this.getQuery();
    if (!query) {
      this.sqLog(
        'failed-to-compute-source-from-query',
        "Couldn't comprehend query well enough to make a source"
      );
      return;
    }
    const asSource = new QuerySource(query);
    this.has({asSource});
    return asSource;
  }
}
