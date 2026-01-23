import * as vscode from "vscode";
import * as ts from "typescript";
import {addWholeComment} from "./WholeComment";
import {addSelectComment} from "./SelectComment";
export function activate(ctx: vscode.ExtensionContext) {
  {
    const disposable = vscode.commands.registerCommand("vscode-xcomment.wholeComment", () => {
      vscode.window.showInformationMessage("wholeComment vscode-xcomment!");
      addWholeComment();
    });
    ctx.subscriptions.push(disposable);
  }
  {
    const disposable = vscode.commands.registerCommand("vscode-xcomment.selectComment", () => {
      vscode.window.showInformationMessage("selectComment vscode-xcomment!");

      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
        console.log(diagnostics);
      }
    });

    ctx.subscriptions.push(disposable);
  }
}
export function deactivate() {}
