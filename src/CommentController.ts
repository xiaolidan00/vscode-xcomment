import * as vscode from "vscode";
import * as ts from "typescript";

export class CommentController {
  editor: vscode.TextEditor;
  commentList: Array<[number, number, string]> = [];
  sourceLines: Array<[number, number, string]> = [];
  constructor(editor: vscode.TextEditor) {
    this.editor = editor;
  }
  clear() {
    this.commentList = [];
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
            (d.code && typeof d.code === "string" && d.code.toLowerCase().includes("syntax")))
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
          comments.push(s.replace(/[\*\/]+/g, ""));
        });
      }
      const tailingComments = ts.getTrailingCommentRanges(sourceFile.text, node.end);
      if (tailingComments) {
        tailingComments.forEach((comment) => {
          const s = sourceFile.text.substring(comment.pos, comment.end);
          comments.push(s.replace(/[\*\/]+/g, ""));
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

  addNodeComment(node: ts.Node, comments: string[]) {
    ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, "*" + comments.join("\n"), true);
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
          ` * @param ${param.type ? `{${param.type.getText().replace(/\s/g, "")}}` : "{any}"} ${param.name.getText().replace(/\s/g, "")} - description`
        );
      });
    }
    //返回值
    if (stmt.type) {
      if (stmt.type.kind !== ts.SyntaxKind.VoidKeyword) {
        comments.push(` * @returns {${stmt.type.getText().replace(/\s/g, "") || "any"}} description`);
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

      this.addNodeComment(prop, comments);
    };
  }
  addDocFun(stmt: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ConstructorDeclaration | ts.MethodSignature) {
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
      this.addNodeComment(stmt, comments);
    };
  }
  printCode(sourceFile: ts.SourceFile) {
    const printer = ts.createPrinter({newLine: ts.NewLineKind.LineFeed});

    const printed = printer.printFile(sourceFile);
    return printed;
  }
  commentMethod() {
    if (this.checkError()) {
      vscode.window.showErrorMessage("xComment:AST Parse Error");
      return;
    }
    const doc = this.editor.document;
    const fileName = doc.fileName;
    if (!/\.(ts|js|vue)$/.test(fileName)) {
      vscode.window.showInformationMessage("The active document is not a TypeScript or JavaScript file.");
      return;
    }
    let selectText = doc.getText(this.editor.selection);
    if (selectText) {
      let sourceFile = ts.createSourceFile(fileName, selectText, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

      sourceFile = this.dealSourceMethod(sourceFile);

      const newText = this.printCode(sourceFile);
      this.replaceSelectText(newText);
    } else {
      const text = doc.getText();

      if (fileName.endsWith(".vue")) {
        let startIndex = text.indexOf("<script");
        let endIndex = text.indexOf("</script>");
        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
          return;
        }
        for (let i = startIndex; i < endIndex; i++) {
          const c = text[i];
          if (c === ">") {
            startIndex = i + 1;
            break;
          }
        }
        const script = text.substring(startIndex, endIndex);
        if (script) {
          if (!text) return;
          let sourceFile = ts.createSourceFile(fileName, script, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

          sourceFile = this.dealSourceMethod(sourceFile);
          const code = this.printCode(sourceFile);

          const newText = text.substring(0, startIndex) + +"\n" + code + text.substring(endIndex);

          this.replaceAllText(newText);
        }
      } else {
        let sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

        this.dealSourceMethod(sourceFile);

        const newText = this.printCode(sourceFile);
        this.replaceAllText(newText);
      }
    }
  }

  commentParams() {
    if (this.checkError()) {
      vscode.window.showErrorMessage("xComment:AST Parse Error");
      return;
    }
    const doc = this.editor.document;
    const fileName = doc.fileName;
    if (!/\.(ts|js|vue)$/.test(fileName)) {
      vscode.window.showInformationMessage("The active document is not a TypeScript or JavaScript file.");
      return;
    }
    let selectText = doc.getText(this.editor.selection);
    if (selectText) {
      let sourceFile = ts.createSourceFile(fileName, selectText, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

      sourceFile = this.dealSourceParams(sourceFile);

      const newText = this.printCode(sourceFile);
      this.replaceSelectText(newText);
    } else {
      let text = doc.getText();

      if (fileName.endsWith(".vue")) {
        let startIndex = text.indexOf("<script");
        let endIndex = text.indexOf("</script>");
        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
          return;
        }
        for (let i = startIndex; i < endIndex; i++) {
          const c = text[i];
          if (c === ">") {
            startIndex = i + 1;
            break;
          }
        }
        const script = text.substring(startIndex, endIndex);
        if (script) {
          if (!text) return;
          let sourceFile = ts.createSourceFile(fileName, script, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

          sourceFile = this.dealSourceParams(sourceFile);
          const code = this.printCode(sourceFile);
          const newText = text.substring(0, startIndex) + "\n" + code + text.substring(endIndex);

          this.replaceAllText(newText);
        }
      } else {
        let sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

        sourceFile = this.dealSourceParams(sourceFile);

        const newText = this.printCode(sourceFile);
        this.replaceAllText(newText);
      }
    }
  }
  getSourceLines(text: string) {
    const lines = text.split("\n");
    if (lines.length) {
      const list: Array<[number, number, string]> = [];
      let pre = 0;
      lines.forEach((line, idx) => {
        list.push([pre + idx, pre + idx + line.length, line]);
        pre += line.length;
      });
      this.sourceLines = list;
    }
  }
  findLine(pos: number) {
    for (let i = 0; i < this.sourceLines.length; i++) {
      const item = this.sourceLines[i];
      if (pos >= item[0] && pos <= item[1]) {
        return i;
      }
    }
    return -1;
  }
  addCommentLine() {
    const doc = this.editor.document;
    const fileName = doc.fileName;
    if (!/\.(ts|js|vue)$/.test(fileName)) {
      vscode.window.showInformationMessage("The active document is not a TypeScript or JavaScript file.");
      return;
    }
    const text = doc.getText();
    const pos = this.editor.selection.active.line;
    this.getSourceLines(text);

    if (fileName.endsWith(".vue")) {
      let startIndex = text.indexOf("<script");
      let endIndex = text.indexOf("</script>");
      if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        return;
      }
      for (let i = startIndex; i < endIndex; i++) {
        const c = text[i];
        if (c === ">") {
          startIndex = i + 1;
          break;
        }
      }
      const item = this.sourceLines[pos];
      const p = item[0] + this.editor.selection.active.character;

      if (p < startIndex || p > endIndex) {
        vscode.window.showInformationMessage("xComment:Not in Js/Ts range");
        return;
      }
    }

    const linestr = this.sourceLines[pos][2];
    if (/^\s*$/.test(linestr)) {
      this.editor.edit((editBuilder) => {
        editBuilder.insert(this.editor.selection.active, "/** description */");
      });
    } else {
      const spaces: string[] = [];
      for (let i = 0; i < linestr.length; i++) {
        if (/\s/.test(linestr[i])) {
          spaces.push(linestr[i]);
        } else {
          break;
        }
      }
      this.editor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(pos, 0), spaces.join("") + "/** description */\n");
      });
    }
  }
  dealSourceParams(sourceFile: ts.SourceFile) {
    sourceFile.statements.forEach((stmt) => {
      if (ts.isVariableStatement(stmt) && stmt.declarationList && ts.isVariableDeclarationList(stmt.declarationList)) {
        stmt.declarationList.declarations.forEach((declaration) => {
          if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer)
          ) {
            this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
            if (!declaration.initializer.typeArguments) {
              declaration.initializer.arguments.forEach((arg) => {
                if (ts.isObjectLiteralExpression(arg)) {
                  arg.properties.forEach((prop) => {
                    this.checkDocs(prop, sourceFile, this.addDocProp(prop));
                  });
                }
              });
            }
          }
        });
      } else if (ts.isInterfaceDeclaration(stmt)) {
        this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));

        stmt.members.forEach((member) => {
          if (ts.isPropertySignature(member)) {
            this.checkDocs(member, sourceFile, this.addDocProp(member));
          }
        });
      } else if (ts.isTypeAliasDeclaration(stmt)) {
        this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
        if (stmt.type && ts.isTypeLiteralNode(stmt.type)) {
          stmt.type.members.forEach((member) => {
            if (ts.isPropertySignature(member)) {
              this.checkDocs(member, sourceFile, this.addDocProp(member));
            }
          });
        }
      } else if (ts.isClassDeclaration(stmt)) {
        this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
        stmt.members.forEach((member) => {
          if (ts.isPropertyDeclaration(member)) {
            this.checkDocs(member, sourceFile, this.addDocProp(member));
          }
        });
      } else if (ts.isExportAssignment(stmt) && ts.isObjectLiteralExpression(stmt.expression)) {
        stmt.expression.properties.forEach((member) => {
          if (ts.isPropertyAssignment(member)) {
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
            (ts.isFunctionDeclaration(declaration.initializer) || ts.isArrowFunction(declaration.initializer))
          ) {
            const addDoc = (msg?: string[]) => {
              const comments: string[] = [];
              if (msg) {
                comments.push(...msg.map((line) => ` * ${line}`));
              }
              const func = declaration.initializer;
              if (func && (ts.isFunctionDeclaration(func) || ts.isArrowFunction(func))) {
                comments.push(...this.getFunComments(func));
              }
              this.addNodeComment(stmt, comments);
            };
            this.checkDocs(declaration, sourceFile, addDoc);
          } else if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
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
                    const func = initializer;
                    if (func && (ts.isFunctionDeclaration(func) || ts.isArrowFunction(func))) {
                      comments.push(...this.getFunComments(func));
                    }
                    this.addNodeComment(stmt, comments);
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
      } else if (ts.isExportAssignment(stmt) && ts.isObjectLiteralExpression(stmt.expression)) {
        stmt.expression.properties.forEach((member) => {
          if (ts.isMethodDeclaration(member)) {
            this.checkDocs(member, sourceFile, this.addDocFun(member));
          } else if (ts.isPropertyAssignment(member) && ts.isArrowFunction(member.initializer)) {
            const addDoc = (msg?: string[]) => {
              const comments: string[] = [];
              if (msg) {
                comments.push(...msg.map((line) => ` * ${line}`));
              }
              const func = member.initializer;
              if (func && (ts.isFunctionDeclaration(func) || ts.isArrowFunction(func))) {
                comments.push(...this.getFunComments(func));
              }
              this.addNodeComment(stmt, comments);
            };
            this.checkDocs(member, sourceFile, addDoc);
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

  replaceAllText(printed: string) {
    // console.log("replaceAllText:", printed);
    const editor = this.editor;
    editor.edit((editBuilder) => {
      const firstLine = editor.document.lineAt(0);
      const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
      const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
      editBuilder.replace(textRange, printed);
    });
  }
  replaceSelectText(newText: string) {
    // console.log("replaceSelectText:", newText);
    const editor = this.editor;
    editor.edit((editBuilder) => {
      const selection = editor.selection;
      editBuilder.replace(selection, newText);
    });
  }
}
