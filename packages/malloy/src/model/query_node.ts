/*
 * Copyright Contributors to the Malloy project
 * SPDX-License-Identifier: MIT
 */

import {v4 as uuidv4} from 'uuid';
import type {
  FieldDef,
  BooleanFieldDef,
  DateFieldDef,
  StringFieldDef,
  JSONFieldDef,
  NumberFieldDef,
  TimestampFieldDef,
  NativeUnsupportedFieldDef,
  JoinFieldDef,
  Argument,
  PrepareResultOptions,
  AtomicFieldDef,
  BasicAtomicDef,
  FilterCondition,
  Parameter,
  RefToField,
  StructDef,
  TurtleDef,
  TurtleDefPlusFilters,
  SourceDef,
  Query,
} from './malloy_types';
import {
  isSourceDef,
  getIdentifier,
  isBaseTable,
  hasExpression,
  isAtomic,
  isJoinedSource,
  expressionIsAggregate,
  expressionIsCalculation,
} from './malloy_types';
import type {EventStream} from '../runtime_types';
import {annotationToTag} from '../annotation';
import type {Tag} from '@malloydata/malloy-tag';
import type {Dialect, FieldReferenceType} from '../dialect';
import {getDialect} from '../dialect';
import {exprMap} from './utils';

abstract class QueryNode {
  readonly referenceId: string;
  constructor(referenceId?: string) {
    this.referenceId = referenceId ?? uuidv4();
  }
  abstract getIdentifier(): string;
  getChildByName(_name: string): QueryField | undefined {
    return undefined;
  }
}

export class QueryField extends QueryNode {
  fieldDef: FieldDef;
  parent: QueryStruct;

  constructor(fieldDef: FieldDef, parent: QueryStruct, referenceId?: string) {
    super(referenceId);
    this.fieldDef = fieldDef;
    this.parent = parent;
    this.fieldDef = fieldDef;
  }

  getIdentifier() {
    return getIdentifier(this.fieldDef);
  }

  getJoinableParent(): QueryStruct {
    const parent = this.parent;
    // Skip record parents
    if (parent.structDef.type === 'record') {
      return parent.getJoinableParent();
    }
    // FIX: Skip query_source parents to avoid self-references
    // When a field's parent is a query_source (e.g., a join with a pipeline),
    // we don't want to add that query_source as a join to itself.
    // Instead, traverse up to find a proper joinable parent.
    if (parent.structDef.type === 'query_source') {
      if (parent.parent) {
        const result = parent.getJoinableParent();
        return result;
      }
      // If no grandparent, return the query_source's parent anyway
      // (this shouldn't happen in normal cases)
    }
    return parent;
  }

  isAtomic() {
    return isAtomic(this.fieldDef);
  }

  getFullOutputName() {
    return this.parent.getFullOutputName() + this.getIdentifier();
  }

  isNestedInParent(parentDef: FieldDef) {
    switch (parentDef.type) {
      case 'record':
      case 'array':
        return true;
      default:
        return false;
    }
  }

  isArrayElement(parentDef: FieldDef) {
    return (
      parentDef.type === 'array' &&
      parentDef.elementTypeDef.type !== 'record_element'
    );
  }

  includeInWildcard() {
    return false;
  }
}

export abstract class QueryAtomicField<
  T extends AtomicFieldDef,
> extends QueryField {
  fieldDef: T;

  constructor(fieldDef: T, parent: QueryStruct, refId?: string) {
    super(fieldDef, parent, refId);
    this.fieldDef = fieldDef; // wish I didn't have to do this
  }

  includeInWildcard(): boolean {
    return this.fieldDef.name !== '__distinct_key';
  }

  getFilterList(): FilterCondition[] {
    return [];
  }
}

export class QueryFieldBoolean extends QueryAtomicField<BooleanFieldDef> {}

export class QueryFieldDate extends QueryAtomicField<DateFieldDef> {}

