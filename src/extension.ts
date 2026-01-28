import * as vscode from "vscode";
import * as ts from "typescript";
import {CommentController} from "./CommentController";

export function activate(ctx: vscode.ExtensionContext) {
  {
    const disposable = vscode.commands.registerCommand("vscode-xcomment.params", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const controller = new CommentController(editor);
        controller.commentParams();
      }
    });
    ctx.subscriptions.push(disposable);
  }
  {
    const disposable = vscode.commands.registerCommand("vscode-xcomment.method", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const controller = new CommentController(editor);
        controller.commentMethod();
      }
    });

    ctx.subscriptions.push(disposable);
  }
  {
    const disposable = vscode.commands.registerCommand("vscode-xcomment.add", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const controller = new CommentController(editor);
        controller.addCommentLine();
      }
    });

    ctx.subscriptions.push(disposable);
  }
}
export function deactivate() {}
