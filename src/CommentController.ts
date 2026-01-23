import * as vscode from "vscode";
import * as ts from "typescript";
import {JSDOM} from "jsdom";
export class CommentController {
  editor: vscode.TextEditor;
  constructor(editor: vscode.TextEditor) {
    this.editor = editor;
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
        return false;
      } else {
        return true;
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
      if (comments && comments.length > 0) {
        cb(comments);
      } else {
        //无注释
        cb();
      }
    }
  }
  addComment(stmt: ts.Node, comments: string[]) {
    ts.addSyntheticLeadingComment(stmt, ts.SyntaxKind.MultiLineCommentTrivia, "*" + comments.join("\n"), true);
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
      this.addComment(stmt, comments);
    };
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
}