export class QueryFieldDistinctKey extends QueryAtomicField<StringFieldDef> {}

export class QueryFieldJSON extends QueryAtomicField<JSONFieldDef> {}

export class QueryFieldNumber extends QueryAtomicField<NumberFieldDef> {}

export class QueryFieldString extends QueryAtomicField<StringFieldDef> {}

/*
 * The input to a query will always be a QueryStruct. A QueryStruct is also a namespace
 * for tracking joins, and so a QueryFieldStruct is a QueryField which has a QueryStruct.
 *
 * This is a result of it being impossible to inherit both from QueryStruct and QueryField
 * for array and record types.
 */
export class QueryFieldStruct extends QueryField {
  queryStruct: QueryStruct;
  fieldDef: JoinFieldDef;
  constructor(
    jfd: JoinFieldDef,
    sourceArguments: Record<string, Argument> | undefined,
    parent: QueryStruct,
    prepareResultOptions: PrepareResultOptions,
    referenceId?: string
  ) {
    super(jfd, parent, referenceId);
    this.fieldDef = jfd;
    // Use parent.arguments() which resolves through parent chain and includes runtime values
    // This ensures join pipelines get access to runtime parameter values from the run: statement
    const finalSourceArguments = sourceArguments ?? parent.arguments();
    this.queryStruct = new QueryStruct(
      jfd,
      finalSourceArguments,
      {struct: parent},
      prepareResultOptions
    );
  }

  /*
   * Proxy the field-like methods that QueryStruct implements, eventually
   * those probably should be in here ... I thought this would be important
   * but maybe it isn't, it doesn't fix the problem I am working on ...
   */

  getJoinableParent() {
    return this.queryStruct.getJoinableParent();
  }

  getFullOutputName() {
    return this.queryStruct.getFullOutputName();
  }

  includeInWildcard(): boolean {
    return this.isAtomic();
  }
}

export class QueryFieldTimestamp extends QueryAtomicField<TimestampFieldDef> {}

export class QueryFieldUnsupported extends QueryAtomicField<NativeUnsupportedFieldDef> {}
/*
 * When compound (arrays, records) types became atomic types, it became unclear
 * which code wanted just "numbers and strings" and which code wanted anything
 * atomic.
 *
 * All of the original QueryFields are now members of "QueryBasicField"
 *
 * I think the re-factor for adding atomic compound types isn't done yet,
 * but things are working well enough now. A bug with nesting repeated
 * records revealed the need for isScalarField, but I was not brave
 * enough to look at all the calls is isBasicScalar.
 */
export type QueryBasicField = QueryAtomicField<BasicAtomicDef>;

// ============================================================================
// QueryField utility functions (consolidated from is_* files)
// ============================================================================

export function isAggregateField(f: QueryField): boolean {
  if (f.isAtomic() && hasExpression(f.fieldDef)) {
    return expressionIsAggregate(f.fieldDef.expressionType);
  }
  return false;
}

export function isCalculatedField(f: QueryField): boolean {
  if (f.isAtomic() && hasExpression(f.fieldDef)) {
    return expressionIsCalculation(f.fieldDef.expressionType);
  }
  return false;
}

export function isScalarField(f: QueryField): boolean {
  if (f.isAtomic()) {
    if (hasExpression(f.fieldDef)) {
      const et = f.fieldDef.expressionType;
      if (expressionIsCalculation(et) || expressionIsAggregate(et)) {
        return false;
      }
    }
    return true;
  }
  return false;
}

export function isBasicAggregate(f: QueryField): f is QueryBasicField {
  return f instanceof QueryAtomicField && isAggregateField(f);
}

export function isBasicCalculation(f: QueryField): f is QueryBasicField {
  return f instanceof QueryAtomicField && isCalculatedField(f);
}

export function isBasicScalar(f: QueryField): f is QueryBasicField {
  return f instanceof QueryAtomicField && isScalarField(f);
}

