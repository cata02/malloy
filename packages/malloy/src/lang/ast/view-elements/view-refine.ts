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

import type {PipeSegment} from '../../../model/malloy_types';
import {ErrorFactory} from '../error-factory';
import type {QueryOperationSpace} from '../field-space/query-spaces';
import type {SourceFieldSpace, FieldSpace} from '../types/field-space';
import type {PipelineComp} from '../types/pipeline-comp';
import {refine} from './refine-utils';
import {View} from './view';
import type {ParameterSpace} from '../field-space/parameter-space';
import {StaticSourceSpace} from '../field-space/static-space';
/**
 * A view operation that represents the refinement of one view
 * with another view.
 *
 * e.g. `by_carrier + { limit: 10 }`
 */
export class ViewRefine extends View {
  elementType = 'refine';

  constructor(
    readonly base: View,
    readonly refinement: View
  ) {
    super({base, refinement});
  }

  pipelineComp(
    fs: FieldSpace,
    parameterSpace?: ParameterSpace,
    isNestIn?: QueryOperationSpace
  ): PipelineComp {
    const query = this.base.pipelineComp(fs, parameterSpace, isNestIn);
    const inputSpace = query.outputStruct;
    const refineSpace = new StaticSourceSpace(
      inputSpace,
      'public',
      parameterSpace
    );
    const {pipeline: refinePipeline, outputStruct} =
      this.refinement.pipelineComp(refineSpace, parameterSpace, isNestIn);
    const resultPipe = [...query.pipeline, ...refinePipeline];
    return {
      pipeline: resultPipe,
      annotation: query.annotation,
      outputStruct:
        resultPipe.length > 0
          ? resultPipe[resultPipe.length - 1].outputStruct
          : ErrorFactory.structDef,
    };
  }

  refine(
    inputFS: SourceFieldSpace,
    pipeline: PipeSegment[],
    parameterSpace: ParameterSpace | undefined,
    isNestIn: QueryOperationSpace | undefined
  ): PipeSegment[] {
    const basePipeline = this.base.pipelineComp(
      inputFS,
      parameterSpace,
      isNestIn
    ).pipeline;
    const combinedPipeline = [...basePipeline, ...pipeline];
    if (combinedPipeline.length === 0) {
      return combinedPipeline;
    }
    const refineFS = new StaticSourceSpace(
      combinedPipeline[combinedPipeline.length - 1].outputStruct,
      'public',
      parameterSpace
    );
    return this.refinement.refine(
      refineFS,
      combinedPipeline,
      parameterSpace,
      isNestIn
    );
  }

  getImplicitName(): string | undefined {
    return this.base.getImplicitName();
  }
}
