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

import { TypeScriptDeclarationBlock } from '@aws-amplify/appsync-modelgen-plugin/lib/languages/typescript-declaration-block';
import {
  AppSyncModelVisitor,
  CodeGenEnum,
  CodeGenField,
  CodeGenInterface,
  CodeGenModel,
  ParsedAppSyncModelConfig,
  RawAppSyncModelConfig,
} from './appsync-visitor';

export interface RawAppSyncModelTypeScriptConfig extends RawAppSyncModelConfig {}
export interface ParsedAppSyncModelTypeScriptConfig extends ParsedAppSyncModelConfig {
  isDeclaration: boolean;
}

export class AppSyncModelTypeScriptVisitor<
  TRawConfig extends RawAppSyncModelTypeScriptConfig = RawAppSyncModelTypeScriptConfig,
  TPluginConfig extends ParsedAppSyncModelTypeScriptConfig = ParsedAppSyncModelTypeScriptConfig
> extends AppSyncModelVisitor<TRawConfig, TPluginConfig> {
  protected SCALAR_TYPE_MAP: { [key: string]: string } = {
    String: 'string',
    Int: 'number',
    Float: 'number',
    Boolean: 'boolean',
    ID: 'string',
  };

  protected IMPORT_STATEMENTS = [];

  generate(): string {
    this.processDirectives();
    const imports = this.generateImports();
    const enumDeclarations = Object.values(this.enumMap)
      .map((enumObj) => this.generateEnumDeclarations(enumObj))
      .join('\n\n');

    const modelDeclarations = Object.values(this.modelMap)
      .map((typeObj) => this.generateModelDeclaration(typeObj).replace('export declare class', 'export interface'))
      .join('\n\n');

    const nonModelDeclarations = Object.values(this.nonModelMap)
      .map((typeObj) => this.generateModelDeclaration(typeObj).replace('export declare class', 'export interface'))
      .join('\n\n');

    const interfaceDeclarations = Object.values(this.interfaceMap)
      .map((typeObj) => this.generateInterfaceDeclaration(typeObj))
      .join('\n\n');

    return [imports, enumDeclarations, modelDeclarations, nonModelDeclarations, interfaceDeclarations].join('\n\n');
  }

  protected generateImports(): string {
    return this.IMPORT_STATEMENTS.join('\n');
  }

  protected generateEnumDeclarations(enumObj: CodeGenEnum, exportEnum: boolean = false): string {
    return `import { ${this.getEnumName(enumObj)} } from '../types';`;
  }

  /**
   *
   * @param modelObj CodeGenModel object
   * @param isDeclaration flag indicates if the class needs to be exported
   */
  protected generateModelDeclaration(modelObj: CodeGenModel, isDeclaration: boolean = true): string {
    const modelName = this.generateModelTypeDeclarationName(modelObj);
    const modelDeclarations = new TypeScriptDeclarationBlock()
      .asKind('class')
      .withFlag({ isDeclaration })
      .withName(modelName)
      .export(true);
    modelObj.fields.forEach((field) => {
      modelDeclarations.addProperty(this.getFieldName(field), this.getNativeType(field), undefined, 'DEFAULT', {
        readonly: false,
        optional: field.isList ? field.isListNullable : field.isNullable,
      });
    });
    return modelDeclarations.string;
  }

  /**
   * Generate the type declaration class name of Model
   * @param model CodeGenModel
   */
  protected generateModelTypeDeclarationName(model: CodeGenModel): string {
    return `${this.getModelName(model)}Model`;
  }

  /**
   * Generate alias for the model used when importing it from initSchema
   * @param model
   */
  protected generateModelImportAlias(model: CodeGenModel): string {
    return this.getModelName(model);
  }

  /**
   * Generate the import name for model from initSchema
   * @param model Model object
   *
   */
  protected generateModelImportName(model: CodeGenModel): string {
    return this.getModelName(model);
  }

  /**
   * Generate the class name for export
   * @param model
   */
  protected generateModelExportName(model: CodeGenModel): string {
    return this.getModelName(model);
  }

  protected getListType(typeStr: string, field: CodeGenField): string {
    let type: string = typeStr;
    if (field.isNullable) {
      type = `(${type} | null)`;
    }
    return `${type}[]`;
  }

  protected getNativeType(field: CodeGenField): string {
    const typeName = field.type;
    if (!(typeName in this.scalars)) {
      if (this.isEnumType(field)) {
        return field.isList ? this.getListType(typeName, field) : typeName;
      }
      const typeNameStr = `${typeName}Model`;
      return field.isList ? this.getListType(typeNameStr, field) : typeNameStr;
    }

    if (this.isModelType(field)) {
      const modelType = this.modelMap[typeName];
      const typeNameStr = this.generateModelTypeDeclarationName(modelType);
      return field.isList ? this.getListType(typeNameStr, field) : typeNameStr;
    }

    let nativeType = super.getNativeType(field);

    if (this.isEnumType(field)) {
      const typeNameString = `${nativeType} | keyof typeof ${this.getEnumName(this.enumMap[typeName])}`;
      nativeType = field.isList ? this.getListType(typeNameString, field) : typeNameString;
    }

    return nativeType;
  }

  protected generateInterfaceDeclaration(modelObj: CodeGenInterface): string {
    const modelName = `${modelObj.name}Model`;
    const modelDeclarations = new TypeScriptDeclarationBlock().asKind('class').withName(modelName).export(true);
    modelObj.fields.forEach((field) => {
      modelDeclarations.addProperty(this.getFieldName(field), this.getNativeType(field), undefined, 'DEFAULT', {
        readonly: false,
        optional: field.isList ? field.isListNullable : field.isNullable,
      });
    });
    return modelDeclarations.string.replace('export class', 'export interface');
  }
}
