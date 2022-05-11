/**
 * Original at https://github.com/aws-amplify/amplify-cli
 * Licensed under the Apache License, Version 2.0
 * Copyright (c) Amazon.com, Inc. or its affiliates.
 * Modifications Copyright (c) Resilient Software
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  BaseVisitor,
  buildScalars,
  DEFAULT_SCALARS,
  NormalizedScalarsMap,
  ParsedConfig,
  RawConfig,
} from '@graphql-codegen/visitor-plugin-common';
import { constantCase } from 'change-case';
import { plural } from 'pluralize';
import crypto from 'crypto';
import {
  DefinitionNode,
  DirectiveNode,
  EnumTypeDefinitionNode,
  FieldDefinitionNode,
  GraphQLNamedType,
  GraphQLSchema,
  InterfaceTypeDefinitionNode,
  Kind,
  ObjectTypeDefinitionNode,
  parse,
  valueFromASTUntyped,
} from 'graphql';
import { getTypeInfo } from '@aws-amplify/appsync-modelgen-plugin/lib/utils/get-type-info';
import { CodeGenFieldConnection } from '@aws-amplify/appsync-modelgen-plugin/lib/utils/process-connections';
import { sortFields } from '@aws-amplify/appsync-modelgen-plugin/lib/utils/sort';
import { processAuthDirective } from '@aws-amplify/appsync-modelgen-plugin/lib/utils/process-auth';

export enum CodeGenGenerateEnum {
  metadata = 'metadata',
  code = 'code',
  loader = 'loader',
}
export interface RawAppSyncModelConfig extends RawConfig {
  /**
   * @name target
   * @type string
   * @description required, the language target for generated code
   *
   * @example
   * ```yml
   * generates:
   * Models:
   * config:
   *    target: 'swift'
   *  plugins:
   *    - @aws-amplify/appsync-modelgen-plugin
   * ```
   * target: 'swift'| 'javascript'| 'typescript' | 'java' | 'metadata' | 'dart'
   */
  target: string;

  /**
   * @name modelName
   * @type string
   * @description optional, name of the model to which the code needs to be generated. Used
   * when target is set to swift, java and dart
   * @default undefined, this will generate code for all the models
   *
   * generates:
   * Models:
   * config:
   *    target: 'swift'
   *    model: Todo
   *  plugins:
   *    - @aws-amplify/appsync-modelgen-plugin
   * ```
   */
  selectedType?: string;

  /**
   * @name generate
   * @type string
   * @description optional, informs what needs to be generated.
   * type - Generate class or struct
   * metadata - Generate metadata used by swift and JS/TS
   * loader - Class/Struct loader used by swift or Java
   * @default code, this will generate non meta data code
   *
   * generates:
   * Models:
   * config:
   *    target: 'swift'
   *    model: Todo
   *    generate: 'metadata'
   *  plugins:
   *    - @aws-amplify/appsync-modelgen-plugin
   * ```
   */
  generate?: CodeGenGenerateEnum;
  /**
   * @name directives
   * @type string
   * @descriptions optional string which includes directive definition and types used by directives. The types defined in here won't make it to output
   */
  directives?: string;
}

// Todo: need to figure out how to share config
export interface ParsedAppSyncModelConfig extends ParsedConfig {
  selectedType?: string;
  generate?: CodeGenGenerateEnum;
}
export type CodeGenArgumentsMap = Record<string, any>;

export type CodeGenDirective = {
  name: string;
  arguments: CodeGenArgumentsMap;
};

export type CodeGenDirectives = CodeGenDirective[];
export type CodeGenField = TypeInfo & {
  name: string;
  directives: CodeGenDirectives;
  connectionInfo?: CodeGenFieldConnection;
};
export type TypeInfo = {
  type: string;
  isList: boolean;
  isNullable: boolean;
  isListNullable?: boolean;
  baseType?: GraphQLNamedType | null;
};
export type CodeGenModel = {
  name: string;
  type: 'model';
  directives: CodeGenDirectives;
  fields: CodeGenField[];
};

export type CodeGenInterface = {
  name: string;
  type: 'interface';
  fields: CodeGenField[];
};

export type CodeGenEnum = {
  name: string;
  type: 'enum';
  values: CodeGenEnumValueMap;
};
export type CodeGenModelMap = {
  [modelName: string]: CodeGenModel;
};
export type CodeGenInterfaceMap = {
  [interfaceName: string]: CodeGenInterface;
};

export type CodeGenEnumValueMap = { [enumConvertedName: string]: string };

export type CodeGenEnumMap = Record<string, CodeGenEnum>;

export class AppSyncModelVisitor<
  TRawConfig extends RawAppSyncModelConfig = RawAppSyncModelConfig,
  TPluginConfig extends ParsedAppSyncModelConfig = ParsedAppSyncModelConfig
