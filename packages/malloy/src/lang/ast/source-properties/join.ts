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

import type {
  Annotation,
  JoinFieldDef,
  JoinType,
  MatrixOperation,
  SourceDef,
  AccessModifierLabel,
  Argument,
} from '../../../model/malloy_types';
import {isSourceDef, isJoinable} from '../../../model/malloy_types';
import type {DynamicSpace} from '../field-space/dynamic-space';
import {JoinSpaceField} from '../field-space/join-space-field';
import {DefinitionList} from '../types/definition-list';
import type {QueryBuilder} from '../types/query-builder';
import type {ExpressionDef} from '../types/expression-def';
import type {FieldSpace} from '../types/field-space';
import type {ModelEntryReference} from '../types/malloy-element';
import {MalloyElement} from '../types/malloy-element';
import type {Noteable} from '../types/noteable';
import {extendNoteMethod} from '../types/noteable';
import type {MakeEntry} from '../types/space-entry';
import type {SourceQueryElement} from '../source-query-elements/source-query-element';
import {ErrorFactory} from '../error-factory';
import {ParameterSpace} from '../field-space/parameter-space';
import type {QueryPropertyInterface} from '../types/query-property-interface';
import {LegalRefinementStage} from '../types/query-property-interface';
import {mergeFieldUsage} from '../../composite-source-utils';
import {NamedSource} from '../source-elements/named-source';
import {HasParameter} from '../parameters/has-parameter';
import {AbstractParameter} from '../types/space-param';

export abstract class Join
  extends MalloyElement
  implements Noteable, MakeEntry
{
  abstract name: ModelEntryReference;
  abstract getStructDef(parameterSpace: ParameterSpace): JoinFieldDef;
  abstract fixupJoinOn(outer: FieldSpace, inStruct: JoinFieldDef): void;
  readonly isNoteableObj = true;
  extendNote = extendNoteMethod;
  abstract sourceExpr: SourceQueryElement;
  note?: Annotation;

  makeEntry(fs: DynamicSpace) {
    fs.newEntry(
      this.name.refString,
      this,
      new JoinSpaceField(
        fs.parameterSpace(),
        this,
        fs.dialectName(),
        fs.connectionName()
      )
    );
  }

  getName(): string {
    return this.name.refString;
  }

  protected getStructDefFromExpr(parameterSpace: ParameterSpace): SourceDef {
    const source = this.sourceExpr.getSource();
    if (!source) {
      this.sourceExpr.sqLog(
        'invalid-join-source',
        'Cannot create a source to join from'
      );
      return ErrorFactory.structDef;
    }
    return source.getSourceDef(parameterSpace);
  }
}

export class KeyJoin extends Join {
  elementType = 'joinOnKey';
  constructor(
    readonly name: ModelEntryReference,
    readonly sourceExpr: SourceQueryElement,
    readonly keyExpr: ExpressionDef
  ) {
    super({name, sourceExpr, keyExpr});
  }

  getStructDef(parameterSpace: ParameterSpace): JoinFieldDef {
    const sourceDef = this.getStructDefFromExpr(parameterSpace);
    if (!isJoinable(sourceDef)) {
      throw this.internalError(`Cannot join struct type '${sourceDef.type}'`);
    }
    const joinStruct: JoinFieldDef = {
      ...sourceDef,
      name: this.name.refString,
      join: 'one',
      matrixOperation: 'left',
      onExpression: {node: 'error', message: "('join fixup'='not done yet')"},
      location: this.location,
    };
    delete joinStruct.as;

    if (this.note) {
      joinStruct.annotation = this.note;
    }
    this.document()?.rememberToAddModelAnnotations(joinStruct);
    return joinStruct;
  }

  fixupJoinOn(outer: FieldSpace, inStruct: JoinFieldDef): void {
    const exprX = this.keyExpr.getExpression(outer);
    if (isSourceDef(inStruct) && inStruct.primaryKey) {
      const pkey = inStruct.fields.find(
        f => (f.as || f.name) === inStruct.primaryKey
      );
      if (pkey) {
        if (pkey.type === exprX.type) {
          const keyPath = [this.name.refString, inStruct.primaryKey];
          inStruct.join = 'one';
          inStruct.onExpression = {
            node: '=',
            kids: {
              left: {
                node: 'field',
                path: keyPath,
                at: this.keyExpr.location,
              },
              right: exprX.value,
            },
          };
          inStruct.fieldUsage = mergeFieldUsage(exprX.fieldUsage, [
            {path: keyPath},
          ]);
          return;
        } else {
          this.logError(
            'join-on-primary-key-type-mismatch',
            `join_one: with type mismatch with primary key: ${exprX.type}/${pkey.type}`
          );
        }
      } else {
        this.logError(
          'join-primary-key-not-found',
          `join_one: Primary key '${pkey}' not found in source`
        );
      }
    } else {
      this.logError(
        'join-with-without-primary-key',
        'join_one: Cannot use with unless source has a primary key'
      );
    }
  }
}

export class ExpressionJoin extends Join {
  elementType = 'joinOnExpr';
  joinType: JoinType = 'one';
  matrixOperation: MatrixOperation = 'left';
  private expr?: ExpressionDef;
  constructor(
    readonly name: ModelEntryReference,
    readonly sourceExpr: SourceQueryElement
  ) {
    super({name, sourceExpr});
  }