// Parent interface for QueryStruct
export interface ParentQueryStruct {
  struct: QueryStruct;
}

/*
 * So that we don't have to includeQueryModel. Put properties
 * of query model which are needed in here.
 */
export interface ModelRootInterface {
  eventStream?: EventStream;
}

export interface ParentQueryModel {
  model: ModelRootInterface;
}

function identifierNormalize(s: string) {
  return s.replace(/[^a-zA-Z0-9_]/g, '_o_');
}
/**
 * Parameter scope for tracking parameter bindings separately from structural parent chain.
 * This allows parameters to flow through query pipelines and joins without coupling
 * to the structural query tree.
 */
export interface ParameterScope {
  /** Bindings available in this scope (parameter name -> Argument) */
  readonly bindings: Record<string, Argument>;
  /** Parent scope in the lexical chain (not the structural parent) */
  readonly parent?: ParameterScope;
  /** Metadata for debugging and diagnostics */
  readonly meta: {
    origin: 'run' | 'source' | 'stage' | 'join' | 'pipeline' | 'view';
    name: string;
  };
}
/** Structure object as it is used to build a query */
export class QueryStruct {
  parent: QueryStruct | undefined;
  paramScope: ParameterScope;
  model: ModelRootInterface;
  nameMap = new Map<string, QueryField>();
  pathAliasMap: Map<string, string>;
  dialect: Dialect;
  connectionName: string;
  /**
   * For fields which are a record, but the value is an expression
   * we capture the context needed to generate the expression in
   * QueryQuery.expandRecordExpressions. Later in the compilation if a
   * reference passes through this struct, this will call
   * the expression compiler with the correct context
   * to compute the record value.
   */
  computeRecordExpression?: () => string;
  recordValue?: string;
  // Removed runtime arg bag; rely on arguments() only
  constructor(
    public structDef: StructDef,
    readonly sourceArguments: Record<string, Argument> | undefined,
    parent: ParentQueryStruct | ParentQueryModel,
    readonly prepareResultOptions: PrepareResultOptions
  ) {
    this.setParent(parent);
    // Initialize paramScope (separate from structural parent)
    if ('model' in parent) {
      // Root scope: no parent scope, bindings from sourceArguments
      this.paramScope = {
        bindings: sourceArguments || {},
        parent: undefined,
        meta: {
          origin: 'run',
          name: getIdentifier(structDef),
        },
      };
      this.model = parent.model;
      this.pathAliasMap = new Map<string, string>();
      if (isSourceDef(structDef)) {
        this.connectionName = structDef.connection;
      } else {
        throw new Error('All root StructDefs should be a baseTable');
      }
    } else {
      // Child scope: inherit from parent struct's paramScope
      this.paramScope = {
        bindings: sourceArguments || {},
        parent: parent.struct.paramScope,
        meta: {
          origin: 'source', // Will be refined in specific contexts (join, pipeline, etc.)
          name: getIdentifier(structDef),
        },
      };
      this.model = this.getModel();
      this.pathAliasMap = this.root().pathAliasMap;
      this.connectionName = this.root().connectionName;
    }

    this.dialect = getDialect(this.findFirstDialect());
    this.addFieldsFromFieldList(structDef.fields);
  }

  // Injeected factory to break circularity with QueryQuery
  private static turtleFieldMaker:
    | ((field: TurtleDef, parent: QueryStruct) => QueryField)
    | undefined;

  static registerTurtleFieldMaker(
    maker: (field: TurtleDef, parent: QueryStruct) => QueryField
  ) {
    QueryStruct.turtleFieldMaker = maker;
  }

