/*
 * Copyright 2023 Google LLC
 * Copyright (c) Meta Platforms, Inc. and affiliates.
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

import type {
  Argument,
  Expr,
  InvokedStructRef,
  Parameter,
  SourceDef,
} from '../../../model/malloy_types';
import {
  isCastType,
  isSourceDef,
  paramHasValue,
} from '../../../model/malloy_types';

import {Source} from './source';
import {ErrorFactory} from '../error-factory';
import {castTo} from '../time-utils';
import {ModelEntryReference} from '../types/malloy-element';
import type {Argument as HasArgument} from '../parameters/argument';
import type {
  LogMessageOptions,
  MessageCode,
  MessageParameterType,
} from '../../parse-log';
import {ExprIdReference} from '../expressions/expr-id-reference';
import {ParameterSpace} from '../field-space/parameter-space';
import type {HasParameter} from '../parameters/has-parameter';
import {checkFilterExpression} from '../types/expression-def';

export class NamedSource extends Source {
  elementType = 'namedSource';

  constructor(
    readonly ref: ModelEntryReference | string,
    readonly sourceArguments: Record<string, Argument> | undefined,
    readonly args: HasArgument[] | undefined
  ) {
    super();
    if (args) {
      this.has({args});
    }
    if (ref instanceof ModelEntryReference) {
      this.has({ref: ref});
    }
  }

  get refName(): string {
    return this.ref instanceof ModelEntryReference ? this.ref.name : this.ref;
  }

  structRef(parameterSpace: ParameterSpace | undefined): InvokedStructRef {
    const modelEnt = this.modelEntry(this.ref);
    // If we are not exporting the referenced structdef, don't use the reference
    if (modelEnt && !modelEnt.exported) {
      return {
        structRef: this.getSourceDef(parameterSpace),
      };
    }
    return {
      structRef: this.refName,
      sourceArguments: this.evaluateArgumentsForRef(parameterSpace),
    };
  }

  refLogError<T extends MessageCode>(
    code: T,
    parameters: MessageParameterType<T>,
    options?: Omit<LogMessageOptions, 'severity'>
  ) {
    if (typeof this.ref === 'string') {
      this.logError(code, parameters, options);
    } else {
      this.ref.logError(code, parameters, options);
    }
  }

  modelStruct(): SourceDef | undefined {
    const modelEnt = this.modelEntry(this.ref);
    const entry = modelEnt?.entry;
    if (!entry) {
      this.refLogError(
        'source-not-found',
        `Undefined source '${this.refName}'`
      );
      return;
    }
    if (entry.type === 'query') {
      // I don't understand under what circumstance this code would be
      // executed, what Malloy you would write to generate this error,
      // but the error exists so I am leaving it for now.
      //
      // Someone with time and courage should either remove this error
      // because it isn't possible, or go ahead and make a source out
      // of a query, which is a thing you can do, although when you
      // do that it currently doesn't go through this path, so I don't
      // know how you would test that change.
      this.logError(
        'invalid-source-from-query',
        `Cannot construct a source from query '${this.refName}'`
      );
      return;
    } else if (entry.type === 'function') {
      this.logError(
        'invalid-source-from-function',
        `Cannot construct a source from a function '${this.refName}'`
      );
      return;
    } else if (entry.type === 'connection') {
      this.logError(
        'invalid-source-from-connection',
        `Cannot construct a source from a connection '${this.refName}'`
      );
      return;
    } else {
      this.document()?.checkExperimentalDialect(this, entry.dialect);
      if (isSourceDef(entry)) {
        return {...entry};
      }
    }
    // I think this is now a never
    this.logError(
      'invalid-source-source',
      'Cannot construct a source from a never type'
    );
  }

  private evaluateArgumentsForRef(
    parameterSpace: ParameterSpace | undefined
  ): Record<string, Parameter> {
    const base = this.modelStruct();
    if (base === undefined) {
      return {};
    }

    return this.evaluateArguments(parameterSpace, base.parameters, []);
  }
  /**
   * Recursively resolve all parameter references in an expression tree.
   *
   * This handles cases where an expression contains parameter references that need
   * to be replaced with their concrete values before constant folding can occur.
   * For example, if we have:
   *   - param = 11
   *   - param2 is param + 1
   *
   * This method transforms the expression tree for `param + 1` from:
   *   {node: '+', kids: {left: {node: 'parameter', path: ['param']}, right: 1}}
   * to:
   *   {node: '+', kids: {left: {node: 'numberLiteral', literal: '11'}, right: 1}}
   *
   * After this resolution, tryFoldConstantExpr can then fold it to:
   *   {node: 'numberLiteral', literal: '12'}
   */
  private resolveParametersInExpr(
    expr: Expr,
    paramSpace: ParameterSpace
  ): Expr {
    // Base case: if this is a parameter node, resolve it
    if (expr.node === 'parameter' && Array.isArray((expr as any).path)) {
      const paramName = (expr as any).path[0];
      const resolved = paramSpace.entry(paramName);
      if (resolved && resolved.refType === 'parameter') {
        const resolvedParam = (resolved as any).parameter();
        if (resolvedParam.value) {
          // Recursively resolve in case the resolved value also contains parameters
          return this.resolveParametersInExpr(resolvedParam.value, paramSpace);
        }
      }
      return expr;
    }
    // Recursive case: if this node has kids, resolve them
    const exprAny = expr as any;
    if (exprAny.kids) {
      const kids = exprAny.kids;
      const resolvedKids: any = {};
      for (const [key, child] of Object.entries(kids)) {
        if (child && typeof child === 'object' && (child as any).node) {
          resolvedKids[key] = this.resolveParametersInExpr(
            child as Expr,
            paramSpace
          );
        } else {
          resolvedKids[key] = child;
        }
      }
      return {...exprAny, kids: resolvedKids} as Expr;
    }
    // If no kids, return as-is
    return expr;
  }
  /**
   * Try to fold constant arithmetic expressions to literal values at compile time.
   * This handles simple cases like 11 + 1 -> 12.
   *
   * CONTEXT: This is an optimization over the previous approach, which stored expression
   * trees as-is and let the database evaluate them at query execution time (e.g., SQL
   * would contain "11+1" and the database would compute it). Compile-time folding:
   * - Reduces work for the database
   * - Makes generated SQL cleaner (e.g., "12" instead of "11+1")
   * - Catches errors earlier (at compile time vs runtime)
   *
   * SCOPE: Currently only handles basic arithmetic (+, -, *, /) on number literals.
   * Could be extended to handle more operations (string concatenation, logical ops, etc.)
   * if needed, but the current implementation is intentionally kept simple.
   *
   * ALTERNATIVE APPROACHES:
   * 1. Use constantExprToSQL + database evaluation (most powerful, but requires DB access)
   * 2. Visitor pattern for extensibility (more boilerplate for simple cases)
   * 3. Keep current approach (recommended - simple and works well for the use case)
   *
   * See discussion in conversation history for more details on alternatives.
   */
  private tryFoldConstantExpr(expr: Expr): Expr {
    // Only fold binary arithmetic operations
    if (
      (expr.node === '+' ||
        expr.node === '-' ||
        expr.node === '*' ||
        expr.node === '/') &&
      (expr as any).kids
    ) {
      const kids = (expr as any).kids;
      const left = kids.left;
      const right = kids.right;
      // Both operands must be number literals
      if (
        left?.node === 'numberLiteral' &&
        right?.node === 'numberLiteral' &&
        left.literal &&
        right.literal
      ) {
        const leftVal = Number(left.literal);
        const rightVal = Number(right.literal);
        if (!isNaN(leftVal) && !isNaN(rightVal)) {
          let result: number;
          switch (expr.node) {
            case '+':
              result = leftVal + rightVal;
              break;
            case '-':
              result = leftVal - rightVal;
              break;
            case '*':
              result = leftVal * rightVal;
              break;
            case '/':
              result = leftVal / rightVal;
              break;
            default:
              return expr;
          }
          return {
            node: 'numberLiteral',
            literal: String(result),
          };
        }
      }
    }
    return expr;
  }
  private evaluateArguments(
    parameterSpace: ParameterSpace | undefined,
    parametersIn: Record<string, Parameter> | undefined,
    parametersOut: HasParameter[] | undefined
  ): Record<string, Parameter> {
    const outArguments = {...this.sourceArguments};
    const passedNames = new Set();
    for (const argument of this.args ?? []) {
      const id =
        argument.id ??
        (argument.value instanceof ExprIdReference
          ? argument.value.fieldReference
          : undefined);
      if (id === undefined) {
        argument.value.logError(
          'unnamed-source-argument',
          'Parameterized source arguments must be named with `parameter_name is`'
        );
        continue;
      }
      const name = id.outputName;
      if (passedNames.has(name)) {
        argument.logError(
          'duplicate-source-argument',
          `Cannot pass argument for \`${name}\` more than once`
        );
        continue;
      }
      passedNames.add(name);
      const parameter = (parametersIn ?? {})[name];
      if (!parameter) {
        id.logError(
          'source-parameter-not-found',
          `\`${this.refName}\` has no declared parameter named \`${id.refString}\``
        );
      } else {
        const paramSpace =
          parameterSpace ?? new ParameterSpace(parametersOut ?? []);
        const pVal = argument.value.getExpression(paramSpace);
        let value = pVal.value;
        // If the value is still a parameter reference, try to resolve it recursively
        // This handles cases like: outer(p is 'CA') -> { join: inner(param is p) }
        // where 'param is p' resolves to a parameter node that needs further resolution
        let resolveAttempts = 0;
        const maxResolveAttempts = 10; // Prevent infinite loops
        while (
          value?.node === 'parameter' &&
          resolveAttempts < maxResolveAttempts
        ) {
          const paramRef = value.path[0];
          const resolved = paramSpace.entry(paramRef);
          if (resolved && resolved.refType === 'parameter') {
            const resolvedParam = (resolved as any).parameter();
            if (resolvedParam.value) {
              value = resolvedParam.value;
              resolveAttempts++;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        // NEW: If the value is an expression containing parameters (not just a direct parameter reference),
        // we need to recursively resolve all parameter references within the expression tree
        if (
          value &&
          value.node !== 'parameter' &&
          pVal.evalSpace === 'constant'
        ) {
          const resolvedValue = this.resolveParametersInExpr(value, paramSpace);
          // Try to fold constant expressions (e.g., 11 + 1 -> 12)
          const foldedValue = this.tryFoldConstantExpr(resolvedValue);
          value = foldedValue;
        }
        if (
          pVal.type === 'filter expression' &&
          parameter.type === 'filter expression' &&
          parameter.filterType
        ) {
          // Check filterType from pVal (captured before resolution)
          const filterType = pVal['filterType'];
          // Only check type mismatch if both types are known (not missing due to syntax errors)
          if (filterType && parameter.filterType !== filterType) {
            argument.value.logError(
              'filter-expression-type',
              `Parameter types filter<${parameter.filterType}> and filter<${filterType}> do not match`
            );
          }
          // Also validate the concrete expression if it's not a parameter
          if (value.node !== 'parameter') {
            checkFilterExpression(argument.value, parameter.filterType, value);
          }
        }
        if (pVal.type !== parameter.type && isCastType(parameter.type)) {
          value = castTo(parameter.type, pVal.value, pVal.type, true);
        }
        outArguments[name] = {
          ...parameter,
          value,
        };
      }
    }

    for (const paramName in parametersIn) {
      if (!(paramName in outArguments)) {
        if (!paramHasValue(parametersIn[paramName])) {
          this.refLogError(
            'missing-source-argument',
            `Argument not provided for required parameter \`${paramName}\``
          );
        }
      }
    }

    return outArguments;
  }

  getSourceDef(parameterSpace: ParameterSpace | undefined): SourceDef {
    return this.withParameters(parameterSpace, []);
  }

  withParameters(
    parameterSpace: ParameterSpace | undefined,
    pList: HasParameter[] | undefined
  ): SourceDef {
    /*
          Can't really generate the callback list until after all the
          things before me are translated, and that kinda screws up
          the translation process, so that might be a better place
          to start the next step, because how that gets done might
          make any code I write which ignores the translation problem
          kind of meaningless.


          Maybe the output of a translation is something which describes
          all the missing data, and then there is a "link" step where you
          can do other translations and link them into a partial translation
          which might result in a full translation.
        */
    const base = this.modelStruct();
    if (!base) {
      const notFound = ErrorFactory.structDef;
      const err = `${this.refName}-undefined`;
      notFound.name = notFound.name + err;
      notFound.dialect = notFound.dialect + err;
      return notFound;
    }

    const outParameters = {};
    for (const parameter of pList ?? []) {
      const compiled = parameter.parameter();
      outParameters[compiled.name] = compiled;
    }

    const outArguments = this.evaluateArguments(
      parameterSpace,
      base.parameters,
      pList
    );
    for (const paramName in base.parameters) {
      if (
        !(paramName in outArguments) &&
        paramHasValue(base.parameters[paramName])
      ) {
        outArguments[paramName] = {...base.parameters[paramName]};
      }
    }

    const ret = {...base, parameters: outParameters, arguments: outArguments};
    this.document()?.rememberToAddModelAnnotations(ret);
    return ret;
  }
}
