import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "vscode-xcomment" is now active!');

  const disposable = vscode.commands.registerCommand("vscode-xcomment.helloWorld", () => {
    vscode.window.showInformationMessage("Hello World from vscode-xcomment!");
  });

  context.subscriptions.push(disposable);
}
export function deactivate() {}
