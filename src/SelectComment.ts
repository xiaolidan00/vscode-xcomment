import * as vscode from "vscode";
import * as ts from "typescript";

function checkDocs(node: ts.Node, sourceFile: ts.SourceFile, cb: (msg?: string[]) => void) {
  //@ts-ignore
  if (node.jsDoc && node.jsDoc.length > 0) {
    //有jsDoc
    console.log("已有jsDoc，无需添加");
  } else {
    const comments: string[] = [];
    const leadingComments = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
    if (leadingComments) {
      leadingComments.forEach((comment) => {
        const s = sourceFile.text.substring(comment.pos, comment.end);
        comments.push(s.replace(/[\*\/]+/g, ""));
      });
    }
    if (comments && comments.length > 0) {
      console.log("有注释，", comments.join("\n"));
      cb(comments);
    } else {
      //无注释
      cb();
    }
  }
}

function addComment(stmt: ts.Node, comments: string[]) {
  ts.addSyntheticLeadingComment(stmt, ts.SyntaxKind.MultiLineCommentTrivia, "*" + comments.join("\n"), true);
}
function getFunComments(
  stmt: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.ConstructorDeclaration
): string[] {
  const comments: string[] = [];

  //参数
  if (stmt.parameters) {
    stmt.parameters.forEach((param) => {
      comments.push(
        ` * @param ${param.type ? `{${param.type.getText()}}` : "{any}"} ${param.name.getText()} - description`
      );
    });
  }
  //返回值
  if (stmt.type && stmt.type.kind !== ts.SyntaxKind.VoidKeyword) {
    comments.push(` * @returns {${stmt.type.getText() || "any"}} description`);
  } else {
    comments.push(` * @returns {any} description`);
  }
  return comments;
}
function addDocFun(stmt: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ConstructorDeclaration) {
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
    comments.push(...getFunComments(stmt));
    addComment(stmt, comments);
  };
}

export function addSelectComment() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor found.");
    return;
  }
  if (
    editor.document.languageId !== "typescript" &&
    editor.document.languageId !== "javascript" &&
    editor.document.languageId !== "typescriptreact" &&
    editor.document.languageId !== "javascriptreact" &&
    editor.document.languageId !== "vue"
  ) {
    vscode.window.showInformationMessage("The active document is not a TypeScript or JavaScript file.");
    return;
  }
  const text = editor.document.getText();
  const sourceFile = ts.createSourceFile(
    editor.document.fileName,
    text,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS
  );

  sourceFile.statements.forEach((stmt, idx) => {
    if (ts.isFunctionDeclaration(stmt)) {
      //函数fucntion test(a:number,b:number):number{return a+b;}

      checkDocs(stmt, sourceFile, addDocFun(stmt));
    } else if (
      ts.isVariableStatement(stmt) &&
      //@ts-ignore
      stmt.declarationList &&
      //@ts-ignore
      ts.isVariableDeclarationList(stmt.declarationList)
    ) {
      //@ts-ignore
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
            //参数
            const func = declaration.initializer;
            if (func && (ts.isFunctionDeclaration(func) || ts.isArrowFunction(func))) {
              comments.push(...getFunComments(func));
            }
            addComment(stmt, comments);
          };
          checkDocs(declaration, sourceFile, addDoc);
        } else if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
          //对象字面量
          // var obj={a:1,
          // func1:function(x:number):number{return x;},
          // func2:(y:string):string=>{return y;}}
          declaration.initializer.properties.forEach((prop) => {
            if (ts.isMethodDeclaration(prop) || ts.isMethodSignature(prop)) {
              checkDocs(prop, sourceFile, addDocFun(prop));
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
                    comments.push(...getFunComments(func));
                  }
                  addComment(prop, comments);
                };
                checkDocs(prop, sourceFile, addDoc);
              } else {
                const addDoc = (msg?: string[]) => {
                  const comments: string[] = [];
                  if (msg) {
                    comments.push(...msg.map((line) => ` * ${line}`));
                  } else {
                    comments.push(` * description`);
                  }

                  addComment(prop, comments);
                };
                checkDocs(prop, sourceFile, addDoc);
              }
            }
          });
        }
      });
    } else if (ts.isClassDeclaration(stmt)) {
      //类 class Test{
      // name:string;
      // constructor(name:string){this.name=name;}
      // getName():string{return this.name;}}
      stmt.members.forEach((member) => {
        if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
          checkDocs(member, sourceFile, addDocFun(member));
        } else {
          const addDoc = (msg?: string[]) => {
            const comments: string[] = [];
            if (msg) {
              comments.push(...msg.map((line) => ` * ${line}`));
            } else {
              comments.push(` * description`);
            }

            addComment(member, comments);
          };
          checkDocs(member, sourceFile, addDoc);
        }
      });
    }
  });
  // 打印结果
  const printer = ts.createPrinter({newLine: ts.NewLineKind.LineFeed});

  const printed = printer.printFile(sourceFile);
  //   console.log(printed);
  editor.edit((editBuilder) => {
    const firstLine = editor.document.lineAt(0);
    const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
    const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
    editBuilder.replace(textRange, printed);
  });
}