> extends BaseVisitor<TRawConfig, TPluginConfig> {
  public modelMap: CodeGenModelMap = {};

  public nonModelMap: CodeGenModelMap = {};

  public enumMap: CodeGenEnumMap = {};

  public interfaceMap: CodeGenInterfaceMap = {};

  protected READ_ONLY_FIELDS = ['id'];

  protected SCALAR_TYPE_MAP: Record<string, string> = {};

  protected typesToSkip: string[] = [];

  constructor(
    protected _schema: GraphQLSchema,
    rawConfig: TRawConfig,
    additionalConfig: Partial<TPluginConfig>,
    defaultScalars: NormalizedScalarsMap = DEFAULT_SCALARS
  ) {
    super(rawConfig, {
      ...additionalConfig,
      scalars: buildScalars(_schema, rawConfig.scalars || '', defaultScalars),
    });

    const typesUsedInDirectives: string[] = [];
    if (rawConfig.directives) {
      const directiveSchema = parse(rawConfig.directives);
      directiveSchema.definitions.forEach((definition: DefinitionNode) => {
        if (definition.kind === Kind.ENUM_TYPE_DEFINITION || definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) {
          typesUsedInDirectives.push(definition.name.value);
        }
      });
    }

    this.typesToSkip = [this._schema.getQueryType(), this._schema.getMutationType(), this._schema.getSubscriptionType()]
      .filter((t) => t)
      .map((t) => (t && t.name) || '');
    this.typesToSkip.push(...typesUsedInDirectives);
  }

  get models() {
    return this.modelMap;
  }

  get enums() {
    return this.enumMap;
  }

  get nonModels() {
    return this.nonModelMap;
  }

  ObjectTypeDefinition(node: ObjectTypeDefinitionNode, index?: string | number, parent?: any) {
    if (this.typesToSkip.includes(node.name.value)) {
      // Skip Query, mutation and subscription type
      return;
    }
    const directives = this.getDirectives(node.directives);
    const fields = node.fields as unknown as CodeGenField[];
    if (directives.find((directive) => directive.name === 'model')) {
      const model: CodeGenModel = {
        name: node.name.value,
        type: 'model',
        directives,
        fields,
      };
      this.ensureField(model, 'id', 'ID', false);
      this.sortFields(model);
      this.modelMap[node.name.value] = model;
    } else {
      const nonModel: CodeGenModel = {
        name: node.name.value,
        type: 'model',
        directives,
        fields,
      };
      this.nonModelMap[node.name.value] = nonModel;
    }
  }

  FieldDefinition(node: FieldDefinitionNode): CodeGenField {
    const directive = this.getDirectives(node.directives);
    return {
      name: node.name.value,
      directives: directive,
      ...getTypeInfo(node.type, this._schema),
    };
  }

  EnumTypeDefinition(node: EnumTypeDefinitionNode): void {
    if (this.typesToSkip.includes(node.name.value)) {
      // Skip Query, mutation and subscription type and additional
      return;
    }
    const enumName = this.getEnumName(node.name.value);
    const values = node.values
      ? node.values.reduce((acc, val) => {
          acc[this.getEnumValue(val.name.value)] = val.name.value;
          return acc;
        }, {} as any)
      : {};
    this.enumMap[node.name.value] = {
      name: enumName,
      type: 'enum',
      values,
    };
  }

  InterfaceTypeDefinition(node: InterfaceTypeDefinitionNode): void {
    const fields = node.fields as unknown as CodeGenField[];

    this.interfaceMap[node.name.value] = {
      name: node.name.value,
      type: 'interface',
      fields,
    };
  }

  processDirectives() {
    this.processConnectionDirective();
    this.processAuthDirectives();
  }

  generate(): string {
    this.processDirectives();
    return '';
  }

  /**
   * Returns an object that contains all the models that need codegen to be run
   *
   */
  protected getSelectedModels(): CodeGenModelMap {
    if (this._parsedConfig.selectedType) {
      const selectedModel = this.modelMap[this._parsedConfig.selectedType];
      return selectedModel ? { [this._parsedConfig.selectedType]: selectedModel } : {};
    }
    return this.modelMap;
  }

  protected getSelectedNonModels(): CodeGenModelMap {
    if (this._parsedConfig.selectedType) {
      const selectedModel = this.nonModelMap[this._parsedConfig.selectedType];
      return selectedModel ? { [this._parsedConfig.selectedType]: selectedModel } : {};
    }
    return this.nonModelMap;
  }

  protected getSelectedEnums(): CodeGenEnumMap {
    if (this._parsedConfig.selectedType) {
      const selectedModel = this.enumMap[this._parsedConfig.selectedType];
      return selectedModel ? { [this._parsedConfig.selectedType]: selectedModel } : {};
    }
    return this.enumMap;
  }

  protected selectedTypeIsEnum() {
    if (this._parsedConfig && this._parsedConfig.selectedType) {
      if (this._parsedConfig.selectedType in this.enumMap) {
        return true;
      }
    }
    return false;
  }

  protected selectedTypeIsNonModel() {
    if (this._parsedConfig && this._parsedConfig.selectedType) {
      if (this._parsedConfig.selectedType in this.nonModelMap) {
        return true;
      }
    }
    return false;
  }

  /**
   * returns the Java type or class name
   * @param field
   */
  protected getNativeType(field: CodeGenField): string {
    const typeName = field.type;
    let typeNameStr: string = '';
    if (typeName in this.scalars) {
      typeNameStr = this.scalars[typeName];
    } else if (this.isModelType(field)) {
      typeNameStr = this.getModelName(this.modelMap[typeName]);
    } else if (this.isEnumType(field)) {
      typeNameStr = this.getEnumName(this.enumMap[typeName]);
    } else if (this.isNonModelType(field)) {
      typeNameStr = this.getNonModelName(this.nonModelMap[typeName]);
    } else {
      throw new Error(`Unknown type ${typeName} for field ${field.name}. Did you forget to add the @model directive`);
    }

    return field.isList ? this.getListType(typeNameStr, field) : typeNameStr;
  }

  protected getListType(typeStr: string, field: CodeGenField): string {
    return `List<${typeStr}>`;
  }

  protected getFieldName(field: CodeGenField): string {
    return field.name;
  }

  protected getEnumName(enumField: CodeGenEnum | string): string {
    if (typeof enumField === 'string') {
      return enumField;
    }
    return enumField.name;
  }

  protected getModelName(model: CodeGenModel) {
    return model.name;
  }

  protected getNonModelName(model: CodeGenModel) {
    return model.name;
  }

  protected getEnumValue(value: string): string {
    return constantCase(value);
  }

  protected isEnumType(field: CodeGenField): boolean {
    const typeName = field.type;
    return typeName in this.enumMap;
  }

  protected isModelType(field: CodeGenField): boolean {
    const typeName = field.type;
    return typeName in this.modelMap;
  }

  protected isNonModelType(field: CodeGenField): boolean {
    const typeName = field.type;
    return typeName in this.nonModelMap;
  }

  protected computeVersion(): string {
    // Sort types
    const typeArr: any[] = [];
    Object.values({ ...this.modelMap, ...this.nonModelMap }).forEach((obj: CodeGenModel) => {
      // include only key directive as we don't care about others for versioning
      const directives = obj.directives.filter((dir) => dir.name === 'key');
      const fields = obj.fields
        .map((field: CodeGenField) => {
          // include only connection field and type
          const fieldDirectives = field.directives.filter((fieldDirective) => fieldDirective.name === 'connection');
          return {
            name: field.name,
            directives: fieldDirectives,
            type: field.type,
          };
        })
        .sort((a, b) => sortFields(a, b));
      typeArr.push({
        name: obj.name,
        directives,
        fields,
      });
    });
    typeArr.sort(sortFields);
    return crypto.createHash('MD5').update(JSON.stringify(typeArr)).digest().toString('hex');
  }

  /**
   * Sort the fields to ensure id is always the first field
   * @param model
   */
  protected sortFields(model: CodeGenModel) {
    // sort has different behavior in node 10 and 11. Using reduce instead
    model.fields = model.fields.reduce((acc, field) => {
      if (field.name === 'id') {
        acc.unshift(field);
      } else {
        acc.push(field);
      }
      return acc;
    }, [] as CodeGenField[]);
  }

  protected ensureField(model: CodeGenModel, name: string, type: string, isNullable: boolean) {
    const idField = model.fields.find((field) => field.name === name);
    if (idField) {
      if (idField.type !== type) {
        throw new Error(`id field on ${model.name} should be of type ID`);
      }
      // Make id field required
      idField.isNullable = false;
    } else {
      model.fields.splice(0, 0, {
        name: name,
        type: type,
        isNullable: isNullable,
        isList: false,
        directives: [],
      });
    }
  }

  protected processConnectionDirective(): void {}

  protected processAuthDirectives(): void {
    // model @auth process
    Object.values(this.modelMap).forEach((model) => {
      const filteredDirectives = model.directives.filter((d) => d.name !== 'auth');
      const authDirectives = processAuthDirective(model.directives);
      model.directives = [...filteredDirectives, ...authDirectives];

      // field @auth process
      model.fields.forEach((field) => {
        const nonAuthDirectives = field.directives.filter((d) => d.name !== 'auth');
        const fieldAuthDirectives = processAuthDirective(field.directives);
        field.directives = [...nonAuthDirectives, ...fieldAuthDirectives];
      });
    });
  }

  protected pluralizeModelName(model: CodeGenModel): string {
    return plural(model.name);
  }

  private getDirectives(directives: readonly DirectiveNode[] | undefined): CodeGenDirectives {
    if (directives) {
      return directives.map((d) => ({
        name: d.name.value,
        arguments: this.getDirectiveArguments(d),
      }));
    }
    return [];
  }

  private getDirectiveArguments(directive: DirectiveNode): CodeGenArgumentsMap {
    const directiveArguments: CodeGenArgumentsMap = {};
    if (directive.arguments) {
      directive.arguments.reduce((acc, arg) => {
        directiveArguments[arg.name.value] = valueFromASTUntyped(arg.value);
        return directiveArguments;
      }, directiveArguments);
    }
    return directiveArguments;
  }
}
