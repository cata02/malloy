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

import type {SourceDef, QuerySourceDef} from '../../../model/malloy_types';
import {Source} from './source';
import type {QueryElement} from '../types/query-element';
import type {ParameterSpace} from '../field-space/parameter-space';
import {ParameterSpace as ParameterSpaceImpl} from '../field-space/parameter-space';
import type {HasParameter} from '../parameters/has-parameter';
import {AbstractParameter} from '../types/space-param';
import {assignParameterSpace} from '../query-elements/parameter-space';
import {v4 as uuidv4} from 'uuid';

export class QuerySource extends Source {
  elementType = 'querySource';
  constructor(readonly query: QueryElement) {
    super({query});
  }

  getSourceDef(parameterSpace: ParameterSpace | undefined): SourceDef {
    // Extract parameters from the parameter space to pass to the query
    const pList: HasParameter[] = [];
    if (parameterSpace) {
      for (const [_name, entry] of parameterSpace.entries()) {
        if (entry instanceof AbstractParameter) {
          pList.push(entry.astParam);
        }
      }
    }
    return this.withParameters(parameterSpace, pList);
  }

  withParameters(
    parameterSpace: ParameterSpace | undefined,
    pList: HasParameter[] | undefined
  ): SourceDef {
    // Create a merged parameter space that includes both:
    // 1. The outer parameter space (from where this source is used)
    // 2. This source's own declared parameters (pList)
    // This allows the query to reference both outer parameters and its own parameters
    let effectiveParamSpace = parameterSpace;
    if (pList && pList.length > 0) {
      // Merge outer parameters with source's own parameters
      const allParams: HasParameter[] = [...pList];
      if (parameterSpace) {
        for (const [_name, entry] of parameterSpace.entries()) {
          if (entry instanceof AbstractParameter) {
            allParams.push(entry.astParam);
          }
        }
      }
      effectiveParamSpace = new ParameterSpaceImpl(allParams);
    }

    // Pass the merged parameter space to the query
    assignParameterSpace(this.query, effectiveParamSpace);
    const comp = this.query.queryComp(false);
    const queryStruct: QuerySourceDef = {
      ...comp.outputStruct,
      name: `QuerySource-${uuidv4()}`,
      type: 'query_source',
      query: comp.query,
      arguments: comp.query.sourceArguments,
    };
    this.document()?.rememberToAddModelAnnotations(queryStruct);
    return {
      ...queryStruct,
      parameters: this.packParameters(pList),
    };
  }
}
