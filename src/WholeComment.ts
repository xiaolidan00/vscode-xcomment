import * as vscode from "vscode";
import * as ts from "typescript";
import {JSDOM} from "jsdom";

function checkDocs(node: ts.Node, sourceFile: ts.SourceFile, cb: (msg?: string[]) => void) {
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
    if (comments && comments.length > 0) {
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
        ` * @param ${param.type ? `{${param.type.getText()}}` : "{any}"} ${param.name.getText()} - description`
      );
    });
  }
  //返回值
  if (stmt.type) {
    if (stmt.type.kind !== ts.SyntaxKind.VoidKeyword) {
      comments.push(` * @returns {${stmt.type.getText() || "any"}} description`);
    }
  } else {
    comments.push(` * @returns {any} description`);
  }
  return comments;
}

function addDocProp(prop: ts.Node) {
  return (msg?: string[]) => {
    const comments: string[] = [];
    if (msg) {
      comments.push(...msg.map((line) => ` * ${line}`));
    } else {
      comments.push(` * description`);
    }

    addComment(prop, comments);
  };
}
function addDocFun(
  stmt: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ConstructorDeclaration | ts.MethodSignature
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
    comments.push(...getFunComments(stmt));
    addComment(stmt, comments);
  };
}
function dealSource(sourceFile: ts.SourceFile) {
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
            if (ts.isMethodDeclaration(prop)) {
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
                checkDocs(prop, sourceFile, addDocProp(prop));
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
          checkDocs(member, sourceFile, addDocProp(member));
        }
      });
    } else if (ts.isInterfaceDeclaration(stmt)) {
      //   interface Animal {
      //   species: string;
      //   makeSound(): string;
      // }
      checkDocs(stmt, sourceFile, addDocProp(stmt));

      stmt.members.forEach((member) => {
        if (ts.isMethodSignature(member)) {
          checkDocs(member, sourceFile, addDocFun(member));
        } else {
          checkDocs(member, sourceFile, addDocProp(member));
        }
      });
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      checkDocs(stmt, sourceFile, addDocProp(stmt));
      if (stmt.type && ts.isTypeLiteralNode(stmt.type)) {
        stmt.type.members.forEach((member) => {
          if (ts.isMethodSignature(member)) {
            checkDocs(member, sourceFile, addDocFun(member));
          } else {
            checkDocs(member, sourceFile, addDocProp(member));
          }
        });
      }
    }
  });
}
export function replaceText(printed: string, editor: vscode.TextEditor) {
  editor.edit((editBuilder) => {
    const firstLine = editor.document.lineAt(0);
    const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
    const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
    editBuilder.replace(textRange, printed);
  });
}
export function addWholeComment() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor found.");
    return;
  }
  const doc = editor.document;
  console.log(doc.fileName, doc.languageId);
  const fileName = doc.fileName;
  if (!/\.(ts|js|vue)$/.test(fileName)) {
    vscode.window.showInformationMessage("The active document is not a TypeScript or JavaScript file.");
    return;
  }
  let text = doc.getText();

  if (fileName.endsWith(".vue")) {
    const dom = new JSDOM(`<html><body>${text}</body></html>`, {
      contentType: "text/html"
    });
    const script = dom.window.document.querySelector("script");
    if (script) {
      text = script.textContent;
      if (!text) return;
      const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

      dealSource(sourceFile);
      const printer = ts.createPrinter({newLine: ts.NewLineKind.LineFeed});
      let printed = printer.printFile(sourceFile);
      script.textContent = "\n" + printed;
      replaceText(dom.window.document.body.innerHTML, editor);
    }
  } else {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

    dealSource(sourceFile);

    const printer = ts.createPrinter({newLine: ts.NewLineKind.LineFeed});

    const printed = printer.printFile(sourceFile);
    replaceText(printed, editor);
    //   console.log(printed);
  }
}
