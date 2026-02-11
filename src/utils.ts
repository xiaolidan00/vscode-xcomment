import * as vscode from 'vscode';
/** 检查是否有语法错误 */
export function checkError(editor: vscode.TextEditor) {
  const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
  const hasSyntaxError = diagnostics.some(
    (d) =>
      d.severity === vscode.DiagnosticSeverity.Error &&
      (/syntax|unexpected|expected/i.test(d.message) ||
        (d.code && typeof d.code === 'string' && d.code.toLowerCase().includes('syntax')))
  );
  if (hasSyntaxError) {
    return true;
  }

  return false;
}

export function checkFile(editor: vscode.TextEditor) {
  const doc = editor.document;
  const fileName = doc.fileName;
  if (/\.(ts|js|vue|jsx|tsx)$/.test(fileName)) {
    return true;
  }
  return false;
}