  set joinOn(joinExpr: ExpressionDef | undefined) {
    this.expr = joinExpr;
    this.has({on: joinExpr});
  }

  get joinOn(): ExpressionDef | undefined {
    return this.expr;
  }

  fixupJoinOn(outer: FieldSpace, inStruct: JoinFieldDef) {
    if (this.expr === undefined) {
      return;
    }
    const exprX = this.expr.getExpression(outer);
    if (exprX.type !== 'boolean') {
      this.logError(
        'non-boolean-join-on',
        'join conditions must be boolean expressions'
      );
      return;
    }
    inStruct.onExpression = exprX.value;
    inStruct.fieldUsage = exprX.fieldUsage;
  }

  getStructDef(parameterSpace: ParameterSpace): JoinFieldDef {
    const source = this.sourceExpr.getSource();
    if (!source) {
      this.sourceExpr.sqLog(
        'invalid-join-source',
        'Cannot create a source to join from'
      );
      return ErrorFactory.joinDef;
    }

    // For joins with source arguments, we need to ensure the parameter space
    // includes parameters from the outer scope. The source arguments should
    // be able to reference parameters from the outer scope.
    let mergedParameterSpace = parameterSpace;

    // If this is a NamedSource with arguments, we need to merge the outer
    // parameter space with the source's parameters
    if (source instanceof NamedSource && source.args) {
      const sourceModel = source.modelStruct();
      if (sourceModel && sourceModel.parameters) {
        // Extract parameters from the source model
        const sourceParams: HasParameter[] = [];
        for (const [paramName, paramDef] of Object.entries(
          sourceModel.parameters
        )) {
          sourceParams.push(
            new HasParameter({
              name: paramName,
              typeDef: paramDef,
              default: undefined,
            })
          );
        }

        // Extract parameters from the outer parameter space
        const outerParams: HasParameter[] = [];
        for (const [_name, entry] of parameterSpace.entries()) {
          if (entry instanceof AbstractParameter) {
            outerParams.push(entry.astParam);
          }
        }

        // Merge parameters: outer first, then source (outer takes precedence)
        const allParams = [...outerParams, ...sourceParams];
        mergedParameterSpace = new ParameterSpace(allParams);
      }
    }

    // DEBUG: Log what parameter space we're passing to the source
    const sourceType = source.elementType || source.constructor.name;
    if (mergedParameterSpace) {
      const paramNames = Array.from(mergedParameterSpace.entries()).map(
        ([name]) => name
      );
      console.log(
        `[ExpressionJoin.getStructDef] Passing parameterSpace to ${sourceType} with params:`,
        paramNames
      );
    } else {
      console.log(
        `[ExpressionJoin.getStructDef] No parameterSpace for ${sourceType}`
      );
    }

    const sourceDef = source.getSourceDef(mergedParameterSpace);

    // For sources that already have arguments (NamedSource with args or QuerySource),
    // don't merge outer arguments into sourceDef.arguments because they already have
    // the correct argument mapping (e.g., param2 is p)
    const hasExistingArguments =
      (source instanceof NamedSource && source.args) ||
      (sourceDef.arguments && Object.keys(sourceDef.arguments).length > 0);
    console.log(
      `[ExpressionJoin.getStructDef] hasExistingArguments: ${hasExistingArguments}, sourceDef.arguments:`,
      Object.keys(sourceDef.arguments || {})
    );

    if (!hasExistingArguments) {
      // Extract outer arguments from the parameter space and merge them into the sourceDef
      const outerArguments: Record<string, Argument> = {};
      for (const [_name, entry] of parameterSpace.entries()) {
        if (entry instanceof AbstractParameter) {
          outerArguments[_name] = entry.parameter();
        }
      }

      console.log(
        `[ExpressionJoin.getStructDef] Merging outer arguments:`,
        Object.keys(outerArguments)
      );
      // Merge outer arguments into the sourceDef's arguments
      sourceDef.arguments = {...sourceDef.arguments, ...outerArguments};
    }

    let matrixOperation: MatrixOperation = 'left';
    if (this.inExperiment('join_types', true)) {
      matrixOperation = this.matrixOperation;
    }

    if (!isJoinable(sourceDef)) {
      throw this.internalError(`Can't join struct type ${sourceDef.type}`);
    }
    const joinStruct: JoinFieldDef = {
      ...sourceDef,
      name: this.name.refString,
      join: this.joinType,
      matrixOperation,
      location: this.location,
    };
    delete joinStruct.as;
    if (this.note) {
      joinStruct.annotation = this.note;
    }
    this.document()?.rememberToAddModelAnnotations(joinStruct);
    return joinStruct;
  }
}

export class JoinStatement
  extends DefinitionList<Join>
  implements QueryPropertyInterface
{
  elementType = 'joinStatement';
  forceQueryClass = undefined;
  queryRefinementStage = LegalRefinementStage.Single;

  constructor(
    joins: Join[],
    readonly accessModifier: AccessModifierLabel | undefined
  ) {
    super(joins);
  }

  queryExecute(executeFor: QueryBuilder) {
    for (const qel of this.list) {
      executeFor.inputFS.extendSource(qel);
      executeFor.alwaysJoins.push(qel.name.refString);
    }
  }

  get delarationNames(): string[] {
    return this.list.map(el => el.name.refString);
  }
}
