import * as vscode from 'vscode';

import { AddCommentController } from './AddComment';

import { checkError, checkFile } from './utils';

const PREFIX = 'vscode-xcomment';
//安装的时候
export function activate(context: vscode.ExtensionContext) {
  console.log(`Congratulations, your extension "${PREFIX}" is now active!`);

  //注册命令
  const disposable = vscode.commands.registerCommand(PREFIX + '.add', () => {
    //触发命令后执行

    //获取当前打开的编辑页面
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      //检查是否有语法错误
      if (checkError(editor)) {
        //右下角弹出错误提示信息
        vscode.window.showErrorMessage('语法错误是不执行添加注释的命令!');
        return;
      }
      //检查文件类型是否正确
      if (!checkFile(editor)) {
        vscode.window.showErrorMessage('文件必须是js/ts/vue');
        return;
      }
      //添加注释
      const ctrl = new AddCommentController(editor);
      ctrl.doAction();
      ctrl.clearAll();
    }
  });

  context.subscriptions.push(disposable);
}

//卸载的时候
export function deactivate() {}