  private _modelTag: Tag | undefined = undefined;
  modelCompilerFlags(): Tag {
    if (this._modelTag === undefined) {
      const annotation = this.structDef.modelAnnotation;
      const {tag} = annotationToTag(annotation, {prefix: /^##!\s*/});
      this._modelTag = tag;
    }
    return this._modelTag;
  }

  protected findFirstDialect(): string {
    if (isSourceDef(this.structDef)) {
      return this.structDef.dialect;
    }
    if (this.parent) {
      return this.parent.findFirstDialect();
    }
    throw new Error('Cannot create QueryStruct from record with model parent');
  }

  maybeEmitParameterizedSourceUsage() {
    if (isSourceDef(this.structDef)) {
      const paramsAndArgs = {
        ...this.structDef.parameters,
        ...this.structDef.arguments,
      };
      if (Object.values(paramsAndArgs).length === 0) return;
      this.eventStream?.emit('parameterized-source-compiled', {
        parameters: paramsAndArgs,
      });
    }
  }

  private resolveParentParameterReferences(param: Parameter): Parameter {
    return {
      ...param,
      value:
        param.value === null
          ? null
          : exprMap(param.value, frag => {
              if (frag.node === 'parameter') {
                const resolved1 = (
                  this.parent ? this.parent.arguments() : this.arguments()
                )[frag.path[0]];
                if (!resolved1) {
                  this.eventStream?.emit('parameter-miss', {
                    scope: getIdentifier(this.structDef),
                    name: frag.path[0],
                    available: Object.keys(
                      this.parent ? this.parent.arguments() : this.arguments()
                    ),
                  });
                  throw new Error(
                    `Parameter '${frag.path[0]}' not found in current scope`
                  );
                }
                const resolved2 = this.parent
                  ? this.parent.resolveParentParameterReferences(resolved1)
                  : resolved1;
                if (resolved2.value === null) {
                  throw new Error('Invalid parameter value');
                } else {
                  return resolved2.value;
                }
              }
              return frag;
            }),
    };
  }

  private _arguments: Record<string, Argument> | undefined = undefined;
  arguments(): Record<string, Argument> {
    if (this._arguments !== undefined) {
      return this._arguments;
    }
    this._arguments = {};
    if (isSourceDef(this.structDef)) {
      // Build a concrete argument map: literals stay literals; parameter-node inputs resolve via parent
      const params = this.structDef.parameters ?? {};
      const declaredArgs = this.structDef.arguments ?? {};
      // Changed order: declaredArgs takes precedence initially, but we'll apply sourceArguments
      // selectively later for parameters that are references
      const incoming = {...(this.sourceArguments ?? {}), ...declaredArgs};
      // Seed defaults
      for (const [name, param] of Object.entries(params)) {
        this._arguments[name] = param;
      }
      // Apply overrides from declared/incoming arguments with resolution of parameter references
      const resolveFromParents = (refName: string): Argument | undefined => {
        let cur: QueryStruct | undefined = this.parent;
        while (cur) {
          const a = cur.arguments?.();
          const found = a?.[refName];
          if (found && found.value !== null && found.value !== undefined) {
            return found;
          }
          cur = cur.parent;
        }
        return undefined;
      };
      for (const [name, arg] of Object.entries(incoming)) {
        const v: any = (arg as any)?.value;
        if (v && v.node === 'parameter') {
          const refName =
            Array.isArray(v.path) && v.path.length > 0 ? v.path[0] : undefined;
          if (!refName) {
            throw new Error('Invalid parameter reference');
          }
          const resolved = resolveFromParents(refName);
          if (!resolved) {
            // During model loading, parent might not have arguments resolved yet.
            // Keep the parameter reference as-is; it will be resolved at runtime.
            this._arguments[name] = arg as Argument;
          } else {
            this._arguments[name] = {
              ...(arg as any),
              value: resolved.value,
            } as Argument;
          }
        } else if (v !== null && v !== undefined) {
          this._arguments[name] = arg as Argument;
        } else {
          // If null here, try parent fallback for same name
          const parentVal = this.parent?.arguments()?.[name];
          if (
            parentVal &&
            parentVal.value !== null &&
            parentVal.value !== undefined
          ) {
            this._arguments[name] = parentVal;
          } else {
            this._arguments[name] = arg as Argument;
          }
        }
      }
      // Ensure provided sourceArguments take precedence, but only for parameters that don't have
      // a concrete value in declaredArgs. This ensures that:
      // 1. declaredArgs with concrete values take precedence over sourceArguments
      // 2. sourceArguments can override declaredArgs that are parameter references
      // 3. sourceArguments still get applied for parameters not in declaredArgs
      if (this.sourceArguments) {
        for (const [k, v] of Object.entries(this.sourceArguments)) {
          const vv: any = (v as any)?.value;
          const declaredValue = declaredArgs[k]?.value;
          const declaredIsParamRef =
            declaredValue && (declaredValue as any).node === 'parameter';
          // Apply sourceArguments if:
          // 1. Parameter is not in declaredArgs, OR
          // 2. Parameter is in declaredArgs but its value is a parameter reference
          if (!(k in declaredArgs) || declaredIsParamRef) {
            if (vv !== null && vv !== undefined) {
              this._arguments[k] = v as Argument;
            }
          }
        }
      }
      // Final parent merge for any missing keys
      if (this.parent) {
        const parentArgs = this.parent.arguments();
        for (const [name, value] of Object.entries(parentArgs)) {
          if (this._arguments[name] === undefined) {
            this._arguments[name] = value;
          }
        }
      }
    } else {
      // Non-source structs (e.g., finalize/nest_source/query_result) should inherit
      // fully-resolved arguments from their parent or use any pre-seeded arguments
      // (e.g., for nested pipelines) provided at construction.
      if (
        this.sourceArguments &&
        Object.keys(this.sourceArguments).length > 0
      ) {
        this._arguments = {...this.sourceArguments};
      } else if (this.parent) {
        this._arguments = {...this.parent.arguments()};
      } else {
        this._arguments = {};
      }
    }
    try {
      const scope = getIdentifier(this.structDef);
      const resolvedKeys = Object.keys(this._arguments);
      const sourceArgKeys = Object.keys(this.sourceArguments ?? {});
      const parentKeys = this.parent
        ? Object.keys(this.parent.arguments())
        : undefined;
      const payload = {
        scope,
        structType: this.structDef.type,
        resolvedKeys,
        sourceArgKeys,
        parentKeys,
        inheritedFromParent:
          !isSourceDef(this.structDef) && sourceArgKeys.length === 0,
      } satisfies Record<string, unknown>;
      this.eventStream?.emit('debug-args-node', payload);
    } catch (_e) {
      // debug instrumentation only
    }
    // IMPORTANT: Update paramScope.bindings with the computed arguments
    // This ensures that child structs (like joins) can inherit the runtime parameter values
    // even if they were created before the runtime wrapper
    (this.paramScope as any).bindings = this._arguments;
    return this._arguments;
  }

  private addFieldsFromFieldList(fields: FieldDef[]) {
    for (const field of fields) {
      const as = getIdentifier(field);

      if (field.type === 'turtle') {
        if (!QueryStruct.turtleFieldMaker) {
          throw new Error(
            'INTERNAL ERROR: QueryQuery must initialize QueryStruct nested factory method'
          );
        }
        this.addFieldToNameMap(as, QueryStruct.turtleFieldMaker(field, this));
      } else if (isAtomic(field) || isJoinedSource(field)) {
        this.addFieldToNameMap(as, this.makeQueryField(field));
      } else {
        throw new Error('mtoy did nit add field');
      }
    }
    // if we don't have distinct key yet for this struct, add it.
    if (!this.nameMap.has('__distinct_key')) {
      this.addFieldToNameMap(
        '__distinct_key',
        new QueryFieldDistinctKey(
          {type: 'string', name: '__distinct_key'},
          this
        )
      );
    }
  }

  // generate unique string for the alias.
  // return a string that can be used to represent the full
  //  join path to a struct.
  getAliasIdentifier(): string {
    const path = this.getFullOutputName();
    const ret: string | undefined = this.pathAliasMap.get(path);

    // make a unique alias name
    if (ret === undefined) {
      const aliases = Array.from(this.pathAliasMap.values());
      const base = identifierNormalize(getIdentifier(this.structDef));
      let name = `${base}_0`;
      let n = 1;
      while (aliases.includes(name) && n < 1000) {
        n++;
        name = `${base}_${n}`;
      }
      if (n < 1000) {
        this.pathAliasMap.set(path, name);
        return name;
      } else {
        throw new Error('Internal Error: cannot create unique alias name');
      }

      // get the malloy name for this struct (will include a trailing dot)
      // return this.getFullOutputName().replace(/\.$/, "").replace(/\./g, "_o_");
    } else {
      return ret;
    }
  }

  getSQLIdentifier(): string {
    if (this.unnestWithNumbers() && this.parent !== undefined) {
      const x =
        this.parent.getSQLIdentifier() +
        '.' +
        getIdentifier(this.structDef) +
        `[${this.getIdentifier()}.__row_id]`;
      return x;
    } else {
      return this.getIdentifier();
    }
  }

  sqlSimpleChildReference(name: string) {
    const parentRef = this.getSQLIdentifier();
    let refType: FieldReferenceType = 'table';
    if (this.structDef.type === 'record') {
      refType = 'record';
    } else if (this.structDef.type === 'array') {
      refType =
        this.structDef.elementTypeDef.type === 'record_element'
          ? 'array[record]'
          : 'array[scalar]';
    } else if (this.structDef.type === 'nest_source') {
      refType = 'nest source';
    }
    const child = this.getChildByName(name);
    const childType = child?.fieldDef.type || 'unknown';
    return this.dialect.sqlFieldReference(parentRef, refType, name, childType);
  }

  // return the name of the field in SQL
  getIdentifier(): string {
    // if it is the root table, use provided alias if we have one.
    if (isBaseTable(this.structDef)) {
      return 'base';
    }

    // If this is a synthetic column, return the expression rather than the name
    // because the name will not exist. Only for records because the other types
    // will have joins and thus be in the namespace. We can't compute it here
    // because we don't have access to the Query to call exprToSQL.
    if (this.structDef.type === 'record' && hasExpression(this.structDef)) {
      if (this.computeRecordExpression) {
        if (!this.recordValue) {
          this.recordValue = this.computeRecordExpression();
        }
        return this.recordValue;
      }
      throw new Error('INTERNAL ERROR, record field alias not pre-computed');
    }

    // if this is an inline object, include the parents alias.
    if (this.structDef.type === 'record' && this.parent) {
      return this.parent.sqlSimpleChildReference(getIdentifier(this.structDef));
    }
    // we are somewhere in the join tree.  Make sure the alias is unique.
    return this.getAliasIdentifier();
  }

  // return the name of the field in Malloy
  getFullOutputName(): string {
    if (this.parent) {
      return (
        this.parent.getFullOutputName() + getIdentifier(this.structDef) + '.'
      );
    } else {
      return '';
    }
  }

  unnestWithNumbers(): boolean {
    return this.dialect.unnestWithNumbers && this.structDef.type === 'array';
  }

  getJoinableParent(): QueryStruct {
    // if it is inline it should always have a parent
    if (this.structDef.type === 'record') {
      if (this.parent) {
        return this.parent.getJoinableParent();
      } else {
        throw new Error('Internal Error: inline struct cannot be root');
      }
    }
    return this;
  }

  addFieldToNameMap(as: string, n: QueryField) {
    if (this.nameMap.has(as)) {
      throw new Error(`Redefinition of ${as}`);
    }
    this.nameMap.set(as, n);
  }

  /** the the primary key or throw an error. */
  getPrimaryKeyField(fieldDef: FieldDef): QueryBasicField {
    let pk;
    if ((pk = this.primaryKey())) {
      return pk;
    } else {
      throw new Error(`Missing primary key for ${fieldDef}`);
    }
  }

  /**
   * called after all structure has been loaded.  Examine this structure to see
   * if if it is based on a query and if it is, add the output fields (unless
   * they exist) to the structure.
   *
   * finalOutputStruct exists so that query_node doesn't need to
   * to import query_query
   */
  resolveQueryFields(
    finalOutputStruct: (
      query: Query,
      options: PrepareResultOptions | undefined
    ) => SourceDef | undefined
  ) {
    if (this.structDef.type === 'query_source' && finalOutputStruct) {
      const resultStruct = finalOutputStruct(
        this.structDef.query,
        this.prepareResultOptions
      );

      // should never happen.
      if (!resultStruct) {
        throw new Error("Internal Error, query didn't produce a struct");
      }

      const structDef = {...this.structDef};
      for (const f of resultStruct.fields) {
        const as = getIdentifier(f);
        if (!this.nameMap.has(as)) {
          structDef.fields.push(f);
          this.nameMap.set(as, this.makeQueryField(f));
        }
      }
      this.structDef = structDef;
      if (!this.structDef.primaryKey && resultStruct.primaryKey) {
        this.structDef.primaryKey = resultStruct.primaryKey;
      }
    }
    for (const [, v] of this.nameMap) {
      if (v instanceof QueryFieldStruct) {
        v.queryStruct.resolveQueryFields(finalOutputStruct);
      }
    }
  }

  getModel(): ModelRootInterface {
    if (this.model) {
      return this.model;
    } else {
      if (this.parent === undefined) {
        throw new Error(
          'Expected this query struct to have a parent, as no model was present.'
        );
      }
      return this.parent.getModel();
    }
  }

  get eventStream(): EventStream | undefined {
    return this.getModel().eventStream;
  }

  setParent(parent: ParentQueryStruct | ParentQueryModel) {
    if ('struct' in parent) {
      this.parent = parent.struct;
    }
    if ('model' in parent) {
      this.model = parent.model;
    } else {
      this.model = this.getModel();
    }
  }
  /** makes a new queryable field object from a fieldDef */
  makeQueryField(field: FieldDef, referenceId?: string): QueryField {
    switch (field.type) {
      case 'array':
      case 'record':
      case 'query_source':
      case 'table':
      case 'sql_select':
      case 'composite':
        return new QueryFieldStruct(
          field,
          this.arguments(),
          this,
          this.prepareResultOptions
        );
      case 'string':
        return new QueryFieldString(field, this, referenceId);
      case 'date':
        return new QueryFieldDate(field, this, referenceId);
      case 'timestamp':
        return new QueryFieldTimestamp(field, this, referenceId);
      case 'number':
        return new QueryFieldNumber(field, this, referenceId);
      case 'boolean':
        return new QueryFieldBoolean(field, this, referenceId);
      case 'json':
        return new QueryFieldJSON(field, this, referenceId);
      case 'sql native':
        return new QueryFieldUnsupported(field, this, referenceId);
      case 'turtle':
        if (!QueryStruct.turtleFieldMaker) {
          throw new Error(
            'INTERNAL ERROR: QueryQuery must initialize QueryStruct nested factory method'
          );
        }
        return QueryStruct.turtleFieldMaker(field, this);
      default:
        throw new Error(
          `unknown field definition ${(JSON.stringify(field), undefined, 2)}`
        );
    }
  }

  root(): QueryStruct {
    return this.parent ? this.parent.root() : this;
  }

  primaryKey(): QueryBasicField | undefined {
    if (isSourceDef(this.structDef) && this.structDef.primaryKey) {
      return this.getDimensionByName([this.structDef.primaryKey]);
    } else {
      return undefined;
    }
  }

  getChildByName(name: string): QueryField | undefined {
    return this.nameMap.get(name);
  }
  /** convert a path into a field reference */
  getFieldByName(path: string[]): QueryField {
    let found: QueryField | undefined = undefined;
    let lookIn = this as QueryStruct | undefined;
    let notFound = path[0];
    for (const n of path) {
      found = lookIn?.getChildByName(n);
      if (!found) {
        notFound = n;
        break;
      }
      lookIn =
        found instanceof QueryFieldStruct ? found.queryStruct : undefined;
    }
    if (found === undefined) {
      const pathErr = path.length > 1 ? ` in ${path.join('.')}` : '';
      throw new Error(`${notFound} not found${pathErr}`);
    }
    return found;
  }

  // structs referenced in queries are converted to fields.
  getQueryFieldByName(name: string[]): QueryField {
    const field = this.getFieldByName(name);
    if (field instanceof QueryFieldStruct) {
      throw new Error(`Cannot reference ${name.join('.')} as a scalar'`);
    }
    return field;
  }

  getQueryFieldReference(f: RefToField): QueryField {
    const {path, annotation, drillExpression} = f;
    const field = this.getFieldByName(path);
    if (annotation || drillExpression) {
      if (field.parent === undefined) {
        throw new Error(
          'Inconcievable, field reference to orphaned query field'
        );
      }
      // Made a field object from the source, but the annotations were computed by the compiler
      // when it generated the reference, and has both the source and reference annotations included.
      if (field instanceof QueryFieldStruct) {
        const newDef = {...field.fieldDef, annotation, drillExpression};
        return new QueryFieldStruct(
          newDef,
          undefined,
          field.parent,
          field.parent.prepareResultOptions,
          field.referenceId
        );
      } else {
        const newDef = {...field.fieldDef, annotation, drillExpression};
        return field.parent.makeQueryField(newDef, field.referenceId);
      }
    }
    return field;
  }

  getDimensionOrMeasureByName(name: string[]) {
    const field = this.getFieldByName(name);
    if (!field.isAtomic()) {
      throw new Error(`${name} is not an atomic field? Inconceivable!`);
    }
    return field;
  }

  /** returns a query object for the given name */
  getDimensionByName(name: string[]): QueryBasicField {
    const field = this.getFieldByName(name);

    if (isBasicScalar(field)) {
      return field;
    }
    throw new Error(`${name} is not an atomic scalar field? Inconceivable!`);
  }

  /** returns a query object for the given name */
  getStructByName(name: string[]): QueryStruct {
    if (name.length === 0) {
      return this;
    }
    const struct = this.getFieldByName(name);
    if (struct instanceof QueryFieldStruct) {
      return struct.queryStruct;
    }
    throw new Error(`Error: Path to structure not found '${name.join('.')}'`);
  }

  getDistinctKey(): QueryBasicField {
    if (this.structDef.type !== 'record') {
      return this.getDimensionByName(['__distinct_key']);
    } else if (this.parent) {
      return this.parent.getDistinctKey();
    } else {
      throw new Error('Asking a record for a primary key? Inconceivable!');
    }
  }

  applyStructFiltersToTurtleDef(
    turtleDef: TurtleDef | TurtleDefPlusFilters
  ): TurtleDef {
    const pipeline = [...turtleDef.pipeline];
    const annotation = turtleDef.annotation;

    const addedFilters = (turtleDef as TurtleDefPlusFilters).filterList || [];
    pipeline[0] = {
      ...pipeline[0],
      filterList: addedFilters.concat(
        pipeline[0].filterList || [],
        isSourceDef(this.structDef) ? this.structDef.filterList || [] : []
      ),
    };

    const flatTurtleDef: TurtleDef = {
      type: 'turtle',
      name: turtleDef.name,
      pipeline,
      annotation,
      location: turtleDef.location,
    };
    return flatTurtleDef;
  }
}
