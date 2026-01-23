import * as vscode from 'vscode';
import * as ts from 'typescript';
import { JSDOM } from 'jsdom';
export class CommentController {
  editor: vscode.TextEditor;
  newNodeMap = new Map<ts.Node, ts.Node>();
  constructor(editor: vscode.TextEditor) {
    this.editor = editor;
  }
  clear() {
    this.newNodeMap.clear();
  }
  /** 检查是否有错误 */
  checkError() {
    const editor = this.editor;
    if (editor) {
      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);

      const hasSyntaxError = diagnostics.some(
        (d) =>
          d.severity === vscode.DiagnosticSeverity.Error &&
          (/syntax|unexpected|expected/i.test(d.message) ||
            (d.code && typeof d.code === 'string' && d.code.toLowerCase().includes('syntax')))
      );
      if (hasSyntaxError) {
        return true;
      } else {
        return false;
      }
    }
    return false;
  }

  checkDocs(node: ts.Node, sourceFile: ts.SourceFile, cb: (msg?: string[]) => void) {
    //@ts-ignore
    if (node.jsDoc && node.jsDoc.length > 0) {
      //有jsDoc
    } else {
      const comments: string[] = [];
      const leadingComments = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
      if (leadingComments) {
        leadingComments.forEach((comment) => {
          const s = sourceFile.text.substring(comment.pos, comment.end);
          comments.push(s.replace(/[\*\/]+/g, ''));
        });
      }
      const tailingComments = ts.getTrailingCommentRanges(sourceFile.text, node.end);
      if (tailingComments) {
        tailingComments.forEach((comment) => {
          const s = sourceFile.text.substring(comment.pos, comment.end);
          comments.push(s.replace(/[\*\/]+/g, ''));
        });
      }

      if (comments && comments.length > 0) {
        cb(comments);
      } else {
        //无注释
        cb();
      }
    }
  }
  addComment(stmt: ts.Node, comments: string[]) {
    let newStmt;
    if (ts.isFunctionDeclaration(stmt)) {
      newStmt = ts.factory.createFunctionDeclaration(
        stmt.modifiers,
        stmt.asteriskToken,
        stmt.name,
        stmt.typeParameters,
        stmt.parameters,
        stmt.type,
        stmt.body
      );
    } else if (ts.isMethodDeclaration(stmt)) {
      newStmt = ts.factory.createMethodDeclaration(
        stmt.modifiers,
        stmt.asteriskToken,
        stmt.name,
        stmt.questionToken,
        stmt.typeParameters,
        stmt.parameters,
        stmt.type,
        stmt.body
      );
    } else if (ts.isArrowFunction(stmt)) {
      newStmt = ts.factory.createArrowFunction(
        stmt.modifiers,
        stmt.typeParameters,
        stmt.parameters,
        stmt.type,
        stmt.equalsGreaterThanToken,
        stmt.body
      );
    } else if (ts.isConstructorDeclaration(stmt)) {
      newStmt = ts.factory.createConstructorDeclaration(stmt.modifiers, stmt.parameters, stmt.body);
    } else if (ts.isMethodSignature(stmt)) {
      newStmt = ts.factory.createMethodSignature(
        stmt.modifiers,
        stmt.name,
        stmt.questionToken,
        stmt.typeParameters,
        stmt.parameters,
        stmt.type
      );
    } else if (ts.isPropertyDeclaration(stmt)) {
      /**props */
      newStmt = ts.factory.createPropertyDeclaration(
        stmt.modifiers,
        stmt.name,
        stmt.questionToken,
        stmt.type,
        stmt.initializer
      );
    } else if (ts.isPropertyAssignment(stmt)) {
      newStmt = ts.factory.createPropertyAssignment(stmt.name, stmt.initializer);
    } else if (ts.isVariableStatement(stmt)) {
      newStmt = ts.factory.createVariableStatement(stmt.modifiers, stmt.declarationList);
    } else if (ts.isCallExpression(stmt)) {
      newStmt = ts.factory.createCallExpression(
        stmt.expression,
        stmt.typeArguments,
        stmt.arguments
      );
    } else if (ts.isPropertySignature(stmt)) {
      newStmt = ts.factory.createPropertySignature(
        stmt.modifiers,
        stmt.name,
        stmt.questionToken,
        stmt.type
      );
    } else if (ts.isInterfaceDeclaration(stmt)) {
      newStmt = ts.factory.createInterfaceDeclaration(
        stmt.modifiers,
        stmt.name,
        stmt.typeParameters,
        stmt.heritageClauses,
        stmt.members
      );
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      newStmt = ts.factory.createTypeAliasDeclaration(
        stmt.modifiers,
        stmt.name,
        stmt.typeParameters,
        stmt.type
      );
    }
    if (newStmt) {
      ts.addSyntheticLeadingComment(
        newStmt,
        ts.SyntaxKind.MultiLineCommentTrivia,
        '*' + comments.join('\n'),
        true
      );
      this.newNodeMap.set(stmt, newStmt);
    }
  }
  getFunComments(
    stmt:
      | ts.FunctionDeclaration
      | ts.MethodDeclaration
      | ts.ArrowFunction
      | ts.ConstructorDeclaration
      | ts.MethodSignature
  ): string[] {
    const comments: string[] = [];

    //参数
    if (stmt.parameters) {
      stmt.parameters.forEach((param) => {
        comments.push(
          ` * @param ${param.type ? `{${param.type.getText()}}` : '{any}'} ${param.name.getText()} - description`
        );
      });
    }
    //返回值
    if (stmt.type) {
      if (stmt.type.kind !== ts.SyntaxKind.VoidKeyword) {
        comments.push(` * @returns {${stmt.type.getText() || 'any'}} description`);
      }
    } else {
      comments.push(` * @returns {any} description`);
    }
    return comments;
  }
  addDocProp(prop: ts.Node) {
    return (msg?: string[]) => {
      const comments: string[] = [];
      if (msg) {
        comments.push(...msg.map((line) => ` * ${line}`));
      } else {
        comments.push(` * description`);
      }

      this.addComment(prop, comments);
    };
  }
  addDocFun(
    stmt:
      | ts.FunctionDeclaration
      | ts.MethodDeclaration
      | ts.ConstructorDeclaration
      | ts.MethodSignature
  ) {
    return (msg?: string[]) => {
      const comments: string[] = [];
      if (msg) {
        comments.push(...msg.map((line) => ` * ${line}`));
      } else {
        if (stmt.name) {
          comments.push(` * ${stmt.name.getText()} description`);
        } else {
          comments.push(` * Function description`);
        }
      }
      comments.push(...this.getFunComments(stmt));
      this.addComment(stmt, comments);
    };
  }
  commentMethod() {
    if (this.checkError()) {
      vscode.window.showErrorMessage('xComment:AST Parse Error');
      return;
    }
    const doc = this.editor.document;
    const fileName = doc.fileName;
    if (!/\.(ts|js|vue)$/.test(fileName)) {
      vscode.window.showInformationMessage(
        'The active document is not a TypeScript or JavaScript file.'
      );
      return;
    }
    let selectText = doc.getText(this.editor.selection);
    if (selectText) {
      let sourceFile = ts.createSourceFile(
        fileName,
        selectText,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TS
      );

      sourceFile = this.dealSourceMethod(sourceFile);

      const newSourceFile = this.transformSource(sourceFile);

      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

      const printed = printer.printFile(newSourceFile);
      this.replaceSelectText(printed);
    } else {
      let text = doc.getText();

      if (fileName.endsWith('.vue')) {
        const dom = new JSDOM(`<html><body>${text}</body></html>`, {
          contentType: 'text/html'
        });
        const script = dom.window.document.querySelector('script');
        if (script) {
          text = script.textContent;
          if (!text) return;
          let sourceFile = ts.createSourceFile(
            fileName,
            text,
            ts.ScriptTarget.ESNext,
            true,
            ts.ScriptKind.TS
          );

          sourceFile = this.dealSourceMethod(sourceFile);
          const newSourceFile = this.transformSource(sourceFile);
          const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
          let printed = printer.printFile(newSourceFile);
          script.textContent = '\n' + printed;
          this.replaceAllText(dom.window.document.body.innerHTML);
        }
      } else {
        let sourceFile = ts.createSourceFile(
          fileName,
          text,
          ts.ScriptTarget.ESNext,
          true,
          ts.ScriptKind.TS
        );

        this.dealSourceMethod(sourceFile);

        const newSourceFile = this.transformSource(sourceFile);

        const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

        const printed = printer.printFile(newSourceFile);
        this.replaceAllText(printed);
      }
    }
  }

  commentParams() {
    if (this.checkError()) {
      vscode.window.showErrorMessage('xComment:AST Parse Error');
      return;
    }
    const doc = this.editor.document;
    const fileName = doc.fileName;
    if (!/\.(ts|js|vue)$/.test(fileName)) {
      vscode.window.showInformationMessage(
        'The active document is not a TypeScript or JavaScript file.'
      );
      return;
    }
    let selectText = doc.getText(this.editor.selection);
    if (selectText) {
      let sourceFile = ts.createSourceFile(
        fileName,
        selectText,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TS
      );

      sourceFile = this.dealSourceParams(sourceFile);

      const newSourceFile = this.transformSource(sourceFile);

      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

      const printed = printer.printFile(newSourceFile);
      this.replaceSelectText(printed);
    } else {
      let text = doc.getText();

      if (fileName.endsWith('.vue')) {
        const dom = new JSDOM(`<html><body>${text}</body></html>`, {
          contentType: 'text/html'
        });
        const script = dom.window.document.querySelector('script');
        if (script) {
          text = script.textContent;
          if (!text) return;
          let sourceFile = ts.createSourceFile(
            fileName,
            text,
            ts.ScriptTarget.ESNext,
            true,
            ts.ScriptKind.TS
          );

          sourceFile = this.dealSourceParams(sourceFile);
          const newSourceFile = this.transformSource(sourceFile);
          const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
          let printed = printer.printFile(newSourceFile);
          script.textContent = '\n' + printed;
          this.replaceAllText(dom.window.document.body.innerHTML);
        }
      } else {
        let sourceFile = ts.createSourceFile(
          fileName,
          text,
          ts.ScriptTarget.ESNext,
          true,
          ts.ScriptKind.TS
        );

        sourceFile = this.dealSourceParams(sourceFile);

        const newSourceFile = this.transformSource(sourceFile);

        const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

        const printed = printer.printFile(newSourceFile);
        this.replaceAllText(printed);
      }
    }
  }
  dealSourceParams(sourceFile: ts.SourceFile) {
    sourceFile.statements.forEach((stmt) => {
      if (
        ts.isVariableStatement(stmt) &&
        stmt.declarationList &&
        ts.isVariableDeclarationList(stmt.declarationList)
      ) {
        stmt.declarationList.declarations.forEach((declaration) => {
          if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer)
          ) {
            // this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
            declaration.initializer.arguments.forEach((arg) => {
              if (ts.isObjectLiteralExpression(arg)) {
                arg.properties.forEach((prop) => {
                  this.checkDocs(prop, sourceFile, this.addDocProp(prop));
                });
              }
            });
          }
        });
      } else if (ts.isInterfaceDeclaration(stmt)) {
        // this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));

        stmt.members.forEach((member) => {
          if (ts.isPropertySignature(member)) {
            this.checkDocs(member, sourceFile, this.addDocProp(member));
          }
        });
      } else if (ts.isTypeAliasDeclaration(stmt)) {
        // this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
        if (stmt.type && ts.isTypeLiteralNode(stmt.type)) {
          stmt.type.members.forEach((member) => {
            if (ts.isPropertySignature(member)) {
              this.checkDocs(member, sourceFile, this.addDocProp(member));
            }
          });
        }
      } else if (ts.isClassDeclaration(stmt)) {
        // this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
        stmt.members.forEach((member) => {
          if (ts.isPropertyDeclaration(member)) {
            this.checkDocs(member, sourceFile, this.addDocProp(member));
          }
        });
      }
    });
    return sourceFile;
  }

  dealSourceMethod(sourceFile: ts.SourceFile) {
    sourceFile.statements.forEach((stmt) => {
      if (ts.isFunctionDeclaration(stmt)) {
        this.checkDocs(stmt, sourceFile, this.addDocFun(stmt));
      } else if (
        ts.isVariableStatement(stmt) &&
        stmt.declarationList &&
        ts.isVariableDeclarationList(stmt.declarationList)
      ) {
        stmt.declarationList.declarations.forEach((declaration) => {
          if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer &&
            (ts.isFunctionDeclaration(declaration.initializer) ||
              ts.isArrowFunction(declaration.initializer))
          ) {
            const addDoc = (msg?: string[]) => {
              const comments: string[] = [];
              if (msg) {
                comments.push(...msg.map((line) => ` * ${line}`));
              }
              //参数
              const func = declaration.initializer;
              if (func && (ts.isFunctionDeclaration(func) || ts.isArrowFunction(func))) {
                comments.push(...this.getFunComments(func));
              }
              this.addComment(stmt, comments);
            };
            this.checkDocs(declaration, sourceFile, addDoc);
          } else if (
            declaration.initializer &&
            ts.isObjectLiteralExpression(declaration.initializer)
          ) {
            declaration.initializer.properties.forEach((prop) => {
              if (ts.isMethodDeclaration(prop)) {
                this.checkDocs(prop, sourceFile, this.addDocFun(prop));
              } else if (ts.isPropertyAssignment(prop)) {
                const initializer = prop.initializer;
                if (ts.isFunctionDeclaration(initializer) || ts.isArrowFunction(initializer)) {
                  const addDoc = (msg?: string[]) => {
                    const comments: string[] = [];
                    if (msg) {
                      comments.push(...msg.map((line) => ` * ${line}`));
                    }
                    //参数
                    const func = initializer;
                    if (func && (ts.isFunctionDeclaration(func) || ts.isArrowFunction(func))) {
                      comments.push(...this.getFunComments(func));
                    }
                    this.addComment(prop, comments);
                  };
                  this.checkDocs(prop, sourceFile, addDoc);
                }
              }
            });
          }
        });
      } else if (ts.isClassDeclaration(stmt)) {
        stmt.members.forEach((member) => {
          if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
            this.checkDocs(member, sourceFile, this.addDocFun(member));
          }
        });
      } else if (ts.isInterfaceDeclaration(stmt)) {
        stmt.members.forEach((member) => {
          if (ts.isMethodSignature(member)) {
            this.checkDocs(member, sourceFile, this.addDocFun(member));
          }
        });
      } else if (ts.isTypeAliasDeclaration(stmt)) {
        if (stmt.type && ts.isTypeLiteralNode(stmt.type)) {
          stmt.type.members.forEach((member) => {
            if (ts.isMethodSignature(member)) {
              this.checkDocs(member, sourceFile, this.addDocFun(member));
            }
          });
        }
      }
    });

    return sourceFile;
  }
  transformSource(sourceFile: ts.SourceFile) {
    const nodeMaps = this.newNodeMap;
    //@ts-ignore
    const tfactory: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const visitor: ts.Visitor = (node) => {
        // 我们只处理 FunctionDeclaration，且有 name（避免匿名）
        if (nodeMaps.has(node)) {
          console.log('newNode');
          return nodeMaps.get(node);
        }
        // 默认行为：继续遍历子节点
        return ts.visitEachChild(node, visitor, context);
      };

      return (node) => ts.visitNode(node, visitor);
    };
    const result = ts.transform(sourceFile, [tfactory]);

    return result.transformed[0];
  }
  replaceAllText(printed: string) {
    const editor = this.editor;
    editor.edit((editBuilder) => {
      const firstLine = editor.document.lineAt(0);
      const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
      const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
      editBuilder.replace(textRange, printed);
    });
  }
  replaceSelectText(newText: string) {
    const editor = this.editor;
    editor.edit((editBuilder) => {
      const selection = editor.selection;
      editBuilder.replace(selection, newText);
    });
  }
}
