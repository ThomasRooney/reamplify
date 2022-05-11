import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import gql from 'graphql-tag';
import { TypeFormatFlags } from 'typescript';
import { CLIEngine, ESLint } from 'eslint';
import LintResult = CLIEngine.LintResult;

function isNodeExported(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
}

interface DocEntry {
  name?: string;
  fileName?: string;
  documentation?: string;
  type?: string;
  constructors?: DocEntry[];
  parameters?: DocEntry[];
  returnType?: string;
}

const getExportedIdentifiers = (filePath: string): DocEntry[] => {
  const program = ts.createProgram([filePath], { allowJs: true });
  const sourceFile = program.getSourceFile(filePath);
  const checker = program.getTypeChecker();

  const output: DocEntry[] = [];

  if (!sourceFile) {
    return output;
  }

  /** Serialize a symbol into a json object */
  function serializeSymbol(symbol: ts.Symbol): DocEntry {
    return {
      name: symbol.getName(),
      documentation: ts.displayPartsToString(symbol.getDocumentationComment(checker)),
      type: checker.typeToString(
        checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!),
        undefined,
        TypeFormatFlags.NoTruncation
      ),
    };
  }

  function serializeSignature(signature: ts.Signature) {
    return {
      parameters: signature.parameters.map(serializeSymbol),
      returnType: checker.typeToString(signature.getReturnType()),
      documentation: ts.displayPartsToString(signature.getDocumentationComment(checker)),
    };
  }

  function serializeClass(symbol: ts.Symbol) {
    let details = serializeSymbol(symbol);

    // Get the construct signatures
    let constructorType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);
    details.constructors = constructorType.getConstructSignatures().map(serializeSignature);
    return details;
  }

  function visit(node: ts.Node) {
    if (ts.isModuleDeclaration(node)) {
      // This is a namespace, visit its children
      ts.forEachChild(node, visit);
      return;
    }
    // console.log("VISIT:",printer.printNode(ts.EmitHint.Unspecified, node, sourceFile!)) + "\n";

    // special case lacks modifier for Export
    if (ts.isExportAssignment(node)) {
      const symbol = checker.getSymbolAtLocation(node.expression);
      if (symbol) {
        const serialized = serializeSymbol(symbol);
        if (!node.isExportEquals) {
          serialized.name = 'default';
        }
        output.push(serialized);
      }
    }

    if (!isNodeExported(node)) {
      return;
    }

    if (ts.isClassDeclaration(node) && node.name) {
      // This is a top level class, get its symbol
      const symbol = checker.getSymbolAtLocation(node.name);
      if (symbol) {
        output.push(serializeClass(symbol));
      }
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      const symbol = checker.getSymbolAtLocation(node.name);
      if (symbol) {
        output.push(serializeSymbol(symbol));
      }
    } else if (ts.isExportDeclaration(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol) {
        output.push(serializeSymbol(symbol));
      }
    } else if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach((declarationNode) => {
        const symbol = checker.getSymbolAtLocation(declarationNode.name);
        if (symbol) {
          output.push(serializeSymbol(symbol));
        }
      });
    }
  }
  ts.forEachChild(sourceFile, visit);

  return output;
};

async function generateTags() {
  const graphqlFolderPath = path.resolve(__dirname, '..', 'lib', 'graphql');
  const outputFile = path.resolve(__dirname, '..', 'lib', 'graphql', 'tags.ts');
  const tsFiles = fs.readdirSync(graphqlFolderPath).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  const fBuffer: string[] = [];
  process.stdout.write(`Generating tags from ${graphqlFolderPath} into ${outputFile} .. `);
  const eslint = new ESLint({ cwd: path.resolve(__dirname, '..'), fix: true });

  for (const fileName of tsFiles) {
    if (fileName === 'tags.ts') {
      continue;
    }
    const file = path.resolve(graphqlFolderPath, fileName);
    getExportedIdentifiers(file).forEach(({ name, type }) => {
      if (typeof type === 'string' && typeof name === 'string') {
        let raw: string = '';
        try {
          raw = JSON.parse(type).replace(/\\n/g, '').replace(/\s\s+/g, ' ').trim();

          const taggedQuery = gql(raw) as any;
          const responseKey = taggedQuery?.definitions?.[0]?.selectionSet?.selections?.[0].name?.value;
          if (!responseKey) {
            return;
          }
          fBuffer.push(`export const ${name}ResponseKey = "${responseKey}"`);
        } catch (e) {
          console.log('error with graphql statement', raw || type);
        }
      }
    });
  }
  const modelOutputResults: LintResult[] = await eslint.lintText(fBuffer.join('\n'), {
    filePath: outputFile,
  });

  if (!modelOutputResults[0]?.output) {
    throw new Error('Expected 1 result from linting');
  }

  fs.writeFileSync(outputFile, modelOutputResults[0].output);
  process.stdout.write(`Done\n`);
}

generateTags();
