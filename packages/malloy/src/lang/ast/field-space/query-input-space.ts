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

/**
 * Unlike a source, which is a refinement of a namespace, a query
 * is creating a new unrelated namespace. The query starts with a
 * source, which it might modify. This set of fields used to resolve
 * expressions in the query is called the "input space". There is a
 * specialized QuerySpace for each type of query operation.
 */

import type {AccessModifierLabel, SourceDef} from '../../../model';
import type {AtomicFieldDeclaration} from '../query-items/field-declaration';
import {Join} from '../source-properties/join';
import type {QueryFieldSpace} from '../types/field-space';
import type {QueryOperationSpace} from './query-spaces';
import {RefinedSpace} from './refined-space';
import type {ParameterSpace} from '../field-space/parameter-space';
import type {SpaceEntry} from '../types/space-entry';

export class QueryInputSpace extends RefinedSpace implements QueryFieldSpace {
  extendList: string[] = [];

  /**
   * Because of circularity concerns this constructor is not typed
   * properly ...
   * @param input The source which might be extended
   * @param queryOutput MUST BE A QuerySpace
   */
  constructor(
    input: SourceDef,
    private queryOutput: QueryOperationSpace,
    public readonly _accessProtectionLevel: AccessModifierLabel
  ) {
    super(input);
  }

  extendSource(extendField: Join | AtomicFieldDeclaration): void {
    this.pushFields(extendField);
    if (extendField instanceof Join) {
      this.extendList.push(extendField.name.refString);
    } else {
      this.extendList.push(extendField.defineName);
    }
  }

  isQueryFieldSpace(): this is QueryFieldSpace {
    return true;
  }

  outputSpace() {
    return this.queryOutput;
  }

  inputSpace() {
    return this;
  }

  accessProtectionLevel(): AccessModifierLabel {
    return this._accessProtectionLevel;
  }

  parameterSpace(): ParameterSpace {
    console.log('[QueryInputSpace.parameterSpace] Called');
    const provided = this.queryOutput.parameterSpace?.();
    if (provided) {
      const paramNames = Array.from(provided.entries()).map(([name]) => name);
      console.log(
        '[QueryInputSpace.parameterSpace] Got from queryOutput:',
        paramNames
      );
      return provided;
    }
    console.log('[QueryInputSpace.parameterSpace] Falling back to super');
    const superParam = super.parameterSpace();
    const superParamNames = Array.from(superParam.entries()).map(
      ([name]) => name
    );
    console.log(
      '[QueryInputSpace.parameterSpace] Super returned:',
      superParamNames
    );
    return superParam;
  }

  // Override entry() to also check the parameterSpace
  override entry(name: string): SpaceEntry | undefined {
    console.log(`[QueryInputSpace.entry] Looking up '${name}'`);
    // First check the regular fields
    const fieldEntry = super.entry(name);
    if (fieldEntry) {
      console.log(`[QueryInputSpace.entry] Found '${name}' in fields`);
      return fieldEntry;
    }
    // If not found in fields, check the parameter space
    const paramSpace = this.parameterSpace();
    if (paramSpace) {
      console.log(
        `[QueryInputSpace.entry] Checking parameterSpace for '${name}'`
      );
      const paramEntry = paramSpace.entry(name);
      if (paramEntry) {
        console.log(
          `[QueryInputSpace.entry] Found '${name}' in parameterSpace`
        );
        return paramEntry;
      }
    }
    console.log(`[QueryInputSpace.entry] '${name}' not found anywhere`);
    return undefined;
  }

  isQueryOutputSpace() {
    return false;
  }
}
