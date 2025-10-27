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

import type {PipeSegment} from '../../../model';
import type {QueryOperationSpace} from '../field-space/query-spaces';
import {StaticSourceSpace} from '../field-space/static-space';
import type {FieldSpace, SourceFieldSpace} from '../types/field-space';
import type {PipelineComp} from '../types/pipeline-comp';
import {View} from './view';
import {QOpDescView} from './qop-desc-view';
import {
  requiresNewStage,
  segmentTypeFromPipeSegment,
} from '../query-elements/query-class-policy';
import type {ParameterSpace} from '../field-space/parameter-space';
/**
 * A view operation which represents adding a segment (or multiple
 * segments) to another view operation.
 *
 * e.g. after the `is` in `view: x is by_carrier -> { select: * }`
 */
export class ViewArrow extends View {
  elementType = 'viewArrow';

  constructor(
    readonly base: View,
    readonly operation: View
  ) {
    super({base, operation});
  }
  private shouldCreateNewStage(
    lastSegment: PipeSegment,
    operation: QOpDescView
  ): boolean {
    const fromSeg = segmentTypeFromPipeSegment(lastSegment);
    for (const qop of operation.operation.list) {
      if (requiresNewStage(fromSeg, qop.forceQueryClass)) return true;
    }
    return false;
  }
  pipelineComp(fs: FieldSpace, parameterSpace?: ParameterSpace): PipelineComp {
    const baseComp = this.base.pipelineComp(fs, parameterSpace);
    const nextFS = new StaticSourceSpace(
      baseComp.outputStruct,
      'public',
      parameterSpace
    );
    // Check if the operation is a QOpDescView that needs refinement
    if (this.operation instanceof QOpDescView) {
      // Check if this is an incompatible transition that requires a new stage
      const lastSegment = baseComp.pipeline[baseComp.pipeline.length - 1];
      const needsNewStage = this.shouldCreateNewStage(
        lastSegment,
        this.operation
      );
      if (!needsNewStage) {
        this.operation.operation.refineFrom(lastSegment);
      }
    }
    const finalComp = this.operation.pipelineComp(nextFS, parameterSpace);
    return {
      pipeline: [...baseComp.pipeline, ...finalComp.pipeline],
      outputStruct: finalComp.outputStruct,
    };
  }

  refine(
    _inputFS: SourceFieldSpace,
    _pipeline: PipeSegment[],
    _parameterSpace: ParameterSpace | undefined,
    _isNestIn: QueryOperationSpace | undefined
  ): PipeSegment[] {
    this.logError(
      'refinement-with-multistage-view',
      'A multi-segment view cannot be used as a refinement'
    );
    return [];
  }

  getImplicitName(): string | undefined {
    return this.operation.getImplicitName();
  }
}
